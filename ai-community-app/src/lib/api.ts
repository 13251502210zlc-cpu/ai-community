// 前端 API 客户端（v1.4：JWT Token 管理 + 企业微信 OAuth 支持）
// 开发环境：http://localhost:3001
// 生产环境：相对路径 /api（由 nginx 反向代理到后端）

import type { Permission, UserRole, Work, WorkVersion } from '../types'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api'
const ASSET_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

// v1.4：JWT Token 存储 key
const TOKEN_KEY = 'ai-community-token'
// v1.4：用户信息存储 key（与 token 同步）
const USER_KEY = 'aic_current_user'
export const LOGIN_REDIRECT_KEY = 'aic-login-redirect'

// ============ Token 管理 ============

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string, rememberMe: boolean = false): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    ;(rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    // ignore
  }
}

// v1.4：从 URL hash 提取 OAuth 回调的 token（企业微信登录后重定向带回来）
export function extractTokenFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token=')) return null
  const match = hash.match(/access_token=([^&]+)/)
  if (match) {
    // 提取后清除 hash，避免 token 残留在 URL 中
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return decodeURIComponent(match[1])
  }
  return null
}

// ============ 请求头 ============

// v1.7：优先使用 JWT Token，未登录不带鉴权 header（后端返回 401 触发登录）
function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  // 未登录：不带鉴权 header，后端公开接口（如作品列表）仍可访问
  return {}
}

// ============ fetch 封装 ============

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string>),
  }
  // 非 FormData 请求设置 JSON content-type
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (error) {
    if (error instanceof TypeError) throw new Error('网络异常，请重试')
    throw error
  }

  // v1.4：401 时清除 token，触发重新登录
  if (res.status === 401) {
    clearToken()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      sessionStorage.setItem(LOGIN_REDIRECT_KEY, returnPath)
      window.location.replace(`/login?expired=1&redirect=${encodeURIComponent(returnPath)}`)
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    const detailMessage = Array.isArray(err.details) && typeof err.details[0]?.message === 'string'
      ? err.details[0].message
      : null
    throw new Error(detailMessage || err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ============ 公共数据查询 API（无需登录） ============

// 获取业务领域列表（公开，供作品大厅筛选）
export async function getPublicDomains(): Promise<string[]> {
  return apiFetch('/works/domains')
}

// 获取标签列表（公开，供作品大厅筛选）
export async function getPublicTags(): Promise<string[]> {
  return apiFetch('/works/tags')
}

// v2.0：作品大厅搜索/筛选（后端分页 + 全量数据查询，替代前端本地过滤）
// 支持关键词搜索、类型/业务领域/标签筛选、多维度排序
export async function searchWorks(params: {
  q?: string
  type?: string
  domain?: string
  tag?: string | string[]
  sort?: 'latest' | 'likes' | 'favorites' | 'downloads'
  page?: number
  pageSize?: number
}): Promise<{ items: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.type && params.type !== 'all') query.set('type', params.type)
  if (params.domain && params.domain !== 'all') query.set('domain', params.domain)
  if (params.tag) {
    if (Array.isArray(params.tag)) {
      if (params.tag.length > 0) params.tag.forEach((t) => query.append('tag', t))
    } else {
      query.set('tag', params.tag)
    }
  }
  if (params.sort) query.set('sort', params.sort)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const qs = query.toString()
  return apiFetch(`/works${qs ? `?${qs}` : ''}`)
}

// 获取单个作品最新详情（包含当前用户点赞/收藏状态）
export async function getWorkDetail(workId: string): Promise<any> {
  return apiFetch(`/works/${encodeURIComponent(workId)}`)
}

// v2.0：获取运营推荐作品（公开，作品大厅首屏展示）
export async function getRecommendedWorks(): Promise<any[]> {
  return apiFetch('/works/recommended')
}

// ============ 认证相关 API ============

// v1.4：账号密码登录
export async function loginWithPassword(account: string, password: string, rememberMe: boolean = false): Promise<{
  token: string
  user: {
    id: string
    name: string
    role: string
    roles: string[]
    department: string
    position: string
    avatarColor: string
    avatar?: string
    employeeId?: string
  }
}> {
  const data = await apiFetch<{ token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password, rememberMe }),
  })
  setToken(data.token, rememberMe)
  ;(rememberMe ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify(data.user))
  return data
}

