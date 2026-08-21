import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { authRequired, requirePermission, requireRole } from '../lib/auth.js'
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, type Permission, type UserRole } from '../lib/permissions.js'
import { publishApprovedCandidate } from '../lib/version-service.js'
import { getUnsafeTagReason } from '../lib/content-filter.js'
import { ARCHIVED_DOMAIN_PREFIX, displayBusinessDomainName } from '../lib/archived-domain.js'

const router = Router()

function serializeAdminUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    department: user.department,
    position: user.position,
    role: user.role,
    roles: user.assignedRoles?.map((item: { role: string }) => item.role) || [user.role],
    avatarColor: user.avatarColor,
    avatar: user.avatar,
    employeeId: user.employeeId,
    wecomUserId: user.wecomUserId,
    loginMethod: user.loginMethod,
    loginAccount: user.loginAccount,
    accountStatus: user.accountStatus,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    _count: user._count,
  }
}

async function ensureSuperAdminRemains(targetUserId: string, nextRoles: UserRole[]) {
  const target = await prisma.userRole.findUnique({
    where: { userId_role: { userId: targetUserId, role: 'super_admin' } },
  })
  if (!target || nextRoles.includes('super_admin')) return
  const superAdminCount = await prisma.userRole.count({ where: { role: 'super_admin' } })
  if (superAdminCount <= 1) {
    const error = new Error('BUSINESS_系统必须至少保留一名超级管理员')
    throw error
  }
}

// 全部后台路由都需要登录
router.use(authRequired)

