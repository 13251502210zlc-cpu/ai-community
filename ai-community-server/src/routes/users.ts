import { Router, type RequestHandler } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { authRequired, getEffectivePermissions } from '../lib/auth.js'
import { detectDeviceType, signToken } from '../lib/jwt.js'

const router = Router()
// 用户内容使用独立路由挂载到 /api/users；/api/auth/users 保留向后兼容。
export const userContentRouter = Router()

// 密码失败次数上限，超过锁定 15 分钟
const MAX_FAILED_LOGIN = 5
const LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * POST /api/auth/login —— 账号密码登录
 * body: { account: string, password: string }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { account, password, rememberMe = false } = req.body as { account?: string; password?: string; rememberMe?: boolean }

    if (!account || !password) {
      res.status(400).json({ error: '请输入账号和密码', code: 'VALIDATION_ERROR' })
      return
    }
    if (typeof account !== 'string' || typeof password !== 'string' || account.trim().length > 100 || password.length > 128) {
      res.status(400).json({ error: '账号或密码长度超出限制', code: 'VALIDATION_ERROR' })
      return
    }
    const normalizedAccount = account.trim()

    // 按登录账号或工号查找用户
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { loginAccount: normalizedAccount },
          { employeeId: normalizedAccount },
        ],
        loginMethod: { in: ['password', 'both'] },
      },
    })

    if (!user) {
      await bcrypt.compare(password, '$2b$12$gZ24fDX8wQmRZxlZxbS1Yuw.9fLFwX4n3kR91oWzN.0Vg/XwX2i5u')
      res.status(401).json({ error: '账号或密码错误', code: 'INVALID_CREDENTIALS' })
      return
    }

    // 校验账号状态
    if (user.accountStatus === 'disabled') {
      res.status(403).json({ error: '账号已被禁用，请联系管理员', code: 'ACCOUNT_DISABLED' })
      return
    }
    if (user.accountStatus === 'locked' && user.lockedUntil && Date.now() < user.lockedUntil.getTime()) {
      const remainMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      res.status(403).json({
        error: `账号已锁定，请 ${remainMin} 分钟后重试或联系管理员`,
        code: 'ACCOUNT_LOCKED',
      })
      return
    }

    // 校验密码（兼容明文存储的演示数据和 bcrypt 哈希）
    const storedPwd = user.password || ''
    let passwordOk = false
    if (storedPwd.startsWith('$2a$') || storedPwd.startsWith('$2b$') || storedPwd.startsWith('$2y$')) {
      passwordOk = await bcrypt.compare(password, storedPwd)
    } else {
      // 演示数据明文比对（生产环境不应走到这里）
      passwordOk = storedPwd === password
    }

    if (!passwordOk) {
      // 失败次数 +1，达到上限则锁定
      const failedCount = user.failedLoginCount + 1
      const shouldLock = failedCount >= MAX_FAILED_LOGIN
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failedCount,
          accountStatus: shouldLock ? 'locked' : user.accountStatus,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : user.lockedUntil,
        },
      })
      const remain = MAX_FAILED_LOGIN - failedCount
      res.status(401).json({
        error: shouldLock
          ? '密码错误次数过多，账号已锁定 15 分钟'
          : `账号或密码错误，还可尝试 ${remain} 次`,
        code: 'INVALID_CREDENTIALS',
      })
      return
    }

    // 登录成功：重置失败次数、更新登录时间；自动迁移历史明文密码
    const passwordNeedsUpgrade = storedPwd.length > 0 && !/^\$2[aby]\$/.test(storedPwd)
    const deviceType = detectDeviceType(req.get('user-agent') || '')
    const sessionId = crypto.randomUUID()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        accountStatus: user.accountStatus === 'locked' ? 'active' : user.accountStatus,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(passwordNeedsUpgrade ? { password: await bcrypt.hash(password, 12) } : {}),
        ...(deviceType === 'mobile' ? { mobileSessionId: sessionId } : { pcSessionId: sessionId }),
      },
    })

    // v1.7：读取用户多角色（assignedRoles 关联表）
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      include: { assignedRoles: true },
    })
    const roles = userWithRoles?.assignedRoles?.map((r) => r.role) || [user.role]

    await prisma.operationLog.create({
      data: {
        time: new Date(),
        operatorId: user.id,
        operatorName: user.name,
        department: user.department,
        role: roles.join('、'),
        module: '登录认证',
        action: '登录',
        content: '账号密码登录成功',
        target: user.employeeId || user.loginAccount || user.id,
        ip: req.ip || req.socket.remoteAddress || '',
        result: 'success',
      },
    })

    // 签发 JWT（v1.7：roles 数组）
    const token = signToken({
      userId: user.id,
      roles,
      name: user.name,
      loginType: 'password',
      sessionId,
      deviceType,
    }, rememberMe ? '7d' : '12h')

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        roles,
        department: user.department,
        position: user.position,
        avatarColor: user.avatarColor,
        avatar: user.avatar,
        employeeId: user.employeeId,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/auth/logout —— 退出登录
 * JWT 是无状态的，前端丢弃 token 即可；此接口用于记录登出事件
 */
