export const ARCHIVED_DOMAIN_PREFIX = '__archived_domain__:'

// 删除仍被历史作品引用的业务领域时，数据库保留带前缀的归档值。
// 对外响应始终还原原名称，避免管理页面暴露内部归档编码。
export function displayBusinessDomainName(value: string | null | undefined): string {
  if (!value || !value.startsWith(ARCHIVED_DOMAIN_PREFIX)) return value || ''
  const archivedValue = value.slice(ARCHIVED_DOMAIN_PREFIX.length)
  const separatorIndex = archivedValue.indexOf(':')
  return separatorIndex >= 0 ? archivedValue.slice(separatorIndex + 1) : archivedValue
}
