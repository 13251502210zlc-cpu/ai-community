import { Router } from 'express'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import { prisma } from '../lib/prisma.js'
import { authRequired, getEffectivePermissions, requirePermission } from '../lib/auth.js'
import type { WorkType } from '../types.js'
import { publishApprovedCandidate } from '../lib/version-service.js'
import { getUnsafeTagReason } from '../lib/content-filter.js'
import { ARCHIVED_DOMAIN_PREFIX, displayBusinessDomainName } from '../lib/archived-domain.js'

const router = Router()

// 作品类型校验
const WORK_TYPES: WorkType[] = ['skill', 'app', 'agent', 'prompt', 'workflow', 'case']

const createWorkSchema = z.object({
  title: z.string().trim().min(2, '作品名称至少 2 个字符').max(50, '作品名称不超过 50 个字符'),
  type: z.enum(WORK_TYPES as [string, ...string[]]),
  category: z.string().trim().min(1, '业务领域不能为空').max(20, '业务领域不超过 20 个字符'),
  tags: z.array(z.string().trim().min(1).max(30, '单个标签不能超过 30 个字符').refine((tag) => !getUnsafeTagReason(tag), {
    message: '标签包含敏感词、网址、联系方式或危险代码',
  })).min(1, '至少选择 1 个标签').max(5, '最多选择 5 个标签'),
  intro: z.string().trim().min(10, '作品简介至少 10 个字符').max(100, '作品简介不超过 100 个字符'),
  usage: z.string().trim().min(20, '使用说明至少 20 个字符').max(2000, '使用说明不超过 2000 个字符'),
  businessValue: z.string().max(500, '业务价值不超过 500 个字符').optional(),
  scene: z.string().max(200, '应用场景不超过 200 个字符').optional(),
  coreAbilities: z.array(
    z.string().trim().min(1).max(100, '单项核心能力不超过 100 个字符'),
  ).max(10, '核心能力最多填写 10 项').optional(),
  coverUrl: z.string().max(2048, '封面地址不超过 2048 个字符').optional(),
  // v1.3：v2 及以上版本必须填写更新说明
  changelog: z.string().max(500, '版本说明不超过 500 个字符').optional(),
  attachments: z.array(z.object({
    id: z.string().max(128, '附件 ID 过长').optional(),
    name: z.string().min(1).max(255, '附件名称不超过 255 个字符'),
    size: z.string().max(32, '附件大小描述过长').default('0 KB'),
    url: z.string().min(1).max(2048, '附件地址过长'),
    storedName: z.string().min(1).max(255, '附件存储名称过长'),
  })).default([]),
})

// 作品详情序列化
async function serializeWork(workId: string, currentUserId?: string, canManageOthers = false) {
  const work = await prisma.work.findUnique({
    where: { id: workId },
    include: {
      versions: { orderBy: { createdAt: 'desc' }, include: { attachments: true, reviewer: true } },
      attachments: true,
      comments: { orderBy: { createdAt: 'desc' } },
      tags: true,
    },
  })
  if (!work) return null

  const likedByMe = currentUserId
    ? !!(await prisma.userLike.findUnique({ where: { userId_workId: { userId: currentUserId, workId } } }))
    : false
  const favoritedByMe = currentUserId
    ? !!(await prisma.userFavorite.findUnique({ where: { userId_workId: { userId: currentUserId, workId } } }))
    : false

  const canManage = work.authorId === currentUserId || canManageOthers
  const visibleVersions = canManage ? work.versions : work.versions.filter((version) => version.status === 'passed')
  const current = work.versions.find((version) => version.current)
  // v2.0：work 级附件只返回当前线上版本的附件（供详情页下载展示），
  // 编辑草稿时前端从 version.attachments 读取，避免混入其他版本附件导致验证失败。
  const visibleAttachments = work.attachments.filter(
    (attachment) => !attachment.versionId || attachment.versionId === current?.id
  )

  return {
    ...work,
    category: displayBusinessDomainName(work.category),
    publishedAt: work.publishedAt || current?.reviewedAt || current?.createdAt || work.createdAt,
    coreAbilities: work.coreAbilities ? JSON.parse(work.coreAbilities) : [],
    tags: work.tags.map((t) => t.name),
    versions: visibleVersions.map((v) => ({
      ...v,
      reviewer: v.reviewer?.name,
      // v2.0：每个版本携带各自的附件列表，供前端编辑草稿时加载
      attachments: v.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        url: a.url || undefined,
        storedName: a.storedName || undefined,
        downloads: a.downloads,
      })),
    })),
    attachments: visibleAttachments,
    likedByMe,
    favoritedByMe,
  }
}

