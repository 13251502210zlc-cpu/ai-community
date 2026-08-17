import 'dotenv/config'
import jwt from 'jsonwebtoken'
import type { User } from '@prisma/client'

const configuredSecret = process.env.AUTH_SECRET
if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('AUTH_SECRET must be configured with at least 32 characters in production')
}
const AUTH_SECRET = configuredSecret || 'ai-community-local-development-only-secret'
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export interface JwtPayload {
  userId: string
  // v1.7：多角色（数组）；兼容旧 token 的单 role 字段
  roles?: string[]
  role?: string
  name: string
  // 登录方式：wecom | password
  loginType?: 'wecom' | 'password'
  sessionId?: string
  deviceType?: 'pc' | 'mobile'
}

export function detectDeviceType(userAgent = ''): 'pc' | 'mobile' {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent) ? 'mobile' : 'pc'
}

// 签发 JWT
export function signToken(payload: JwtPayload, expiresIn: jwt.SignOptions['expiresIn'] = TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn']): string {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn })
}

// 验证 JWT，失败返回 null
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, AUTH_SECRET) as JwtPayload
  } catch {
    return null
  }
}

// 从请求头提取并验证 JWT，返回 payload 或 null
export function extractUserFromAuthHeader(authHeader?: string): JwtPayload | null {
  if (!authHeader) return null
  // 支持 "Bearer <token>" 或纯 token
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  return verifyToken(token)
}