// GET /api/admin/review/queue —— 审核队列
// v1.3：已删除作品的待审核版本自动从队列移除
router.get('/review/queue', requirePermission('review:view'), async (_req, res, next) => {
  try {
    const works = await prisma.work.findMany({
      where: { status: { not: 'deleted' } },
      include: {
        tags: true,
        attachments: true,
        versions: {
          where: { status: 'pending' },
          orderBy: { submittedAt: 'desc' },
          include: { reviewer: true, attachments: true },
        },
      },
    })

    const items = works
      .filter((w) => w.versions.length > 0)
      .flatMap((w) =>
        w.versions.map((v) => {
          let coreAbilities: string[] = []
          if (w.coreAbilities) {
            try {
              coreAbilities = JSON.parse(w.coreAbilities)
            } catch {
              coreAbilities = []
            }
          }

          const versionTags = v.tagsJson ? JSON.parse(v.tagsJson) as string[] : w.tags.map((tag) => tag.name)
          return {
            // 与前端 ReviewItem 契约保持一致，避免待审核数据存在时访问 item.work.id 崩溃。
            work: {
              id: w.id,
              title: v.title || w.title,
              type: v.type || w.type,
              category: displayBusinessDomainName(v.category || w.category),
              tags: versionTags,
              intro: v.intro || w.intro,
              authorId: w.authorId,
              authorName: w.authorName,
              department: w.department,
              status: w.status,
              versions: w.versions.map((version) => ({
                version: version.version,
                changelog: version.changelog,
                date: version.createdAt.toISOString(),
                status: version.status,
                current: version.current,
                changelogAuthor: version.changelogAuthor || undefined,
                submittedAt: version.submittedAt?.toISOString(),
                reviewedAt: version.reviewedAt?.toISOString(),
                reviewer: version.reviewer?.name,
                rejectReason: version.rejectReason || undefined,
                baseVersionId: version.baseVersionId || undefined,
                candidate: version.candidate,
              })),
              currentVersion: w.currentVersion || undefined,
              coverUrl: v.coverUrl || undefined,
              usage: v.usage || '',
              businessValue: v.businessValue || undefined,
              scene: v.scene || undefined,
              coreAbilities: v.coreAbilities ? JSON.parse(v.coreAbilities) : coreAbilities,
              attachments: v.attachments.map((attachment) => ({
                id: attachment.id,
                name: attachment.name,
                size: attachment.size,
                downloads: attachment.downloads,
                url: attachment.url || undefined,
                storedName: attachment.storedName || undefined,
              })),
              comments: [],
              likes: w.likes,
              favorites: w.favorites,
              downloads: w.downloads,
              views: w.views,
              likedByMe: false,
              favoritedByMe: false,
              createdAt: w.createdAt.toISOString(),
              publishedAt: w.publishedAt?.toISOString(),
              recommended: w.recommended,
            },
            version: {
              version: v.version,
              changelog: v.changelog,
              date: v.createdAt.toISOString(),
              status: v.status,
              current: v.current,
              changelogAuthor: v.changelogAuthor || undefined,
              submittedAt: v.submittedAt?.toISOString(),
              reviewedAt: v.reviewedAt?.toISOString(),
              reviewer: v.reviewer?.name,
              rejectReason: v.rejectReason || undefined,
              baseVersionId: v.baseVersionId || undefined,
              candidate: v.candidate,
            },
            onlineVersion: w.currentVersion || undefined,
            isFirstVersion: !w.currentVersion,
          }
        })
      )
      .sort((a, b) => {
        const bTime = b.version.submittedAt ? new Date(b.version.submittedAt).getTime() : 0
        const aTime = a.version.submittedAt ? new Date(a.version.submittedAt).getTime() : 0
        return bTime - aTime
      })

    res.json(items)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/review/events —— 审核事件日志
router.get('/review/events', requirePermission('review:view'), async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20)
    const events = await prisma.reviewEvent.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { reviewer: true },
    })
    res.json(events)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/review/stats —— 审核相关数据统计
router.get('/review/stats', requirePermission('review:view'), async (_req, res, next) => {
  try {
    const [pending, approvedToday, rejectedToday, totalWorks] = await Promise.all([
      prisma.workVersion.count({
        where: { status: 'pending', work: { status: { not: 'deleted' } } },
      }),
      prisma.reviewEvent.count({
        where: {
          status: 'approved',
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.reviewEvent.count({
        where: {
          status: 'rejected',
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.work.count({ where: { status: 'published' } }),
    ])
    res.json({ pending, approvedToday, rejectedToday, totalWorks })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/stats —— 平台统计（不受后台作品列表 100 条上限影响）
router.get('/stats', requirePermission('admin:stats'), async (_req, res, next) => {
  try {
    const [totalWorks, totalUsers, downloadAggregate, pendingVersions, publishedWorks, groupedTypes, topWorks] = await Promise.all([
      prisma.work.count({ where: { status: { not: 'deleted' } } }),
      prisma.user.count(),
      prisma.work.aggregate({ where: { status: 'published' }, _sum: { downloads: true } }),
      prisma.workVersion.count({ where: { status: 'pending', work: { status: { not: 'deleted' } } } }),
      prisma.work.count({ where: { status: 'published' } }),
      prisma.work.groupBy({ by: ['type'], where: { status: 'published' }, _count: { _all: true } }),
      prisma.work.findMany({
        where: { status: 'published' },
        orderBy: [{ downloads: 'desc' }, { publishedAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          title: true,
          type: true,
          authorName: true,
          department: true,
          downloads: true,
          likes: true,
        },
      }),
    ])

    res.json({
      summary: {
        totalWorks,
        totalUsers,
        totalDownloads: downloadAggregate._sum.downloads || 0,
        pendingVersions,
      },
      publishedWorks,
      typeDistribution: groupedTypes.map((item) => ({ type: item.type, count: item._count._all })),
      topWorks,
    })
  } catch (err) {
    next(err)
  }
})

// ============ 业务领域管理 ============

// GET /api/admin/domains
router.get('/domains', requirePermission('admin:domain'), async (_req, res, next) => {
  try {
    const domains = await prisma.businessDomain.findMany({
      where: { NOT: { name: { startsWith: ARCHIVED_DOMAIN_PREFIX } } },
      orderBy: { sortOrder: 'asc' },
    })
    res.json(domains)
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/domains
router.post('/domains', requirePermission('admin:domain'), async (req, res, next) => {
  try {
    const { name } = req.body as { name?: string }
    if (!name || !name.trim()) {
      res.status(400).json({ error: '业务领域名称不能为空', code: 'VALIDATION_ERROR' })
      return
    }
    if (name.trim().length > 20) {
      res.status(400).json({ error: '业务领域名称不能超过 20 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const normalizedName = name.trim()
    const duplicate = await prisma.businessDomain.findUnique({ where: { name: normalizedName }, select: { id: true } })
    if (duplicate) {
      res.status(409).json({ error: '业务领域已存在', code: 'DUPLICATE_DOMAIN' })
      return
    }
    const domain = await prisma.businessDomain.create({ data: { name: normalizedName } })
    res.status(201).json(domain)
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/domains/:id
router.put('/domains/:id', requirePermission('admin:domain'), async (req, res, next) => {
  try {
    const { name } = req.body as { name?: string }
    if (!name || !name.trim()) {
      res.status(400).json({ error: '业务领域名称不能为空', code: 'VALIDATION_ERROR' })
      return
    }
    if (name.trim().length > 20) {
      res.status(400).json({ error: '业务领域名称不能超过 20 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const normalizedName = name.trim()
    const duplicate = await prisma.businessDomain.findFirst({
      where: { name: normalizedName, id: { not: req.params.id } },
      select: { id: true },
    })
    if (duplicate) {
      res.status(409).json({ error: '业务领域已存在', code: 'DUPLICATE_DOMAIN' })
      return
    }
    const updated = await prisma.businessDomain.update({
      where: { id: req.params.id },
      data: { name: normalizedName },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/domains/:id
router.delete('/domains/:id', requirePermission('admin:domain'), async (req, res, next) => {
  try {
    const domain = await prisma.businessDomain.findUnique({ where: { id: req.params.id } })
    if (!domain) {
      res.status(404).json({ error: '业务领域不存在', code: 'NOT_FOUND' })
      return
    }
    const activeWorkCount = await prisma.work.count({
      where: { category: domain.name, status: { not: 'deleted' } },
    })
    if (activeWorkCount > 0) {
      res.status(409).json({ error: `该业务领域仍有关联的有效作品（${activeWorkCount} 个），无法删除`, code: 'DOMAIN_IN_USE' })
      return
    }
    await prisma.$transaction(async (tx) => {
      const deletedWorkCount = await tx.work.count({ where: { category: domain.name, status: 'deleted' } })
      if (deletedWorkCount > 0) {
        const archivedName = `${ARCHIVED_DOMAIN_PREFIX}${domain.id}:${domain.name}`
        await tx.businessDomain.upsert({
          where: { name: archivedName },
          update: {},
          create: { name: archivedName, sortOrder: domain.sortOrder },
        })
        await tx.work.updateMany({
          where: { category: domain.name, status: 'deleted' },
          data: { category: archivedName },
        })
      }
      await tx.businessDomain.delete({ where: { id: domain.id } })
    })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ============ 标签管理 ============

// GET /api/admin/tags
router.get('/tags', requirePermission('admin:tag'), async (_req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { sortOrder: 'asc' } })
    res.json(tags)
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/tags
router.post('/tags', requirePermission('admin:tag'), async (req, res, next) => {
  try {
    const { name } = req.body as { name?: string }
    if (!name || !name.trim()) {
      res.status(400).json({ error: '标签名称不能为空', code: 'VALIDATION_ERROR' })
      return
    }
    if (name.trim().length > 30) {
      res.status(400).json({ error: '标签名称不能超过 30 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const unsafeReason = getUnsafeTagReason(name)
    if (unsafeReason) {
      res.status(400).json({ error: unsafeReason, code: 'SENSITIVE_TAG' })
      return
    }
    const tag = await prisma.tag.create({ data: { name: name.trim() } })
    res.status(201).json(tag)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/tags/:id
router.delete('/tags/:id', requirePermission('admin:tag'), async (req, res, next) => {
  try {
    await prisma.tag.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ============ 用户管理 ============

// GET /api/admin/users —— 用户列表（带统计）
// v1.7：返回多角色（assignedRoles）；支持按角色筛选（匹配 assignedRoles 任一）
router.get('/users', requirePermission('admin:user'), async (req, res, next) => {
  try {
    const { role, q } = req.query
    const where: Record<string, unknown> = {}
    // v1.7：按角色筛选改为查 assignedRoles 关联表
    if (role && role !== 'all') {
      where.assignedRoles = { some: { role: role as string } }
    }
    if (q && typeof q === 'string') {
      where.OR = [
        { name: { contains: q } },
        { department: { contains: q } },
        { position: { contains: q } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedRoles: true,
        _count: {
          select: { worksAuthored: true },
        },
      },
    })

    // v1.7：统计每个角色的用户数（基于 UserRole 关联表）
    const roleStats = await prisma.userRole.groupBy({
      by: ['role'],
      _count: true,
    })

    // v1.7：附加 roles 数组到每个用户
    const items = users.map(serializeAdminUser)

    res.json({
      items,
      stats: {
        total: users.length,
        byRole: roleStats.reduce((acc, r) => ({ ...acc, [r.role]: r._count }), {}),
      },
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id/roles —— 分配用户角色（v1.7：多角色）
// body: { roles: UserRole[] } —— 设置多个角色（权限取并集）
// 兼容旧版 PUT /users/:id/role body: { role } —— 单角色
router.put('/users/:id/roles', requirePermission('admin:userRole'), async (req, res, next) => {
  try {
    const { roles: bodyRoles, role: bodyRole } = req.body as {
      roles?: UserRole[]
      role?: UserRole
    }
    const validRoles: UserRole[] = ['user', 'creator', 'reviewer', 'operator', 'super_admin']
    let roles: UserRole[] = []
    if (bodyRoles && Array.isArray(bodyRoles)) {
      roles = bodyRoles.filter((r) => validRoles.includes(r))
    } else if (bodyRole && validRoles.includes(bodyRole)) {
      roles = [bodyRole]
    }
    if (roles.length === 0) {
      res.status(400).json({ error: '无效的角色', code: 'VALIDATION_ERROR' })
      return
    }
    const mainRole = roles.find((role) => role !== 'user') || 'user'
    roles = Array.from(new Set(['user' as UserRole, ...roles]))
    const targetIsSuperAdmin = await prisma.userRole.findUnique({
      where: { userId_role: { userId: req.params.id, role: 'super_admin' } }, select: { userId: true },
    })
    if ((roles.includes('super_admin') || targetIsSuperAdmin) && !(req.userRoles || []).includes('super_admin')) {
      res.status(403).json({ error: '只有超级管理员可以分配或移除超级管理员角色', code: 'FORBIDDEN' })
      return
    }
    await ensureSuperAdminRemains(req.params.id, roles)

    // v1.7：更新 assignedRoles 关联表（先删后建）+ User.role 主角色
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: req.params.id } }),
      prisma.user.update({
        where: { id: req.params.id },
        data: { role: mainRole },
      }),
      prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: req.params.id, role: r })),
      }),
    ])

    const updated = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { assignedRoles: true },
    })
    res.json(serializeAdminUser(updated))
  } catch (err) {
    next(err)
  }
})

// v1.7：兼容旧版单角色分配路由（单角色转单元素数组）
router.put('/users/:id/role', requirePermission('admin:userRole'), async (req, res, next) => {
  try {
    const { role } = req.body as { role?: UserRole }
    const validRoles: UserRole[] = ['user', 'creator', 'reviewer', 'operator', 'super_admin']
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: '无效的角色', code: 'VALIDATION_ERROR' })
      return
    }
    const roles: UserRole[] = role === 'user' ? ['user'] : ['user', role]
    const targetIsSuperAdmin = await prisma.userRole.findUnique({
      where: { userId_role: { userId: req.params.id, role: 'super_admin' } }, select: { userId: true },
    })
    if ((role === 'super_admin' || targetIsSuperAdmin) && !(req.userRoles || []).includes('super_admin')) {
      res.status(403).json({ error: '只有超级管理员可以分配或移除超级管理员角色', code: 'FORBIDDEN' })
      return
    }
    await ensureSuperAdminRemains(req.params.id, roles)
    // v1.7：单角色也写入 assignedRoles 关联表，保持数据一致
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: req.params.id } }),
      prisma.user.update({ where: { id: req.params.id }, data: { role } }),
      prisma.userRole.createMany({ data: roles.map((assignedRole) => ({ userId: req.params.id, role: assignedRole })) }),
    ])
    const updated = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { assignedRoles: true },
    })
    res.json(serializeAdminUser(updated))
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/permission-matrix —— 权限矩阵
router.get('/permission-matrix', requireRole('super_admin'), async (_req, res, next) => {
  try {
    const configured = await prisma.rolePermission.findMany()
    const result: Record<string, string[]> = {}
    for (const role of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
      if (role === 'super_admin') {
        result[role] = [...ALL_PERMISSIONS]
        continue
      }
      const rows = configured.filter((row) => row.role === role)
      result[role] = rows.length > 0
        ? rows.filter((row) => row.allowed && row.permission !== 'admin:role' && ALL_PERMISSIONS.includes(row.permission as Permission)).map((row) => row.permission)
        : ROLE_PERMISSIONS[role]
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.put('/permission-matrix/:role', requireRole('super_admin'), async (req, res, next) => {
  try {
    const role = req.params.role as UserRole
    if (!(role in ROLE_PERMISSIONS) || role === 'super_admin') {
      res.status(400).json({ error: '该角色不允许修改', code: 'VALIDATION_ERROR' })
      return
    }
    const requested = Array.isArray(req.body?.permissions) ? req.body.permissions as string[] : []
    if (requested.some((permission) => !ALL_PERMISSIONS.includes(permission as Permission))) {
      res.status(400).json({ error: '包含未知权限', code: 'VALIDATION_ERROR' })
      return
    }
    if (requested.includes('admin:role')) {
      res.status(400).json({ error: '权限配置能力仅限超级管理员', code: 'VALIDATION_ERROR' })
      return
    }
    const permissions = Array.from(new Set(requested))
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role } })
      await tx.rolePermission.createMany({
        data: ALL_PERMISSIONS.map((permission) => ({ role, permission, allowed: permissions.includes(permission) })),
      })
    })
    res.json({ role, permissions })
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/users/:id/account —— 配置登录方式、账号与账号状态
router.put('/users/:id/account', requirePermission('admin:user'), async (req, res, next) => {
  try {
    const { loginMethod, loginAccount, password, accountStatus } = req.body as {
      loginMethod?: 'wecom' | 'password' | 'both'
      loginAccount?: string | null
      password?: string
      accountStatus?: 'active' | 'disabled'
    }
    if (loginMethod && !['wecom', 'password', 'both'].includes(loginMethod)) {
      res.status(400).json({ error: '无效的登录方式', code: 'VALIDATION_ERROR' })
      return
    }
    if (accountStatus && !['active', 'disabled'].includes(accountStatus)) {
      res.status(400).json({ error: '无效的账号状态', code: 'VALIDATION_ERROR' })
      return
    }
    if (password && (password.length < 6 || password.length > 32 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      res.status(400).json({ error: '密码须为 6-32 字符且同时包含字母和数字', code: 'VALIDATION_ERROR' })
      return
    }
    const current = await prisma.user.findUnique({ where: { id: req.params.id }, include: { assignedRoles: true } })
    if (!current) {
      res.status(404).json({ error: '用户不存在', code: 'NOT_FOUND' })
      return
    }
    const nextMethod = loginMethod || current.loginMethod
    const nextAccount = loginAccount === undefined ? current.loginAccount : loginAccount?.trim() || null
    if (['password', 'both'].includes(nextMethod) && !nextAccount) {
      res.status(400).json({ error: '开通密码登录时必须配置登录账号', code: 'VALIDATION_ERROR' })
      return
    }
    if (accountStatus === 'disabled' && current.assignedRoles.some((item) => item.role === 'super_admin')) {
      const activeSuperAdmins = await prisma.user.count({
        where: { accountStatus: 'active', assignedRoles: { some: { role: 'super_admin' } } },
      })
      if (activeSuperAdmins <= 1) {
        res.status(409).json({ error: '不能禁用最后一名有效超级管理员', code: 'LAST_SUPER_ADMIN' })
        return
      }
    }
    const updated = await prisma.user.update({
      where: { id: current.id },
      data: {
        loginMethod: nextMethod,
        loginAccount: ['password', 'both'].includes(nextMethod) ? nextAccount : null,
        ...(password ? { password: await bcrypt.hash(password, 12) } : {}),
        ...(accountStatus ? { accountStatus, failedLoginCount: 0, lockedUntil: null } : {}),
      },
      include: { assignedRoles: true },
    })
    res.json(serializeAdminUser(updated))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users/:id/reset-password —— 生成一次性临时密码
router.post('/users/:id/reset-password', requirePermission('admin:user'), async (req, res, next) => {
  try {
    const temporaryPassword = `Ai!${crypto.randomBytes(9).toString('base64url')}8`
    const user = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user) {
      res.status(404).json({ error: '用户不存在', code: 'NOT_FOUND' })
      return
    }
    const hashed = await bcrypt.hash(temporaryPassword, 12)
    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        password: hashed,
        failedLoginCount: 0,
        accountStatus: user.accountStatus === 'locked' ? 'active' : user.accountStatus,
        lockedUntil: null,
      },
    })
    res.json({ success: true, temporaryPassword })
  } catch (err) {
    next(err)
  }
})

// ============ 运营推荐 ============

router.get('/works', requirePermission('admin:workRead'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (q.length > 50) {
      res.status(400).json({ error: '搜索内容不能超过 50 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const where: any = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(type && type !== 'all' ? { type } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { authorName: { contains: q } }, { intro: { contains: q } }] } : {}),
    }
    const [total, items, statusGroups] = await Promise.all([
      prisma.work.count({ where }),
      prisma.work.findMany({
        where,
        include: {
          tags: true,
          versions: { orderBy: { createdAt: 'desc' }, include: { attachments: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.work.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ])
    const stats = {
      total: 0,
      published: 0,
      offline: 0,
      deleted: 0,
      unpublished: 0,
    }
    for (const group of statusGroups) {
      const count = group._count._all
      stats.total += count
      if (group.status === 'published') stats.published = count
      else if (group.status === 'offline') stats.offline = count
      else if (group.status === 'deleted') stats.deleted = count
      else if (group.status === 'unpublished') stats.unpublished = count
    }
    const workIds = items.map((work) => work.id)
    const [myLikes, myFavorites] = await Promise.all([
      prisma.userLike.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
      prisma.userFavorite.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
    ])
    const likedIds = new Set(myLikes.map((item) => item.workId))
    const favoriteIds = new Set(myFavorites.map((item) => item.workId))
    res.json({
      items: items.map((work) => ({
        ...work,
        category: displayBusinessDomainName(work.category),
        tags: work.tags.map((tag) => tag.name),
        likedByMe: likedIds.has(work.id),
        favoritedByMe: favoriteIds.has(work.id),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      stats,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/works/recommended —— 后台查看全部推荐作品。
// 作品大厅接口只展示前 5 条；后台必须返回全部历史推荐，才能清理旧数据。
router.get('/works/recommended', requirePermission('admin:recommend'), async (_req, res, next) => {
  try {
    const works = await prisma.work.findMany({
      where: { recommended: true, status: 'published' },
      include: { tags: true, versions: { orderBy: { createdAt: 'desc' } }, attachments: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    })
    res.json(works.map((work) => ({
      ...work,
      category: displayBusinessDomainName(work.category),
      tags: work.tags.map((tag) => tag.name),
      likedByMe: false,
      favoritedByMe: false,
    })))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/works/:id/recommend —— 切换推荐状态
router.post('/works/:id/recommend', requirePermission('admin:recommend'), async (req, res, next) => {
  try {
    const exists = await prisma.work.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!exists) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    let updated: Awaited<ReturnType<typeof prisma.work.update>> | undefined
    for (let attempt = 0; attempt < 3 && !updated; attempt += 1) {
      try {
        updated = await prisma.$transaction(async (tx) => {
          const work = await tx.work.findUnique({ where: { id: req.params.id } })
          if (!work) throw new Error('BUSINESS_作品不存在')
          // 取消推荐始终允许；新增推荐必须由服务端校验发布状态和全局上限。
          if (!work.recommended) {
            if (work.status !== 'published') throw new Error('BUSINESS_只有已发布作品可以推荐')
            const count = await tx.work.count({ where: { recommended: true, status: 'published' } })
            if (count >= 5) throw new Error('BUSINESS_推荐作品最多 5 个，请先取消其他推荐')
          }
          return tx.work.update({
            where: { id: req.params.id },
            data: { recommended: !work.recommended },
          })
        }, { isolationLevel: 'Serializable' })
      } catch (error: any) {
        if (error?.code === 'P2034' && attempt < 2) continue
        throw error
      }
    }
    if (!updated) throw new Error('BUSINESS_推荐状态更新失败，请重试')
    res.json({ recommended: updated.recommended })
  } catch (err) {
    next(err)
  }
})

// ============ v1.8：管理员作品管理（下架/上架/删除） ============
// 权限：拥有 admin:workManage 的管理角色
// 这些接口允许管理员管理平台任意作品，绕过 work:deleteOwn / work:offlineOwn 的"仅自己"限制

// POST /api/admin/works/:id/offline —— 管理员下架作品（已发布 → 已下架）
router.post('/works/:id/offline', requirePermission('admin:workManage'), async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    if (reason.length < 5) {
      res.status(400).json({ error: '强制下架原因至少 5 个字符', code: 'VALIDATION_ERROR' })
      return
    }
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status !== 'published') {
      res.status(400).json({ error: '只有已发布作品可以下架', code: 'BUSINESS_ERROR' })
      return
    }
    await prisma.work.update({ where: { id: req.params.id }, data: { status: 'offline' } })
    res.json({ success: true, status: 'offline', reason })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/works/:id/republish —— 管理员上架作品（已下架 → 已发布）
router.post('/works/:id/republish', requirePermission('admin:workManage'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({
      where: { id: req.params.id },
      include: { versions: true },
    })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status !== 'offline') {
      res.status(400).json({ error: '只有已下架作品可以上架', code: 'BUSINESS_ERROR' })
      return
    }
    // 若有候选版本（审核通过但因作品下架未自动上线），手动上线
    const candidate = work.versions.find((v) => v.candidate)
    if (candidate) {
      await publishApprovedCandidate(work.id, candidate.id)
    } else {
      await prisma.work.update({ where: { id: work.id }, data: { status: 'published' } })
    }
    res.json({ success: true, status: 'published' })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/works/:id —— 管理员软删除作品（任意状态 → 已删除）
router.delete('/works/:id', requirePermission('admin:workManage'), async (req, res, next) => {
  try {
    const work = await prisma.work.findUnique({ where: { id: req.params.id } })
    if (!work) {
      res.status(404).json({ error: '作品不存在', code: 'NOT_FOUND' })
      return
    }
    if (work.status === 'deleted') {
      res.status(400).json({ error: '作品已删除，不可重复操作', code: 'BUSINESS_ERROR' })
      return
    }
    await prisma.work.update({ where: { id: req.params.id }, data: { status: 'deleted' } })
    res.json({ success: true, status: 'deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
