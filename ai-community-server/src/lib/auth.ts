import type { Request, Response, NextFunction } from 'express'
import { ROLE_PERMISSIONS, type Permission, type UserRole } from './permissions.js'
import { extractUserFromAuthHeader } from './jwt.js'
import { prisma } from './prisma.js'

// v1.4：认证中间件——优先 JWT，兼容旧版 x-user-id header（演示模式）
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      // v1.7：多角色（数组）；保留 userRole 兼容旧代码（取 roles[0]）
      userRoles?: UserRole[]
      userRole?: UserRole
      userName?: string
      // v1.4：登录方式
      loginType?: 'wecom' | 'password' | 'demo'
      sessionId?: string
      deviceType?: 'pc' | 'mobile'
    }
  }
}

// v1.4：认证中间件
// 1. 优先从 Authorization: Bearer <token> 读取 JWT
// 2. 回退到 x-user-id header（兼容旧版演示模式 + 前端未集成 JWT 时的过渡期）
export async function authRequired(req: Request, res: Response, next: NextFunction) {
  // 方式 1：JWT Token
  const authHeader = req.header('authorization')
  const jwtPayload = extractUserFromAuthHeader(authHeader)
  if (jwtPayload) {
    try {
      if (process.env.NODE_ENV === 'production' && (!jwtPayload.sessionId || !jwtPayload.deviceType)) {
        res.status(401).json({ error: '登录凭证已升级，请重新登录', code: 'SESSION_UPGRADE_REQUIRED' })
        return
      }
      const user = await prisma.user.findUnique({
        where: { id: jwtPayload.userId },
        include: { assignedRoles: true },
      })
      if (!user) {
        res.status(401).json({ error: '登录用户不存在', code: 'UNAUTHORIZED' })
        return
      }
      if (user.accountStatus === 'disabled') {
        res.status(403).json({ error: '账号已被禁用，请联系管理员', code: 'ACCOUNT_DISABLED' })
        return
      }
      if (user.accountStatus === 'locked' && user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        res.status(403).json({ error: '账号已锁定，请稍后重试', code: 'ACCOUNT_LOCKED' })
        return
      }
      if (jwtPayload.sessionId && jwtPayload.deviceType) {
        const activeSessionId = jwtPayload.deviceType === 'mobile' ? user.mobileSessionId : user.pcSessionId
        if (activeSessionId !== jwtPayload.sessionId) {
          res.status(401).json({ error: '账号已在另一台设备登录，请重新登录', code: 'SESSION_REPLACED' })
          return
        }
      }

      const roles = user.assignedRoles.length > 0
        ? user.assignedRoles.map((item) => item.role as UserRole)
        : [user.role as UserRole]
      req.userId = user.id
      req.userRoles = roles
      req.userRole = roles[0]
      req.userName = user.name
      req.loginType = jwtPayload.loginType || 'wecom'
      req.sessionId = jwtPayload.sessionId
      req.deviceType = jwtPayload.deviceType
      next()
      return
    } catch (error) {
      next(error)
      return
    }
  }

  // 方式 2：兼容旧版 header（演示模式，正式上线后可移除）
  const allowDemoHeaders = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AUTH_HEADERS === 'true'
  const userId = allowDemoHeaders ? req.header('x-user-id') : undefined
  if (userId) {
    req.userId = userId
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, include: { assignedRoles: true } })
      if (!user || user.accountStatus !== 'active') {
        res.status(401).json({ error: '演示用户无效', code: 'UNAUTHORIZED' })
        return
      }
      const roles = user.assignedRoles.length > 0
        ? user.assignedRoles.map((item) => item.role as UserRole)
        : [user.role as UserRole]
      req.userId = user.id
      req.userRoles = roles
      req.userRole = roles[0]
      req.userName = user.name
      req.loginType = 'demo'
      next()
      return
    } catch (error) {
      next(error)
      return
    }
  }

  res.status(401).json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' })
}

// 权限校验中间件工厂（v1.7：基于多角色并集）
export async function getEffectivePermissions(userRoles: UserRole[]): Promise<Permission[]> {
  const rows = await prisma.rolePermission.findMany({ where: { role: { in: userRoles } } })
  const configuredRoles = new Set(rows.map((row) => row.role))
  const effective = new Set<Permission>()

  for (const role of userRoles) {
    if (configuredRoles.has(role)) {
      rows
        .filter((row) => row.role === role && row.allowed)
        .forEach((row) => effective.add(row.permission as Permission))
    } else {
      ROLE_PERMISSIONS[role]?.forEach((permission) => effective.add(permission))
    }
  }

  return Array.from(effective)
}

export function requirePermission(...perms: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRoles || req.userRoles.length === 0) {
      res.status(401).json({ error: '未登录', code: 'UNAUTHORIZED' })
      return
    }
    try {
      const effective = await getEffectivePermissions(req.userRoles)
      if (!perms.some((permission) => effective.includes(permission))) {
        res.status(403).json({ error: '权限不足', code: 'FORBIDDEN' })
        return
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
