// v2.0：操作日志路由——记录、查询、导出
// 权限规则（与前端 Admin.tsx 保持一致）：
//   - 记录日志：任意已登录用户（系统自动调用，前端不可手动新增/修改/删除）
//   - 查询日志：审核管理员/运营管理员可查看自身记录；超级管理员可查看全部
//   - 导出日志：仅超级管理员

import { Router, type Request, type Response, type NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'
import { authRequired } from '../lib/auth.js'
import { ROLE_LABELS, type UserRole } from '../lib/permissions.js'

const router = Router()

// 角色判断辅助
function hasRole(roles: string[] | undefined, ...target: string[]): boolean {
  if (!roles || roles.length === 0) return false
  return roles.some((r) => target.includes(r))
}

// 提取客户端真实 IP（反向代理后取 X-Forwarded-For 首段）
function getClientIp(req: Request): string {
  const xff = req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.socket.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1'
}

// 格式化时间为前端展示格式 YYYY-MM-DD HH:mm:ss
function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 将数据库记录转换为前端 OperationLog 结构
function transformLog(raw: any) {
  return {
    id: raw.id,
    time: formatTime(raw.time),
    operatorId: raw.operatorId,
    operatorName: raw.operatorName,
    department: raw.department,
    role: raw.role,
    module: raw.module,
    action: raw.action,
    content: raw.content,
    target: raw.target,
    ip: raw.ip,
    result: raw.result,
  }
}

// POST /api/operation-logs —— 记录操作日志（系统自动调用）
// 任意已登录用户均可调用；操作人信息从 JWT / 数据库获取，前端不可伪造
router.post('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  res.status(405).json({ error: '操作日志只能由服务端自动写入', code: 'METHOD_NOT_ALLOWED' })
})

// GET /api/operation-logs —— 查询操作日志（分页 + 筛选）
// 权限：审核管理员/运营管理员可查看自身记录；超级管理员可查看全部
// 查询参数：page, pageSize, module, action, startDate, endDate, keyword, operatorId(仅超管可用)
router.get('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = req.userRoles || []

    // 权限校验：至少需要审核管理员或运营管理员
    if (!hasRole(roles, 'reviewer', 'operator', 'super_admin')) {
      res.status(403).json({ error: '权限不足，无法查看操作日志', code: 'FORBIDDEN' })
      return
    }

    const isSuperAdmin = hasRole(roles, 'super_admin')

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const moduleFilter = (req.query.module as string) || ''
    const actionFilter = (req.query.action as string) || ''
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const keyword = (req.query.keyword as string) || ''

    // 构建 where 条件
    const where: any = {}

    // 非超级管理员强制只查自身
    if (!isSuperAdmin) {
      where.operatorId = req.userId
    } else if (req.query.operatorId) {
      // 超管可按操作人过滤
      where.operatorId = req.query.operatorId
    }

    if (moduleFilter) where.module = moduleFilter
    if (actionFilter) where.action = actionFilter

    // 时间范围过滤
    if (startDate || endDate) {
      where.time = {}
      if (startDate) where.time.gte = new Date(startDate)
      // endDate 取当天结束
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.time.lte = end
      }
    }

    // 关键词搜索（操作人、操作内容、操作对象、日志ID）
    if (keyword.trim()) {
      where.OR = [
        { operatorName: { contains: keyword } },
        { content: { contains: keyword } },
        { target: { contains: keyword } },
        { id: { contains: keyword } },
      ]
    }

    const [total, rows] = await Promise.all([
      prisma.operationLog.count({ where }),
      prisma.operationLog.findMany({
        where,
        orderBy: { time: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({
      items: rows.map(transformLog),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/operation-logs/export —— 导出操作日志为 CSV（仅超级管理员）
router.get('/export', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = req.userRoles || []
    if (!hasRole(roles, 'super_admin')) {
      res.status(403).json({ error: '仅超级管理员可导出操作日志', code: 'FORBIDDEN' })
      return
    }

    // 复用查询条件（不分页，最多导出 5000 条）
    const moduleFilter = (req.query.module as string) || ''
    const actionFilter = (req.query.action as string) || ''
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const keyword = (req.query.keyword as string) || ''

    const where: any = {}
    if (moduleFilter) where.module = moduleFilter
    if (actionFilter) where.action = actionFilter
    if (startDate || endDate) {
      where.time = {}
      if (startDate) where.time.gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        where.time.lte = end
      }
    }
    if (keyword.trim()) {
      where.OR = [
        { operatorName: { contains: keyword } },
        { content: { contains: keyword } },
        { target: { contains: keyword } },
        { id: { contains: keyword } },
      ]
    }

    const rows = await prisma.operationLog.findMany({
      where,
      orderBy: { time: 'desc' },
      take: 5000,
    })

    // 生成 CSV（带 BOM 防止 Excel 中文乱码）
    const header = ['日志ID', '操作时间', '操作人', '部门', '角色', '模块', '操作类型', '操作内容', '操作对象', 'IP地址', '结果']
    const csvRows = rows.map((l) => [
      l.id,
      formatTime(l.time),
      l.operatorName,
      l.department,
      l.role,
      l.module,
      l.action,
      l.content,
      l.target,
      l.ip,
      l.result === 'success' ? '成功' : '失败',
    ])
    const csv = [header, ...csvRows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="operation-logs-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send('\ufeff' + csv)
  } catch (err) {
    next(err)
  }
})

export default router