// v1.4：获取企业微信授权 URL
export async function getWecomAuthUrl(silent: boolean = true): Promise<{ url: string; silent: boolean }> {
  return apiFetch(`/auth/wecom/url?silent=${silent ? 'true' : 'false'}`)
}

// v1.4：企业微信登录状态（含内嵌扫码登录配置）
export async function getWecomStatus(): Promise<{
  enabled: boolean
  scan: {
    corpId: string
    agentId: string
    redirectUri: string
    state: string
  } | null
}> {
  return apiFetch('/auth/wecom/status')
}

// v1.4：获取当前用户信息（用 token 换）
export async function getCurrentUser(): Promise<any> {
  return apiFetch('/auth/me')
}

// 获取当前用户在服务端实际生效的权限
export async function getMyPermissions(): Promise<Permission[]> {
  const data = await apiFetch<{ permissions: Permission[] }>('/auth/permissions')
  return data.permissions
}

// v1.4：退出登录
export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // 即使接口失败也清除本地 token
  }
  clearToken()
}

// v1.4：健康检查（获取登录方式可用性）
export async function getHealthStatus(): Promise<{
  status: string
  auth: { wecom: boolean; password: boolean }
}> {
  return apiFetch('/health')
}

// ============ 文件上传（保持原有） ============

export async function uploadCover(file: File): Promise<{ url: string; name: string; size: string; storedName?: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch('/upload/cover', { method: 'POST', body: formData })
}

export async function uploadAttachment(file: File): Promise<{
  id: string
  url: string
  name: string
  size: string
  storedName: string
}> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch('/upload/attachment', { method: 'POST', body: formData })
}

export async function deleteAttachment(filename: string): Promise<void> {
  // 生产入口 Nginx 禁止 DELETE，使用语义等价的 POST 操作路由。
  await apiFetch(`/upload/attachment/${encodeURIComponent(filename)}/delete`, { method: 'POST' })
}

// 获取后端静态资源完整 URL
export function assetUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http')) {
    // 兼容历史上直接写入数据库的 COS 地址。统一改走同域封面代理，私有桶也能正常展示。
    try {
      const parsed = new URL(path)
      const matched = parsed.pathname.match(/\/covers\/([^/]+)$/)
      if (matched) return `${ASSET_BASE}/api/uploads/covers/${encodeURIComponent(decodeURIComponent(matched[1]))}`
    } catch {
      // 非法绝对地址继续交给浏览器处理，以便保留原始错误信息。
    }
    return path
  }
  // v2.0：兼容旧 /uploads/ 路径，统一走 /api 反向代理到后端
  if (path.startsWith('/uploads/')) {
    return `${ASSET_BASE}/api${path}`
  }
  return `${ASSET_BASE}${path}`
}

export async function downloadAttachmentFile(path: string, filename: string): Promise<void> {
  const url = path.startsWith('/api/')
    ? `${import.meta.env.DEV ? 'http://localhost:3001' : ''}${path}`
    : assetUrl(path)
  const res = await fetch(url, { headers: getAuthHeaders() })
  if (!res.ok) {
    if (res.status === 401) clearToken()
    throw new Error('附件下载失败或无访问权限')
  }
  const objectUrl = URL.createObjectURL(await res.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

// ============ v1.8：管理员作品管理 API ============
// 这些接口走 /api/admin/works/* 路径，需要审核管理员及以上权限
// 区别于 /api/works/* 的"仅自己"限制，管理员可管理平台任意作品

// 管理员下架作品
export async function adminOfflineWork(workId: string, reason: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/admin/works/${workId}/offline`, { method: 'POST', body: JSON.stringify({ reason }) })
}

// 管理员上架作品
export async function adminRepublishWork(workId: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/admin/works/${workId}/republish`, { method: 'POST' })
}

// 管理员软删除作品
export async function adminDeleteWork(workId: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/admin/works/${workId}`, { method: 'DELETE' })
}

// ============ v1.9：管理员用户管理 API ============

// 获取用户列表（带多角色信息）
export async function getAdminUsers(params?: { role?: string; q?: string }): Promise<{
  items: any[]
  stats: { total: number; byRole: Record<string, number> }
}> {
  const query = new URLSearchParams()
  if (params?.role && params.role !== 'all') query.set('role', params.role)
  if (params?.q) query.set('q', params.q)
  const qs = query.toString()
  return apiFetch(`/admin/users${qs ? `?${qs}` : ''}`)
}

// 分配用户角色（多角色）
export async function adminUpdateUserRoles(userId: string, roles: string[]): Promise<any> {
  return apiFetch(`/admin/users/${userId}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  })
}

