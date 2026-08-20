import type { NextFunction, Request, Response } from 'express'
import { prisma } from './prisma.js'
import { ROLE_LABELS, type UserRole } from './permissions.js'

function moduleForPath(path: string): string {
  if (path.includes('/auth/')) return '登录认证'
  if (path.includes('/versions/') || path.includes('/review/')) return '审核管理'
  if (path.includes('/admin/')) return '后台管理'
  if (path.includes('/upload/')) return '作品发布'
  if (path.includes('/works/')) return '作品管理'
  return '系统'
}

function actionForMethod(method: string, path: string): string {
  if (path.includes('/auth/logout')) return '登出'
  if (/\/admin\/users\/[^/?]+\/roles?(?:[/?]|$)/.test(path)) return '角色分配'
  if (path.includes('/approve')) return '审核通过'
  if (path.includes('/reject')) return '审核驳回'
  if (path.includes('/submit')) return '提交审核'
  if (path.includes('/offline')) return '下架'
  if (path.includes('/republish') || path.includes('/publish-candidate')) return '上架'
  if (method === 'POST') return '创建'
  if (method === 'PUT' || method === 'PATCH') return '更新'
  if (method === 'DELETE') return '删除'
  return method
}

function targetForPath(path: string): string {
  const workMatch = path.match(/\/works\/([^/?]+)/)
  return workMatch ? decodeURIComponent(workMatch[1]) : ''
}

export function auditMutations(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (!req.userId || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path.startsWith('/operation-logs')) return
    const roles = req.userRoles || ['user']
    void prisma.user.findUnique({ where: { id: req.userId }, select: { name: true, department: true } })
      .then((user) => prisma.operationLog.create({
        data: {
          time: new Date(),
          operatorId: req.userId!,
          operatorName: user?.name || req.userName || '未知用户',
          department: user?.department || '',
          role: roles.map((role) => ROLE_LABELS[role as UserRole] || role).join('、'),
          module: moduleForPath(req.originalUrl),
          action: actionForMethod(req.method, req.originalUrl),
          content: req.originalUrl.includes('/offline') && typeof req.body?.reason === 'string'
            ? `${req.method} ${req.originalUrl.split('?')[0]}；下架原因：${req.body.reason.trim()}`
            : `${req.method} ${req.originalUrl.split('?')[0]}`,
          // 此中间件挂载在路由之前，响应结束时 req.params 可能已被 Express 清空，
          // 因此从原始 URL 提取作品 ID，确保上下架日志有明确操作对象。
          target: req.params?.id || req.params?.workId || targetForPath(req.originalUrl),
          ip: (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, ''),
          result: res.statusCode < 400 ? 'success' : 'failed',
        },
      }))
      .catch((error) => console.error('[audit]', error))
  })
  next()
}

export async function archiveExpiredOperationLogs() {
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const expired = await prisma.operationLog.findMany({ where: { time: { lt: cutoff } }, take: 1000 })
  if (expired.length === 0) return 0
  await prisma.$transaction([
    prisma.archivedOperationLog.createMany({
      data: expired.map((log) => ({
        originalId: log.id,
        time: log.time,
        operatorId: log.operatorId,
        operatorName: log.operatorName,
        department: log.department,
        role: log.role,
        module: log.module,
        action: log.action,
        content: log.content,
        target: log.target,
        ip: log.ip,
        result: log.result,
      })),
    }),
    prisma.operationLog.deleteMany({ where: { id: { in: expired.map((log) => log.id) } } }),
  ])
  return expired.length
}