router.post('/logout', authRequired, async (req, res, next) => {
  try {
    if (req.sessionId && req.deviceType) {
      await prisma.user.updateMany({
        where: {
          id: req.userId,
          ...(req.deviceType === 'mobile' ? { mobileSessionId: req.sessionId } : { pcSessionId: req.sessionId }),
        },
        data: req.deviceType === 'mobile' ? { mobileSessionId: null } : { pcSessionId: null },
      })
    }
    res.json({ success: true, message: '已退出登录' })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/me —— 当前登录用户
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { assignedRoles: true },
    })
    if (!user) {
      res.status(404).json({ error: '用户不存在', code: 'NOT_FOUND' })
      return
    }
    // v1.7：多角色（assignedRoles 关联表）
    const roles = user.assignedRoles?.map((r) => r.role) || [user.role]
    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      roles,
      department: user.department,
      position: user.position,
      avatarColor: user.avatarColor,
      avatar: user.avatar,
      employeeId: user.employeeId,
      loginMethod: user.loginMethod,
      accountStatus: user.accountStatus,
      lastLoginAt: user.lastLoginAt,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/permissions —— 当前登录用户的服务端实际生效权限
router.get('/permissions', authRequired, async (req, res, next) => {
  try {
    const permissions = await getEffectivePermissions(req.userRoles || [])
    res.json({ permissions })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/switch-role —— 切换/设置角色（v1.7：支持多角色）
// body: { roles: UserRole[] } —— 设置多个角色（权限取并集）
// 兼容旧版 { role: UserRole } —— 单角色设置
router.post('/switch-role', authRequired, async (req, res, next) => {
  try {
    res.status(403).json({
      error: '用户不能自行切换或分配系统角色，请联系超级管理员',
      code: 'FORBIDDEN',
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/users/:id/works —— 用户的作品列表
const getUserWorks: RequestHandler = async (req, res, next) => {
  try {
    if (req.params.id !== req.userId && !(req.userRoles || []).some((role) => ['reviewer', 'operator', 'super_admin'].includes(role))) {
      res.status(403).json({ error: '无权查看其他用户的非公开作品', code: 'FORBIDDEN' })
      return
    }
    const works = await prisma.work.findMany({
      where: { authorId: req.params.id, status: { not: 'deleted' } },
      include: {
        tags: true,
        versions: { include: { reviewer: true, attachments: true }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    const workIds = works.map((work) => work.id)
    const [myLikes, myFavorites] = await Promise.all([
      prisma.userLike.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
      prisma.userFavorite.findMany({ where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true } }),
    ])
    const likedIds = new Set(myLikes.map((item) => item.workId))
    const favoriteIds = new Set(myFavorites.map((item) => item.workId))
    res.json(
      works.map((w) => ({
        ...w,
        tags: w.tags.map((t) => t.name),
        coreAbilities: w.coreAbilities ? JSON.parse(w.coreAbilities) : [],
        versions: w.versions.map((version) => ({
          ...version,
          reviewer: version.reviewer?.name,
        })),
        likedByMe: likedIds.has(w.id),
        favoritedByMe: favoriteIds.has(w.id),
      }))
    )
  } catch (err) {
    next(err)
  }
}

// GET /api/users/:id/favorites —— 用户收藏的作品
const getUserFavorites: RequestHandler = async (req, res, next) => {
  try {
    if (req.params.id !== req.userId) {
      res.status(403).json({ error: '只能查看自己的收藏', code: 'FORBIDDEN' })
      return
    }
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 9))
    const where = { userId: req.params.id, work: { status: 'published' } }
    const [favorites, total] = await Promise.all([prisma.userFavorite.findMany({
      where,
      include: {
        work: { include: { tags: true } },
      },
      orderBy: { work: { publishedAt: 'desc' } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }), prisma.userFavorite.count({ where })])
    const workIds = favorites.map((favorite) => favorite.workId)
    const myLikes = await prisma.userLike.findMany({
      where: { userId: req.userId!, workId: { in: workIds } },
      select: { workId: true },
    })
    const likedIds = new Set(myLikes.map((item) => item.workId))
    res.json({
      items: favorites.map((f) => ({
        ...f.work,
        tags: f.work.tags.map((t) => t.name),
        likedByMe: likedIds.has(f.workId),
        favoritedByMe: true,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/users/:id/likes —— 用户点赞的已发布作品（分页）
const getUserLikes: RequestHandler = async (req, res, next) => {
  try {
    if (req.params.id !== req.userId) {
      res.status(403).json({ error: '只能查看自己的点赞', code: 'FORBIDDEN' })
      return
    }
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 9))
    const where = { userId: req.params.id, work: { status: 'published' } }
    const [likes, total] = await Promise.all([
      prisma.userLike.findMany({
        where,
        include: { work: { include: { tags: true } } },
        orderBy: { work: { publishedAt: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.userLike.count({ where }),
    ])
    const workIds = likes.map((like) => like.workId)
    const favorites = await prisma.userFavorite.findMany({
      where: { userId: req.userId!, workId: { in: workIds } }, select: { workId: true },
    })
    const favoriteIds = new Set(favorites.map((item) => item.workId))
    res.json({
      items: likes.map((like) => ({
        ...like.work,
        tags: like.work.tags.map((tag) => tag.name),
        likedByMe: true,
        favoritedByMe: favoriteIds.has(like.workId),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/users/:id/summary —— 个人中心权威统计，避免由前端当前页反推。
const getUserSummary: RequestHandler = async (req, res, next) => {
  try {
    if (req.params.id !== req.userId) {
      res.status(403).json({ error: '只能查看自己的统计', code: 'FORBIDDEN' })
      return
    }
    const [totalWorks, publishedWorks, favorites, likes, interactions] = await Promise.all([
      prisma.work.count({ where: { authorId: req.params.id, status: { not: 'deleted' } } }),
      prisma.work.count({ where: { authorId: req.params.id, status: 'published' } }),
      prisma.userFavorite.count({ where: { userId: req.params.id, work: { status: 'published' } } }),
      prisma.userLike.count({ where: { userId: req.params.id, work: { status: 'published' } } }),
      prisma.work.aggregate({
        where: { authorId: req.params.id, status: { not: 'deleted' } },
        _sum: { likes: true, favorites: true, downloads: true, views: true },
      }),
    ])
    const sums = interactions._sum
    res.json({
      totalWorks,
      publishedWorks,
      favorites,
      likes,
      interactions: (sums.likes || 0) + (sums.favorites || 0) + (sums.downloads || 0) + (sums.views || 0),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/users/:id/review-progress —— 按作品分组返回审核轨迹。
const getUserReviewProgress: RequestHandler = async (req, res, next) => {
  try {
    if (req.params.id !== req.userId) {
      res.status(403).json({ error: '只能查看自己的审核进度', code: 'FORBIDDEN' })
      return
    }
    const works = await prisma.work.findMany({
      where: { authorId: req.params.id, status: { not: 'deleted' } },
      select: {
        id: true, title: true, type: true, status: true,
        events: { orderBy: { createdAt: 'desc' }, include: { reviewer: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(works.filter((work) => work.events.length > 0).map((work) => ({
      workId: work.id,
      workTitle: work.title,
      workType: work.type,
      workStatus: work.status,
      events: work.events.map((event) => ({
        id: event.id, version: event.version, status: event.status, reason: event.reason,
        reviewer: event.reviewer?.name, createdAt: event.createdAt,
      })),
    })))
  } catch (err) {
    next(err)
  }
}

// 标准接口：/api/users/:id/*
userContentRouter.get('/:id/works', authRequired, getUserWorks)
userContentRouter.get('/:id/favorites', authRequired, getUserFavorites)
userContentRouter.get('/:id/likes', authRequired, getUserLikes)
userContentRouter.get('/:id/summary', authRequired, getUserSummary)
userContentRouter.get('/:id/review-progress', authRequired, getUserReviewProgress)

// 兼容已上线前端及旧调用方：/api/auth/users/:id/*
router.get('/users/:id/works', authRequired, getUserWorks)
router.get('/users/:id/favorites', authRequired, getUserFavorites)
router.get('/users/:id/likes', authRequired, getUserLikes)
router.get('/users/:id/summary', authRequired, getUserSummary)
router.get('/users/:id/review-progress', authRequired, getUserReviewProgress)

export default router
