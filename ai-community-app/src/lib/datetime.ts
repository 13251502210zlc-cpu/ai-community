// v2.0：统一时间格式化工具，强制使用北京时间（UTC+8）显示
// 后端 API 返回的是 UTC ISO 字符串（如 2026-08-10T09:00:00.000Z），
// 前端必须转换为北京时间后再显示，否则会差 8 小时。

const TZ = 'Asia/Shanghai'

/**
 * 格式化为日期时间：YYYY-MM-DD HH:mm（北京时间）
 * 入参支持：ISO 字符串、Date 对象、undefined/null（返回空串）
 */
export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const y = d.toLocaleString('zh-CN', { timeZone: TZ, year: 'numeric' })
  const m = d.toLocaleString('zh-CN', { timeZone: TZ, month: '2-digit' })
  const day = d.toLocaleString('zh-CN', { timeZone: TZ, day: '2-digit' })
  const hh = d.toLocaleString('zh-CN', { timeZone: TZ, hour: '2-digit', hour12: false })
  const mm = d.toLocaleString('zh-CN', { timeZone: TZ, minute: '2-digit' })
  return `${y}-${m}-${day} ${hh}:${mm}`
}

/**
 * 格式化为日期：YYYY-MM-DD（北京时间）
 */
export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const y = d.toLocaleString('zh-CN', { timeZone: TZ, year: 'numeric' })
  const m = d.toLocaleString('zh-CN', { timeZone: TZ, month: '2-digit' })
  const day = d.toLocaleString('zh-CN', { timeZone: TZ, day: '2-digit' })
  return `${y}-${m}-${day}`
}

/**
 * 当前北京时间日期时间：YYYY-MM-DD HH:mm
 */
export function nowDateTime(): string {
  return formatDateTime(new Date())
}

/**
 * 当前北京时间日期：YYYY-MM-DD
 */
export function nowDate(): string {
  return formatDate(new Date())
}
