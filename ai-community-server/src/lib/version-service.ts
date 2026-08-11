import { prisma } from './prisma.js'
import type { Work, WorkVersion } from '@prisma/client'

// v1.3：服务端原子生成版本号
// 规则：v1, v2, v3 ...（递增序号，不复用已删除/已驳回的版本号）
// 实现：查询当前作品下最大版本号 + 1（数据库唯一约束 + 事务防并发）
export async function generateNextVersionNumber(workId: string): Promise<string> {
  const versions = await prisma.workVersion.findMany({
    where: { workId },
    select: { version: true },
  })
  // 提取数字部分取最大值
  const nums = versions
    .map((v) => parseInt(v.version.replace(/^v/i, ''), 10))
    .filter((n) => !Number.isNaN(n))
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1
  return `v${next}`
}

// v1.3：单候选版本限制
// 规则：一个作品同一时间最多存在一个活动候选版本（草稿或待审核状态）
export async function hasActiveCandidate(workId: string): Promise<boolean> {
  const count = await prisma.workVersion.count({
    where: {
      workId,
      status: { in: ['draft', 'pending'] },
    },
  })
  return count > 0
}

// v1.3：校验是否允许创建新版本
export async function canCreateNewVersion(work: Work): Promise<{ allowed: boolean; reason?: string }> {
  if (work.status === 'deleted') {
    return { allowed: false, reason: '作品已删除，无法创建新版本' }
  }
  if (await hasActiveCandidate(work.id)) {
    const active = await prisma.workVersion.findFirst({
      where: { workId: work.id, status: { in: ['draft', 'pending'] } },
    })
    const statusText = active?.status === 'pending' ? '待审核' : '草稿'
    return {
      allowed: false,
      reason: `该作品已有${statusText}版本 ${active?.version}，请先撤回、删除或等审核完成后才能创建新版本`,
    }
  }
  return { allowed: true }
}

// v1.3：审核通过三重校验
// 1. 校验作品未删除
// 2. base_version_id 追溯：编辑已发布作品生成的新版本，若创建时记录的 base_version_id 与当前线上版本不一致，
//    说明期间已有其他版本先通过 → 标记为已通过（过期），不执行替换
// 3. 已下架作品不自动上架：标记为候选版本，作品状态保持已下架
export type ApproveResult =
  | { type: 'published'; version: WorkVersion }
  | { type: 'candidate_base_outdated'; version: WorkVersion }
  | { type: 'candidate_work_offline'; version: WorkVersion }