// ============ 审核管理 API ============

export interface ReviewQueueItem {
  work: Work
  version: WorkVersion
  isFirstVersion: boolean
  onlineVersion?: string
}

const REVIEW_WORK_TYPES: Work['type'][] = ['skill', 'app', 'agent', 'prompt', 'workflow', 'case']

function normalizeReviewWorkType(value: unknown): Work['type'] {
  return REVIEW_WORK_TYPES.includes(value as Work['type']) ? value as Work['type'] : 'case'
}

// 兼容旧后端的扁平审核队列响应，避免前后端滚动发布期间因 item.work 缺失导致整页白屏。
function normalizeReviewQueueItem(raw: any): ReviewQueueItem | null {
  if (raw?.work?.id && raw?.version && typeof raw.version === 'object') {
    const submittedAt = raw.version.submittedAt ? String(raw.version.submittedAt) : ''
    return {
      work: {
        ...raw.work,
        type: normalizeReviewWorkType(raw.work.type),
        tags: Array.isArray(raw.work.tags) ? raw.work.tags : [],
        versions: Array.isArray(raw.work.versions) ? raw.work.versions : [],
        attachments: Array.isArray(raw.work.attachments) ? raw.work.attachments : [],
        comments: Array.isArray(raw.work.comments) ? raw.work.comments : [],
      },
      version: {
        ...raw.version,
        date: raw.version.date || submittedAt,
        status: raw.version.status || 'pending',
        submittedAt,
      },
      isFirstVersion: raw.isFirstVersion ?? !raw.onlineVersion,
      onlineVersion: raw.onlineVersion || undefined,
    }
  }

  if (!raw?.workId || !raw?.workTitle || typeof raw?.version !== 'string') {
    return null
  }

  const submittedAt = raw.submittedAt ? String(raw.submittedAt) : ''
  const version: WorkVersion = {
    version: raw.version,
    changelog: raw.changelog || '',
    date: submittedAt,
    status: 'pending',
    submittedAt,
    baseVersionId: raw.baseVersionId || undefined,
  }

  const work: Work = {
    id: raw.workId,
    title: raw.workTitle,
    type: normalizeReviewWorkType(raw.workType),
    category: '',
    tags: [],
    intro: '',
    authorId: '',
    authorName: raw.authorName || '',
    department: raw.department || '',
    status: raw.onlineVersion ? 'published' : 'unpublished',
    versions: [version],
    currentVersion: raw.onlineVersion || undefined,
    usage: '',
    attachments: [],
    comments: [],
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: submittedAt,
  }

  return {
    work,
    version,
    isFirstVersion: raw.isFirstVersion ?? !raw.onlineVersion,
    onlineVersion: raw.onlineVersion || undefined,
  }
}

// 获取审核队列
export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const data = await apiFetch<any[]>('/admin/review/queue')
  if (!Array.isArray(data)) return []
  return data
    .map(normalizeReviewQueueItem)
    .filter((item): item is ReviewQueueItem => item !== null)
}

// 获取审核事件日志
export async function getReviewEvents(limit: number = 20): Promise<any[]> {
  return apiFetch(`/admin/review/events?limit=${limit}`)
}

// 获取审核统计
export async function getReviewStats(): Promise<{
  pending: number
  approvedToday: number
  rejectedToday: number
  totalWorks: number
}> {
  return apiFetch('/admin/review/stats')
}

// ============ 作品 CRUD API ============

// 创建作品
export async function createWork(data: {
  title: string
  type: string
  category: string
  tags: string[]
  intro: string
  usage?: string
  businessValue?: string
  scene?: string
  coreAbilities?: string[]
  coverUrl?: string
  changelog?: string
  attachments?: Array<{ id?: string; name: string; size: string; url: string; storedName: string }>
}): Promise<any> {
  return apiFetch('/works', { method: 'POST', body: JSON.stringify(data) })
}

