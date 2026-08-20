import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authRequired, requirePermission } from '../lib/auth.js'
import { approveVersion, publishApprovedCandidate } from '../lib/version-service.js'

const router = Router()

const createVersionSchema = z.object({
  // v1.3：v2 及以上版本必须填写更新说明
  changelog: z.string().trim().min(20, '更新说明至少 20 个字符').max(500, '更新说明不超过 500 个字符'),
})

// GET /api/works/:workId/versions —— 版本列表
router.get('/:workId/versions', authRequired, async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.workId } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    // 仅作者本人或审核管理员可查看全部版本
    if (work.authorId !== req.userId && !(req.userRoles || []).some((role) => ['reviewer', 'operator', 'super_admin'].includes(role))) {
      res.status(403).json({ error: '无权查看版本', code: 'FORBIDDEN' })
      return
    }
    const versions = await prisma.workVersion.findMany({
      where: { workId: req.params.workId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(versions)
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions —— 创建新版本
// v1.3：原子生成版本号 + 单候选版本限制 + base_version_id 记录
router.post('/:workId/versions', authRequired, requirePermission('work:submit'), async (req, res, next) => {
  try {
    const isSuperAdmin = (req.userRoles || []).includes('super_admin')
    const work = await prisma.work.findUnique({
      where: { id: req.params.workId },
      include: { tags: true, versions: { where: { current: true }, include: { attachments: true } } },
    })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除', code: 'BUSINESS_ERROR' })
      return
    }
    if (work.authorId !== req.userId && !isSuperAdmin) {
      res.status(403).json({ error: '无权为该作品创建版本', code: 'FORBIDDEN' })
      return
    }

    const { changelog } = createVersionSchema.parse(req.body)

    const version = await prisma.$transaction(async (tx) => {
      const active = await tx.workVersion.findFirst({
        where: { workId: work.id, status: { in: ['draft', 'pending'] } },
      })
      if (active) throw new Error(`BUSINESS_该作品已有${active.status === 'pending' ? '待审核' : '草稿'}版本 ${active.version}`)
      const allVersions = await tx.workVersion.findMany({ where: { workId: work.id }, select: { version: true } })
      const nextNumber = Math.max(0, ...allVersions.map((item) => Number(item.version.replace(/^v/i, '')) || 0)) + 1
      const current = work.versions[0]
      const created = await tx.workVersion.create({
        data: {
          workId: req.params.workId,
          version: `v${nextNumber}`,
          changelog,
          status: 'draft',
          changelogAuthor: req.userName,
          baseVersionId: work.currentVersion,
          title: work.title,
          type: work.type,
          category: work.category,
          tagsJson: JSON.stringify(work.tags.map((tag) => tag.name)),
          intro: work.intro,
          usage: work.usage,
          businessValue: work.businessValue,
          scene: work.scene,
          coreAbilities: work.coreAbilities,
          coverUrl: work.coverUrl,
        },
      })
      if (current?.attachments.length) {
        await tx.attachment.createMany({
          data: current.attachments.map((attachment) => ({
            workId: work.id,
            versionId: created.id,
            uploaderId: req.userId,
            name: attachment.name,
            size: attachment.size,
            url: attachment.url,
            storedName: attachment.storedName,
          })),
        })
      }
      return created
    })

    res.status(201).json(version)
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions/:version/submit —— 提交版本审核
router.post('/:workId/versions/:version/submit', authRequired, requirePermission('work:submit'), async (req, res, next) => {
  try {
    const isSuperAdmin = (req.userRoles || []).includes('super_admin')
    const work = await prisma.work.findUnique({ where: { id: req.params.workId } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除', code: 'BUSINESS_ERROR' })
      return
    }
    if (work.authorId !== req.userId && !isSuperAdmin) {
      res.status(403).json({ error: '无权提交该作品版本', code: 'FORBIDDEN' })
      return
    }

    const target = await prisma.workVersion.findUnique({
      where: { workId_version: { workId: req.params.workId, version: req.params.version } },
      include: { attachments: true },
    })
    if (!target) {
      res.status(404).json({ error: '版本不存在', code: 'NOT_FOUND' })
      return
    }
    if (target.status !== 'draft') {
      res.status(400).json({ error: '只有草稿版本可以提交审核', code: 'BUSINESS_ERROR' })
      return
    }
    let tags: unknown[] = []
    try {
      tags = target.tagsJson ? JSON.parse(target.tagsJson) as unknown[] : []
    } catch {
      tags = [null]
    }
    let coreAbilities: unknown[] = []
    try {
      coreAbilities = target.coreAbilities ? JSON.parse(target.coreAbilities) as unknown[] : []
    } catch {
      coreAbilities = [null]
    }
    if (!target.title || target.title.trim().length < 2 || target.title.length > 50 ||
        !target.category || target.category.trim().length > 20 ||
        !Array.isArray(tags) || tags.length < 1 || tags.length > 5 || tags.some((tag) => typeof tag !== 'string' || tag.trim().length < 1 || tag.trim().length > 30) ||
        !target.intro || target.intro.trim().length < 10 || target.intro.length > 100 ||
        !target.usage || target.usage.trim().length < 20 || target.usage.length > 2000 ||
        (target.businessValue?.length || 0) > 500 ||
        (target.scene?.length || 0) > 200 ||
        !Array.isArray(coreAbilities) || coreAbilities.length > 10 ||
        coreAbilities.some((item) => typeof item !== 'string' || item.trim().length < 1 || item.length > 100) ||
        target.changelog.length > 500 ||
        (target.version !== 'v1' && target.changelog.trim().length < 20)) {
      res.status(400).json({ error: '版本内容不完整或不符合字段规则', code: 'VALIDATION_ERROR' })
      return
    }
    if (['skill', 'workflow'].includes(target.type || '') && target.attachments.length === 0) {
      res.status(400).json({ error: '该作品类型必须上传附件', code: 'ATTACHMENT_REQUIRED' })
      return
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.workVersion.updateMany({
        where: { id: target.id, status: 'draft' },
        data: { status: 'pending', submittedAt: new Date() },
      })
      if (claimed.count !== 1) throw new Error('BUSINESS_该版本已提交审核，请勿重复提交')
      await tx.reviewEvent.create({
        data: {
          workId: work.id,
          workTitle: work.title,
          version: target.version,
          status: 'submitted',
          isFirstVersion: !work.currentVersion,
        },
      })
      return tx.workVersion.findUniqueOrThrow({ where: { id: target.id } })
    })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions/:version/withdraw —— 撤回版本（待审核 → 草稿）
router.post('/:workId/versions/:version/withdraw', authRequired, requirePermission('work:submit'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.workId } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除', code: 'BUSINESS_ERROR' })
      return
    }
    if (work.authorId !== req.userId) {
      res.status(403).json({ error: '只能撤回自己的作品版本', code: 'FORBIDDEN' })
      return
    }
    const target = await prisma.workVersion.findUnique({
      where: { workId_version: { workId: req.params.workId, version: req.params.version } },
    })
    if (!target) {
      res.status(404).json({ error: '版本不存在', code: 'NOT_FOUND' })
      return
    }
    if (target.status !== 'pending') {
      res.status(400).json({ error: '只有待审核版本可以撤回', code: 'BUSINESS_ERROR' })
      return
    }
    const updated = await prisma.workVersion.update({
      where: { id: target.id },
      data: { status: 'draft', submittedAt: null },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions/:version/approve —— 审核通过
// v1.3：三重校验（作品未删除 + base_version_id 一致 + 作品未下架）
router.post('/:workId/versions/:version/approve', authRequired, requirePermission('review:approve'), async (req, res, next) => {
  try {
    const result = await approveVersion(req.params.workId, req.params.version, req.userId!)
    res.json({
      success: true,
      type: result.type,
      version: result.version,
      message: {
        published: '审核通过，版本已上线',
        candidate_base_outdated: '审核通过，但因期间已有其他版本先上线，本版本标记为候选版本',
        candidate_work_offline: '审核通过，但因作品已下架，本版本标记为候选版本，作者可重新上架后手动上线',
      }[result.type],
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions/:version/reject —— 驳回版本（须填驳回理由）
router.post('/:workId/versions/:version/reject', authRequired, requirePermission('review:reject'), async (req, res, next) => {
  try {
    const { reason } = req.body as { reason?: string }
    if (!reason || reason.trim().length < 20) {
      res.status(400).json({ error: '驳回理由至少 20 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    if (reason.trim().length > 200) {
      res.status(400).json({ error: '驳回理由不能超过 200 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const work = await prisma.work.findUnique({ where: { id: req.params.workId } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    // v1.3：已删除作品禁止审核
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除，禁止审核', code: 'BUSINESS_ERROR' })
      return
    }
    const target = await prisma.workVersion.findUnique({
      where: { workId_version: { workId: req.params.workId, version: req.params.version } },
    })
    if (!target) {
      res.status(404).json({ error: '版本不存在', code: 'NOT_FOUND' })
      return
    }
    if (target.status !== 'pending') {
      res.status(400).json({ error: '该版本已被审核', code: 'BUSINESS_ERROR' })
      return
    }

    const previousRejections = await prisma.reviewEvent.count({
      where: { workId: work.id, version: target.version, status: 'rejected' },
    })
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.workVersion.updateMany({
        where: { id: target.id, status: 'pending' },
        data: { status: 'reviewing' },
      })
      if (claimed.count !== 1) {
        throw new Error('BUSINESS_该版本已被审核')
      }
      const v = await tx.workVersion.update({
        where: { id: target.id },
        data: {
          status: 'rejected',
          rejectReason: reason.trim(),
          reviewedAt: new Date(),
          reviewerId: req.userId,
        },
      })
      await tx.reviewEvent.create({
        data: {
          workId: work.id,
          workTitle: work.title,
          version: target.version,
          status: 'rejected',
          reviewerId: req.userId,
          reason: reason.trim(),
          isFirstVersion: !work.currentVersion,
        },
      })
      return v
    })
    const rejectionCount = previousRejections + 1
    res.json({
      ...updated,
      rejectionCount,
      warning: rejectionCount >= 3
        ? `该版本已累计驳回 ${rejectionCount} 次，请关注其内容质量并评估是否适合继续发布`
        : undefined,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions/:version/modify —— 开始修改已驳回版本（rejected → draft）
router.post('/:workId/versions/:version/modify', authRequired, requirePermission('work:submit'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.workId } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除', code: 'BUSINESS_ERROR' })
      return
    }
    if (work.authorId !== req.userId) {
      res.status(403).json({ error: '只能修改自己的作品版本', code: 'FORBIDDEN' })
      return
    }
    const target = await prisma.workVersion.findUnique({
      where: { workId_version: { workId: req.params.workId, version: req.params.version } },
    })
    if (!target) {
      res.status(404).json({ error: '版本不存在', code: 'NOT_FOUND' })
      return
    }
    if (target.status !== 'rejected') {
      res.status(400).json({ error: '只有已驳回版本可以修改', code: 'BUSINESS_ERROR' })
      return
    }
    const updated = await prisma.workVersion.update({
      where: { id: target.id },
      data: { status: 'draft', rejectReason: null },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:workId/versions/:version/publish-candidate —— 手动上线候选版本
router.post('/:workId/versions/:version/publish-candidate', authRequired, requirePermission('work:offlineOwn'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.workId } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除', code: 'BUSINESS_ERROR' })
      return
    }
    if (work.authorId !== req.userId) {
      res.status(403).json({ error: '只能上线自己的作品版本', code: 'FORBIDDEN' })
      return
    }
    const target = await prisma.workVersion.findUnique({
      where: { workId_version: { workId: req.params.workId, version: req.params.version } },
    })
    if (!target) {
      res.status(404).json({ error: '版本不存在', code: 'NOT_FOUND' })
      return
    }
    if (!target.candidate) {
      res.status(400).json({ error: '该版本不是候选版本', code: 'BUSINESS_ERROR' })
      return
    }
    if (work.status !== 'offline' || target.status !== 'passed') {
      res.status(409).json({ error: '只有已下架作品的已通过候选版本可以上线', code: 'INVALID_CANDIDATE' })
      return
    }

    await publishApprovedCandidate(work.id, target.id)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
