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

// 格式化时间为统一展示格式 YYYY/M/D H:mm（北京时间）
function formatTime(date: Date): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${values.year}/${values.month}/${values.day} ${Number(values.hour)}:${values.minute}`
}

// 前端筛选项包含聚合枚举，数据库保存的是更精确的动作值。
// 同时兼容历史上直接保存的聚合值，避免旧日志查不到。
function actionCondition(action: string): Record<string, unknown> {
  const legacyLogout = { action: '创建', content: { contains: '/api/auth/logout' } }
  const legacyRoleAssignment = {
    AND: [
      { action: '更新' },
      { content: { contains: '/api/admin/users/' } },
      { content: { contains: '/role' } },
    ],
  }
  if (action === '创建') return { action: '创建', NOT: { content: { contains: '/api/auth/logout' } } }
  if (action === '更新') return { action: '更新', NOT: legacyRoleAssignment }
  if (action === '审核') return { action: { in: ['审核', '审核通过', '审核驳回', '提交审核'] } }
  if (action === '上架/下架') return { action: { in: ['上架', '下架', '上架/下架'] } }
  if (action === '登录/登出') {
    return { OR: [{ action: { in: ['登录', '登出', '登录/登出'] } }, legacyLogout] }
  }
  if (action === '角色分配') return { OR: [{ action: '角色分配' }, legacyRoleAssignment] }
  return { action }
}

function appendWhereCondition(where: Record<string, any>, condition: Record<string, unknown>) {
  where.AND = [...(where.AND || []), condition]
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
    if (actionFilter) appendWhereCondition(where, actionCondition(actionFilter))

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
      const terms = Array.from(new Set([keyword.trim(), keyword.trim().replace(/[\/／]/g, '')])).filter(Boolean)
      appendWhereCondition(where, { OR: [
        ...terms.flatMap((term) => [
          { operatorName: { contains: term } },
          { content: { contains: term } },
          { target: { contains: term } },
          { action: { contains: term } },
          { module: { contains: term } },
          { id: { contains: term } },
        ]),
      ] })
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
    if (actionFilter) appendWhereCondition(where, actionCondition(actionFilter))
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
      const terms = Array.from(new Set([keyword.trim(), keyword.trim().replace(/[\/／]/g, '')])).filter(Boolean)
      appendWhereCondition(where, { OR: [
        ...terms.flatMap((term) => [
          { operatorName: { contains: term } },
          { content: { contains: term } },
          { target: { contains: term } },
          { action: { contains: term } },
          { module: { contains: term } },
          { id: { contains: term } },
        ]),
      ] })
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
    // v2.0：使用北京时间日期作为文件名（process.env.TZ 已设为 Asia/Shanghai）
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    res.setHeader('Content-Disposition', `attachment; filename="operation-logs-${today}.csv"`)
    res.send('\ufeff' + csv)
  } catch (err) {
    next(err)
  }
})

export default router