// 更新作品
export async function updateWorkApi(workId: string, data: Record<string, any>): Promise<any> {
  return apiFetch(`/works/${workId}`, { method: 'PUT', body: JSON.stringify(data) })
}

// 删除作品（软删除）
export async function deleteWorkApi(workId: string): Promise<{ success: boolean }> {
  return apiFetch(`/works/${workId}`, { method: 'DELETE' })
}

// 下架自己的作品
export async function offlineOwnWork(workId: string): Promise<{ success: boolean }> {
  return apiFetch(`/works/${workId}/offline`, { method: 'POST' })
}

// 重新上架自己的作品
export async function republishOwnWork(workId: string): Promise<{ success: boolean }> {
  return apiFetch(`/works/${workId}/republish`, { method: 'POST' })
}

// 点赞/取消点赞
export async function toggleLikeApi(workId: string): Promise<{ liked: boolean }> {
  return apiFetch(`/works/${workId}/like`, { method: 'POST' })
}

// 收藏/取消收藏
export async function toggleFavoriteApi(workId: string): Promise<{ favorited: boolean }> {
  return apiFetch(`/works/${workId}/favorite`, { method: 'POST' })
}

// 下载计数 +1
export async function incrementDownloadApi(workId: string): Promise<{ downloads: number }> {
  return apiFetch(`/works/${workId}/download`, { method: 'POST' })
}

// 发表评论
export async function addCommentApi(workId: string, content: string): Promise<any> {
  return apiFetch(`/works/${workId}/comments`, { method: 'POST', body: JSON.stringify({ content }) })
}

// 切换运营推荐
export async function toggleRecommendApi(workId: string): Promise<{ recommended: boolean }> {
  return apiFetch(`/admin/works/${workId}/recommend`, { method: 'POST' })
}

// ============ 版本管理 API ============

// 创建新版本
export async function createVersionApi(workId: string, changelog: string): Promise<any> {
  return apiFetch(`/works/${workId}/versions`, { method: 'POST', body: JSON.stringify({ changelog }) })
}

// 提交版本审核
export async function submitVersionApi(workId: string, version: string): Promise<any> {
  return apiFetch(`/works/${workId}/versions/${version}/submit`, { method: 'POST' })
}

// 撤回版本
export async function withdrawVersionApi(workId: string, version: string): Promise<any> {
  return apiFetch(`/works/${workId}/versions/${version}/withdraw`, { method: 'POST' })
}

// 审核通过
export async function approveVersionApi(workId: string, version: string): Promise<{
  success: boolean
  type: string
  version: string
  message: string
}> {
  return apiFetch(`/works/${workId}/versions/${version}/approve`, { method: 'POST' })
}

// 审核驳回
export async function rejectVersionApi(workId: string, version: string, reason: string): Promise<any> {
  return apiFetch(`/works/${workId}/versions/${version}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
}

// 修改已驳回版本（rejected → draft）
export async function modifyRejectedVersionApi(workId: string, version: string): Promise<any> {
  return apiFetch(`/works/${workId}/versions/${version}/modify`, { method: 'POST' })
}

// 上线候选版本
export async function publishCandidateVersionApi(workId: string, version: string): Promise<{ success: boolean }> {
  return apiFetch(`/works/${workId}/versions/${version}/publish-candidate`, { method: 'POST' })
}

// ============ 后台业务领域管理 API ============

export type PermissionMatrixResponse = Record<UserRole, Permission[]>

// 获取数据库中的角色权限矩阵（无自定义配置的角色由后端返回默认权限）
export async function getPermissionMatrix(): Promise<PermissionMatrixResponse> {
  return apiFetch('/admin/permission-matrix')
}

// 更新指定角色的真实权限配置
export async function updatePermissionMatrix(
  role: Exclude<UserRole, 'super_admin'>,
  permissions: Permission[]
): Promise<{ role: UserRole; permissions: Permission[] }> {
  return apiFetch(`/admin/permission-matrix/${role}`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })
}

// 获取业务领域列表（管理员，含 id）
export async function getAdminDomains(): Promise<any[]> {
  return apiFetch('/admin/domains')
}

// 创建业务领域
export async function createDomainApi(name: string): Promise<any> {
  return apiFetch('/admin/domains', { method: 'POST', body: JSON.stringify({ name }) })
}

// 更新业务领域
export async function updateDomainApi(id: string, name: string): Promise<any> {
  return apiFetch(`/admin/domains/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
}

// 删除业务领域
export async function deleteDomainApi(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/admin/domains/${id}`, { method: 'DELETE' })
}

// ============ 后台标签管理 API ============

// 获取标签列表（管理员，含 id）
export async function getAdminTags(): Promise<any[]> {
  return apiFetch('/admin/tags')
}

// 创建标签
export async function createTagApi(name: string): Promise<any> {
  return apiFetch('/admin/tags', { method: 'POST', body: JSON.stringify({ name }) })
}

// 删除标签
export async function deleteTagApi(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/admin/tags/${id}`, { method: 'DELETE' })
}