// GET /api/works —— 作品大厅（三层筛选：类型+业务领域+标签）
router.get('/', authRequired, async (req, res, next) => {
  try {
    const { type, domain, tag, sort = 'latest', q, page = '1', pageSize = '12' } = req.query
    if (type && type !== 'all' && !WORK_TYPES.includes(type as WorkType)) {
      res.status(400).json({ error: '无效的作品类型', code: 'VALIDATION_ERROR' })
      return
    }
    if (!['latest', 'likes', 'favorites', 'downloads'].includes(String(sort))) {
      res.status(400).json({ error: '无效的排序方式', code: 'VALIDATION_ERROR' })
      return
    }
    if (typeof q === 'string' && q.trim().length > 50) {
      res.status(400).json({ error: '搜索关键词不能超过 50 个字符', code: 'VALIDATION_ERROR' })
      return
    }

    const where: Record<string, unknown> = { status: 'published' }
    if (type && type !== 'all') where.type = type
    if (domain && domain !== 'all') where.category = domain as string
    if (tag && typeof tag === 'string') {
      where.tags = { some: { name: tag } }
    } else if (Array.isArray(tag) && tag.length > 0) {
      where.tags = { some: { name: { in: tag } } }
    }
    if (q && typeof q === 'string') {
      where.OR = [
        { title: { contains: q } },
        { intro: { contains: q } },
        { authorName: { contains: q } },
      ]
    }

    const order: Record<string, 'asc' | 'desc'> = {}
    if (sort === 'latest') order.publishedAt = 'desc'
    else if (sort === 'likes') order.likes = 'desc'
    else if (sort === 'favorites') order.favorites = 'desc'
    else order.downloads = 'desc'

    const total = await prisma.work.count({ where })
    const parsedPage = Number(page)
    const parsedSize = Number(pageSize)
    const p = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const size = Number.isInteger(parsedSize) && parsedSize > 0 ? Math.min(50, parsedSize) : 12
    const works = await prisma.work.findMany({
      where,
      include: { tags: true, versions: { where: { current: true }, take: 1 } },
      orderBy: order,
      skip: (p - 1) * size,
      take: size,
    })

    // v2.0：批量查询当前用户的点赞和收藏记录，避免 N+1 查询
    const workIds = works.map((w) => w.id)
    const [myLikes, myFavs] = await Promise.all([
      prisma.userLike.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
      prisma.userFavorite.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
    ])
    const likedIds = new Set(myLikes.map((l) => l.workId))
    const favIds = new Set(myFavs.map((f) => f.workId))

    res.json({
      items: works.map((w) => ({
        ...w,
        publishedAt: w.publishedAt || w.versions[0]?.reviewedAt || w.versions[0]?.createdAt || w.createdAt,
        tags: w.tags.map((t) => t.name),
        likedByMe: likedIds.has(w.id),
        favoritedByMe: favIds.has(w.id),
      })),
      total,
      page: p,
      pageSize: size,
      totalPages: Math.max(1, Math.ceil(total / size)),
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/works/recommended —— 运营推荐
router.get('/recommended', authRequired, async (req, res, next) => {
  try {
    const works = await prisma.work.findMany({
      where: { status: 'published', recommended: true },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: { tags: true },
    })
    // v2.0：批量查询当前用户的点赞和收藏记录
    const workIds = works.map((w) => w.id)
    const [myLikes, myFavs] = await Promise.all([
      prisma.userLike.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
      prisma.userFavorite.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
    ])
    const likedIds = new Set(myLikes.map((l) => l.workId))
    const favIds = new Set(myFavs.map((f) => f.workId))
    res.json(works.map((w) => ({
      ...w,
      publishedAt: w.publishedAt || w.createdAt,
      tags: w.tags.map((t) => t.name),
      likedByMe: likedIds.has(w.id),
      favoritedByMe: favIds.has(w.id),
    })))
  } catch (err) {
    next(err)
  }
})

// GET /api/works/domains —— 公开获取业务领域列表（供作品大厅筛选，无需登录）
router.get('/domains', authRequired, async (_req, res, next) => {
  try {
    const domains = await prisma.businessDomain.findMany({
      where: { NOT: { name: { startsWith: ARCHIVED_DOMAIN_PREFIX } } },
      orderBy: { sortOrder: 'asc' },
    })
    res.json(domains.map((d) => d.name))
  } catch (err) {
    next(err)
  }
})

// GET /api/works/tags —— 公开获取标签列表（供作品大厅筛选，无需登录）
router.get('/tags', authRequired, async (_req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { sortOrder: 'asc' } })
    res.json(tags.map((t) => t.name))
  } catch (err) {
    next(err)
  }
})

// GET /api/works/:id —— 作品详情
router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const rawWork = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!rawWork) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    const effectivePermissions = await getEffectivePermissions(req.userRoles || [])
    const canManageOthers = effectivePermissions.includes('admin:workManage')
    const canManage = rawWork.authorId === req.userId || canManageOthers
    if (rawWork.status !== 'published' && !canManage) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    // 先完成计数再序列化，确保本次详情响应中的浏览量就是最新值。
    if (rawWork.status === 'published') {
      await prisma.work.update({ where: { id: req.params.id }, data: { views: { increment: 1 } } })
    }
    const work = await serializeWork(req.params.id, req.userId, canManageOthers)
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    res.json(work)
  } catch (err) {
    next(err)
  }
})

