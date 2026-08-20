// v2.1：统一时间格式化工具，强制使用北京时间（UTC+8）显示
// 后端 API 返回的是 UTC ISO 字符串（如 2026-08-10T09:00:00.000Z），
// 前端必须转换为北京时间后再显示，否则会差 8 小时。

const TZ = 'Asia/Shanghai'

/**
 * 格式化为日期时间：YYYY/M/D H:mm（北京时间）
 * 入参支持：ISO 字符串、Date 对象、undefined/null（返回空串）
 */
export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return ''
  const d = toDate(date)
  if (isNaN(d.getTime())) return ''
  const parts = getParts(d)
  return `${parts.year}/${parts.month}/${parts.day} ${Number(parts.hour)}:${parts.minute}`
}

/**
 * 格式化为日期：YYYY/M/D（北京时间）
 */
export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return ''
  const d = toDate(date)
  if (isNaN(d.getTime())) return ''
  const parts = getParts(d)
  return `${parts.year}/${parts.month}/${parts.day}`
}

/**
 * 当前北京时间日期时间：YYYY/M/D H:mm
 */
export function nowDateTime(): string {
  return formatDateTime(new Date())
}

/**
 * 当前北京时间日期：YYYY/M/D
 */
export function nowDate(): string {
  return formatDate(new Date())
}

/** 将界面时间或 ISO 时间转成时间戳，供排序使用。 */
export function dateTimeValue(date: string | Date | undefined | null): number {
  if (!date) return 0
  const value = toDate(date).getTime()
  return Number.isNaN(value) ? 0 : value
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
})

function getParts(date: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> {
  const values = Object.fromEntries(
    DATE_TIME_FORMATTER.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return values as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>
}

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  // 已格式化的无时区字符串按北京时间解释，避免客户端处于其他时区时二次格式化产生偏移。
  const local = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!local) return new Date(value)
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = local
  const pad = (part: string) => part.padStart(2, '0')
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+08:00`)
}