// ============ 用户管理 API ============

// 重置用户密码
export async function resetUserPasswordApi(userId: string): Promise<{ success: boolean; temporaryPassword: string }> {
  return apiFetch(`/admin/users/${userId}/reset-password`, { method: 'POST' })
}

export async function updateUserAccountApi(userId: string, data: {
  loginMethod?: 'wecom' | 'password' | 'both'
  loginAccount?: string
  password?: string
  accountStatus?: 'active' | 'disabled'
}): Promise<any> {
  return apiFetch(`/admin/users/${userId}/account`, { method: 'PUT', body: JSON.stringify(data) })
}

// 切换当前用户角色
export async function switchRoleApi(roles: string[]): Promise<any> {
  return apiFetch('/auth/switch-role', { method: 'POST', body: JSON.stringify({ roles }) })
}

// ============ v2.0：操作日志 API ============

// 操作日志查询结果
export interface OperationLogItem {
  id: string
  time: string
  operatorId: string
  operatorName: string
  department: string
  role: string
  module: string
  action: string
  content: string
  target: string
  ip: string
  result: 'success' | 'failed'
}

export interface OperationLogQueryResult {
  items: OperationLogItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 记录操作日志（系统自动调用，前端埋点 → 后端持久化）
export async function createOperationLog(data: {
  module: string
  action: string
  content: string
  target: string
  result?: 'success' | 'failed'
}): Promise<{ success: boolean; id: string }> {
  // 日志由服务端审计中间件根据真实请求自动生成；保留函数仅兼容现有调用点。
  void data
  return { success: true, id: 'server-generated' }
}

// 查询操作日志（分页 + 筛选）
export async function getOperationLogs(params: {
  page?: number
  pageSize?: number
  module?: string
  action?: string
  startDate?: string
  endDate?: string
  keyword?: string
  operatorId?: string
}): Promise<OperationLogQueryResult> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.module) query.set('module', params.module)
  if (params.action) query.set('action', params.action)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.keyword) query.set('keyword', params.keyword)
  if (params.operatorId) query.set('operatorId', params.operatorId)
  const qs = query.toString()
  return apiFetch(`/operation-logs${qs ? `?${qs}` : ''}`)
}

// 导出操作日志 CSV 下载链接（超管专用，浏览器直接下载）
export function getOperationLogExportUrl(params: {
  module?: string
  action?: string
  startDate?: string
  endDate?: string
  keyword?: string
}): string {
  const query = new URLSearchParams()
  if (params.module) query.set('module', params.module)
  if (params.action) query.set('action', params.action)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.keyword) query.set('keyword', params.keyword)
  const qs = query.toString()
  const base = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api'
  return `${base}/operation-logs/export${qs ? `?${qs}` : ''}`
}

// 导出操作日志 CSV（带 JWT 鉴权，返回 Blob 供前端触发下载）
export async function exportOperationLogs(params: {
  module?: string
  action?: string
  startDate?: string
  endDate?: string
  keyword?: string
}): Promise<Blob> {
  const url = getOperationLogExportUrl(params)
  const headers: Record<string, string> = { ...getAuthHeaders() }
  const res = await fetch(url, { headers })
  if (res.status === 401) {
    clearToken()
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '导出失败' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.blob()
}