// POST /api/works —— 创建作品（v1.3：首次创建自动获得创作者角色）
router.post('/', authRequired, requirePermission('work:create'), async (req, res, next) => {
  try {
    const data = createWorkSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) {
      res.status(404).json({ error: '用户不存在', code: 'NOT_FOUND' })
      return
    }
    const [duplicate, domain] = await Promise.all([
      prisma.work.findFirst({ where: { title: data.title, status: { not: 'deleted' } }, select: { id: true } }),
      prisma.businessDomain.findUnique({ where: { name: data.category }, select: { id: true } }),
    ])
    if (duplicate) {
      res.status(409).json({ error: '作品名称已存在', code: 'DUPLICATE_TITLE' })
      return
    }
    if (!domain) {
      res.status(400).json({ error: '业务领域不存在', code: 'INVALID_DOMAIN' })
      return
    }
    if (['skill', 'workflow'].includes(data.type) && data.attachments.length === 0) {
      res.status(400).json({ error: '该作品类型必须上传附件', code: 'ATTACHMENT_REQUIRED' })
      return
    }
    if (data.attachments.length > 0) {
      const ownedUploads = await prisma.pendingUpload.count({
        where: { uploaderId: user.id, storedName: { in: data.attachments.map((item) => item.storedName) } },
      })
      if (ownedUploads !== data.attachments.length) {
        res.status(400).json({ error: '附件无效或不属于当前用户', code: 'INVALID_ATTACHMENT' })
        return
      }
    }

    const work = await prisma.$transaction(async (tx) => {
      // v1.3：原子生成首个版本号
      const version = 'v1'
      const work = await tx.work.create({
        data: {
          title: data.title,
          type: data.type,
          category: data.category,
          intro: data.intro,
          usage: data.usage,
          businessValue: data.businessValue,
          scene: data.scene,
          coreAbilities: data.coreAbilities ? JSON.stringify(data.coreAbilities) : null,
          coverUrl: data.coverUrl,
          authorId: user.id,
          authorName: user.name,
          department: user.department,
          status: 'unpublished',
          tags: data.tags.length > 0
            ? { connectOrCreate: data.tags.map((name) => ({ where: { name }, create: { name } })) }
            : undefined,
          versions: {
            create: {
              version,
              changelog: data.changelog || '初始版本',
              status: 'draft',
              changelogAuthor: user.name,
              title: data.title,
              type: data.type,
              category: data.category,
              tagsJson: JSON.stringify(data.tags),
              intro: data.intro,
              usage: data.usage,
              businessValue: data.businessValue,
              scene: data.scene,
              coreAbilities: data.coreAbilities ? JSON.stringify(data.coreAbilities) : null,
              coverUrl: data.coverUrl,
            },
          },
        },
        include: { tags: true, versions: true },
      })

      if (data.attachments.length > 0) {
        const firstVersion = work.versions[0]
        await tx.attachment.createMany({
          data: data.attachments.map((attachment) => ({
            workId: work.id,
            versionId: firstVersion.id,
            uploaderId: user.id,
            name: attachment.name,
            size: attachment.size,
            url: attachment.url,
            storedName: attachment.storedName,
          })),
        })
        await tx.pendingUpload.deleteMany({ where: { storedName: { in: data.attachments.map((item) => item.storedName) } } })
      }

      // v1.3：普通用户首次创建作品自动获得创作者角色
      if (user.role === 'user') {
        await tx.user.update({ where: { id: user.id }, data: { role: 'creator' } })
        await tx.userRole.upsert({
          where: { userId_role: { userId: user.id, role: 'creator' } },
          update: {},
          create: { userId: user.id, role: 'creator' },
        })
      }
      return work
    })

    const serialized = await serializeWork(work.id, req.userId)
    res.status(201).json(serialized)
  } catch (err) {
    next(err)
  }
})