export async function approveVersion(
  workId: string,
  version: string,
  reviewerId: string
): Promise<ApproveResult> {
  return await prisma.$transaction(async (tx) => {
    const work = await tx.work.findUnique({
      where: { id: workId },
      include: { versions: true },
    })
    if (!work) throw new Error('BUSINESS_作品不存在')
    // v1.3 校验 1：已删除作品禁止审核
    if (work.status === 'deleted') {
      throw new Error('BUSINESS_作品已删除，禁止审核')
    }
    const target = work.versions.find((v) => v.version === version)
    if (!target) throw new Error('BUSINESS_版本不存在')
    if (target.status !== 'pending') {
      throw new Error('BUSINESS_该版本不在待审核状态')
    }
    const claimed = await tx.workVersion.updateMany({
      where: { id: target.id, status: 'pending' },
      data: { status: 'reviewing' },
    })
    if (claimed.count !== 1) {
      throw new Error('BUSINESS_该版本已被其他审核员处理')
    }

    const now = new Date()
    const reviewedAt = now

    // v1.3 校验 2：base_version_id 追溯
    if (target.baseVersionId && work.currentVersion && target.baseVersionId !== work.currentVersion) {
      // 标记为已通过（过期），不执行替换
      const updated = await tx.workVersion.update({
        where: { id: target.id },
        data: {
          status: 'passed',
          current: false,
          candidate: false,
          reviewedAt,
          reviewerId,
        },
      })
      await tx.reviewEvent.create({
        data: {
          workId,
          workTitle: work.title,
          version,
          status: 'approved',
          reviewerId,
          isFirstVersion: false,
        },
      })
      return { type: 'candidate_base_outdated', version: updated }
    }

    // v1.3 校验 3：已下架作品不自动上架
    if (work.status === 'offline') {
      const updated = await tx.workVersion.update({
        where: { id: target.id },
        data: {
          status: 'passed',
          current: false,
          candidate: true,
          reviewedAt,
          reviewerId,
        },
      })
      await tx.reviewEvent.create({
        data: {
          workId,
          workTitle: work.title,
          version,
          status: 'approved',
          reviewerId,
          isFirstVersion: false,
        },
      })
      return { type: 'candidate_work_offline', version: updated }
    }

    // 校验通过：正常替换线上版本
    // 取消旧的 current 标记
    await tx.workVersion.updateMany({
      where: { workId, current: true, version: { not: version } },
      data: { current: false },
    })

    const updated = await tx.workVersion.update({
      where: { id: target.id },
      data: {
        status: 'passed',
        current: true,
        candidate: false,
        reviewedAt,
        reviewerId,
      },
    })

    // 首个版本通过 → 作品状态变为已发布
    const wasUnpublished = work.status === 'unpublished'
    const isFirstVersion = !work.versions.some((v) => v.status === 'passed' && v.version !== version)

    const tags = target.tagsJson ? JSON.parse(target.tagsJson) as string[] : []
    await tx.work.update({
      where: { id: workId },
      data: {
        status: wasUnpublished ? 'published' : work.status,
        publishedAt: wasUnpublished ? now : work.publishedAt,
        currentVersion: version,
        ...(target.title && { title: target.title }),
        ...(target.type && { type: target.type }),
        ...(target.category && { category: target.category }),
        ...(target.intro && { intro: target.intro }),
        ...(target.usage !== null && target.usage !== undefined && { usage: target.usage }),
        businessValue: target.businessValue,
        scene: target.scene,
        coreAbilities: target.coreAbilities,
        coverUrl: target.coverUrl,
        ...(tags.length > 0 && {
          tags: {
            set: [],
            connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })),
          },
        }),
      },
    })

    await tx.reviewEvent.create({
      data: {
        workId,
        workTitle: work.title,
        version,
        status: 'approved',
        reviewerId,
        isFirstVersion,
      },
    })

    return { type: 'published', version: updated }
  })
}

export async function publishApprovedCandidate(workId: string, versionId: string) {
  return prisma.$transaction(async (tx) => {
    const [work, candidate] = await Promise.all([
      tx.work.findUnique({ where: { id: workId } }),
      tx.workVersion.findUnique({ where: { id: versionId } }),
    ])
    if (!work || !candidate || candidate.workId !== workId) throw new Error('BUSINESS_候选版本不存在')
    if (work.status !== 'offline' || !candidate.candidate || candidate.status !== 'passed') {
      throw new Error('BUSINESS_候选版本当前不可上线')
    }
    const tags = candidate.tagsJson ? JSON.parse(candidate.tagsJson) as string[] : []
    await tx.workVersion.updateMany({ where: { workId, current: true }, data: { current: false } })
    await tx.workVersion.update({ where: { id: candidate.id }, data: { current: true, candidate: false } })
    await tx.work.update({
      where: { id: workId },
      data: {
        status: 'published',
        currentVersion: candidate.version,
        ...(candidate.title && { title: candidate.title }),
        ...(candidate.type && { type: candidate.type }),
        ...(candidate.category && { category: candidate.category }),
        ...(candidate.intro && { intro: candidate.intro }),
        ...(candidate.usage !== null && candidate.usage !== undefined && { usage: candidate.usage }),
        businessValue: candidate.businessValue,
        scene: candidate.scene,
        coreAbilities: candidate.coreAbilities,
        coverUrl: candidate.coverUrl,
        ...(tags.length > 0 && {
          tags: { set: [], connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) },
        }),
      },
    })
    return candidate
  })
}