// PUT /api/works/:id —— 更新作品基础信息（作者本人或超级管理员）
router.put('/:id', authRequired, requirePermission('work:editOwn'), async (req, res, next) => {
  try {
    const isSuperAdmin = (req.userRoles || []).includes('super_admin')
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.authorId !== req.userId && !isSuperAdmin) {
      res.status(403).json({ error: '无权编辑该作品', code: 'FORBIDDEN' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除', code: 'BUSINESS_ERROR' })
      return
    }

    const data = createWorkSchema.partial().parse(req.body)
    const draft = await prisma.workVersion.findFirst({
      where: { workId: work.id, status: { in: ['draft', 'rejected'] } },
      orderBy: { createdAt: 'desc' },
    })
    if (!draft) {
      res.status(409).json({ error: '当前没有可编辑的草稿版本，请先创建新版本', code: 'NO_EDITABLE_VERSION' })
      return
    }
    if (data.title && data.title !== work.title) {
      const duplicate = await prisma.work.findFirst({
        where: { title: data.title, id: { not: work.id }, status: { not: 'deleted' } },
        select: { id: true },
      })
      if (duplicate) {
        res.status(409).json({ error: '作品名称已存在', code: 'DUPLICATE_TITLE' })
        return
      }
    }
    if (data.category) {
      const domain = await prisma.businessDomain.findUnique({ where: { name: data.category }, select: { id: true } })
      if (!domain) {
        res.status(400).json({ error: '业务领域不存在', code: 'INVALID_DOMAIN' })
        return
      }
    }
    if (data.attachments !== undefined && data.attachments.length > 0) {
      const names = data.attachments.map((item) => item.storedName)
      const [pending, existing] = await Promise.all([
        prisma.pendingUpload.count({ where: { uploaderId: req.userId, storedName: { in: names } } }),
        prisma.attachment.count({
          where: {
            versionId: draft.id,
            storedName: { in: names },
            ...(!isSuperAdmin && { uploaderId: req.userId }),
          },
        }),
      ])
      if (pending + existing !== new Set(names).size) {
        res.status(400).json({ error: '附件无效或不属于当前用户', code: 'INVALID_ATTACHMENT' })
        return
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.workVersion.update({
        where: { id: draft.id },
        data: {
          status: 'draft',
          ...(data.title !== undefined && { title: data.title }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.tags !== undefined && { tagsJson: JSON.stringify(data.tags) }),
          ...(data.intro !== undefined && { intro: data.intro }),
          ...(data.usage !== undefined && { usage: data.usage }),
          ...(data.businessValue !== undefined && { businessValue: data.businessValue }),
          ...(data.scene !== undefined && { scene: data.scene }),
          ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
          ...(data.coreAbilities !== undefined && { coreAbilities: JSON.stringify(data.coreAbilities) }),
          ...(data.changelog !== undefined && { changelog: data.changelog }),
          rejectReason: null,
        },
      })
      if (data.attachments !== undefined) {
        // v2.0：找出将被删除的附件，清理物理文件
        const keepNames = new Set(data.attachments.map((a) => a.storedName))
        const removing = await tx.attachment.findMany({
          where: { versionId: draft.id, storedName: { notIn: [...keepNames] } },
          select: { storedName: true },
        })
        for (const r of removing) {
          if (r.storedName) {
            // 仅当该文件没有其他版本引用时才删除物理文件
            const otherRefs = await tx.attachment.count({ where: { storedName: r.storedName, versionId: { not: draft.id } } })
            if (otherRefs === 0) {
              const filePath = path.resolve(process.cwd(), 'uploads', 'attachments', path.basename(r.storedName))
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            }
          }
        }
        await tx.attachment.deleteMany({ where: { versionId: draft.id } })
        if (data.attachments.length > 0) {
          await tx.attachment.createMany({
            data: data.attachments.map((attachment) => ({
              workId: work.id,
              versionId: draft.id,
              uploaderId: req.userId,
              name: attachment.name,
              size: attachment.size,
              url: attachment.url,
              storedName: attachment.storedName,
            })),
          })
          await tx.pendingUpload.deleteMany({ where: { storedName: { in: data.attachments.map((item) => item.storedName) } } })
        }
      }
    })

    res.json(await serializeWork(work.id, req.userId, isSuperAdmin))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/works/:id —— 删除作品（软删除：状态 → deleted）
router.delete('/:id', authRequired, requirePermission('work:deleteOwn', 'admin:workManage'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.authorId !== req.userId) {
      res.status(403).json({ error: '只能删除自己的作品', code: 'FORBIDDEN' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除，不可重复操作', code: 'BUSINESS_ERROR' })
      return
    }
    await prisma.work.update({ where: { id: req.params.id }, data: { status: 'deleted' } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:id/offline —— 下架作品
router.post('/:id/offline', authRequired, requirePermission('work:offlineOwn'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    const isAuthor = work.authorId === req.userId
    const isReviewer = (req.userRoles || []).some((role) => role === 'reviewer' || role === 'super_admin')
    if (!isAuthor && !isReviewer) {
      res.status(403).json({ error: '只能下架自己的作品或由审核管理员强制下架', code: 'FORBIDDEN' })
      return
    }
    if (work.status !== 'published') {
      res.status(400).json({ error: work.status === 'deleted' ? '作品已删除，禁止操作' : '只有已发布作品可以下架', code: 'BUSINESS_ERROR' })
      return
    }
    await prisma.work.update({ where: { id: req.params.id }, data: { status: 'offline' } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:id/republish —— 重新上架（已下架作品的作者）
router.post('/:id/republish', authRequired, async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({
      where: { id: req.params.id },
      include: { versions: true },
    })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.authorId !== req.userId) {
      res.status(403).json({ error: '只能重新上架自己的作品', code: 'FORBIDDEN' })
      return
    }
    if (work.status !== 'offline') {
      res.status(400).json({ error: '只有已下架作品可以重新上架', code: 'BUSINESS_ERROR' })
      return
    }

    // v1.3：若有候选版本（审核通过但因作品下架未自动上线），手动上线
    const candidate = work.versions.find((v) => v.candidate)
    if (candidate) {
      await publishApprovedCandidate(work.id, candidate.id)
    } else {
      await prisma.work.update({ where: { id: work.id }, data: { status: 'published' } })
    }
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:id/like —— 点赞 / 取消点赞
router.post('/:id/like', authRequired, async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.id }, select: { status: true } })
    if (!work || work.status !== 'published') {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    const existing = await prisma.userLike.findUnique({
      where: { userId_workId: { userId: req.userId!, workId: req.params.id } },
    })
    if (existing) {
      await prisma.$transaction([
        prisma.userLike.delete({ where: { userId_workId: { userId: req.userId!, workId: req.params.id } } }),
        prisma.work.update({ where: { id: req.params.id }, data: { likes: { decrement: 1 } } }),
      ])
      res.json({ liked: false })
    } else {
      await prisma.$transaction([
        prisma.userLike.create({ data: { userId: req.userId!, workId: req.params.id } }),
        prisma.work.update({ where: { id: req.params.id }, data: { likes: { increment: 1 } } }),
      ])
      res.json({ liked: true })
    }
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:id/favorite —— 收藏 / 取消收藏
router.post('/:id/favorite', authRequired, async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.id }, select: { status: true } })
    if (!work || work.status !== 'published') {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    const existing = await prisma.userFavorite.findUnique({
      where: { userId_workId: { userId: req.userId!, workId: req.params.id } },
    })
    if (existing) {
      await prisma.$transaction([
        prisma.userFavorite.delete({ where: { userId_workId: { userId: req.userId!, workId: req.params.id } } }),
        prisma.work.update({ where: { id: req.params.id }, data: { favorites: { decrement: 1 } } }),
      ])
      res.json({ favorited: false })
    } else {
      await prisma.$transaction([
        prisma.userFavorite.create({ data: { userId: req.userId!, workId: req.params.id } }),
        prisma.work.update({ where: { id: req.params.id }, data: { favorites: { increment: 1 } } }),
      ])
      res.json({ favorited: true })
    }
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:id/comments —— 发表评论
router.post('/:id/comments', authRequired, async (req, res, next) => {
  try {
    const { content } = req.body as { content?: string }
    if (!content || content.trim().length < 5) {
      res.status(400).json({ error: '评论内容至少 5 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    if (content.trim().length > 500) {
      res.status(400).json({ error: '评论内容不能超过 500 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status !== 'published') {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) {
      res.status(404).json({ error: '用户不存在', code: 'NOT_FOUND' })
      return
    }
    const comment = await prisma.comment.create({
      data: {
        workId: work.id,
        userId: user.id,
        userName: user.name,
        department: user.department,
        avatarColor: user.avatarColor,
        content: content.trim(),
      },
    })
    res.status(201).json(comment)
  } catch (err) {
    next(err)
  }
})

// POST /api/works/:id/download —— 下载计数 +1
router.post('/:id/download', authRequired, async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status !== 'published') {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    const updated = await prisma.work.update({
      where: { id: req.params.id },
      data: { downloads: { increment: 1 } },
    })
    res.json({ downloads: updated.downloads })
  } catch (err) {
    next(err)
  }
})

export default router
