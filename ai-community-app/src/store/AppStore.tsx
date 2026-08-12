import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { Work, User, ReviewEvent, WorkStatus, VersionStatus, UserRole, Permission, WorkVersion } from '../types'
import { hasPermission as checkPermission } from '../types'
import { apiFetch, getToken, logoutApi, adminOfflineWork, adminRepublishWork, adminDeleteWork, getAdminUsers, adminUpdateUserRoles, getPublicDomains, getPublicTags, getReviewEvents, createWork, updateWorkApi, deleteWorkApi, toggleLikeApi, toggleFavoriteApi, incrementDownloadApi, addCommentApi, toggleRecommendApi, submitVersionApi, withdrawVersionApi, approveVersionApi, rejectVersionApi, modifyRejectedVersionApi, publishCandidateVersionApi, getAdminDomains, createDomainApi, updateDomainApi, deleteDomainApi, getAdminTags, createTagApi, deleteTagApi, resetUserPasswordApi, updateUserAccountApi, createOperationLog } from '../lib/api'
import type { LogModule, LogAction } from '../data/mockData'

// v1.9：升级所有缓存 key 版本号，使旧版 mock 数据缓存自动失效
const EVENTS_KEY = 'ai-community-events-v3'
const DOMAINS_KEY = 'ai-community-domains-v2'
const TAGS_KEY = 'ai-community-tags-v2'
const AUTH_KEY = 'ai-community-auth-v1'
const USERS_KEY = 'ai-community-users-v2'

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  works: Work[]
  events: ReviewEvent[]
  fetchEvents: () => Promise<void>
  currentUser: User
  toasts: Toast[]
  // v1.7：数据加载状态
  worksLoading: boolean
  worksError: string
  reloadWorks: () => void
  // v1.3：业务领域与标签可变状态
  domains: string[]
  fetchDomains: () => Promise<void>
  tags: string[]
  fetchTags: () => Promise<void>
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: number) => void
  // 作品操作（v1.9：全部改为 async 调用后端 API）
  addWork: (work: Partial<Work> & { title: string; type: string; category: string; intro: string; tags: string[] }) => Promise<Work | null>
  updateWork: (id: string, updates: Partial<Work>) => Promise<boolean>
  deleteWork: (id: string) => Promise<boolean>
  // v1.5：后台作品管理——上架/下架/批量操作
  offlineWork: (id: string) => Promise<boolean>
  onlineWork: (id: string) => Promise<boolean>
  batchOfflineWorks: (ids: string[]) => Promise<number>
  batchOnlineWorks: (ids: string[]) => Promise<number>
  batchDeleteWorks: (ids: string[]) => Promise<number>
  // v1.3：业务领域 CRUD（v1.9：改为 async 调用后端 API）
  addDomain: (name: string) => Promise<boolean>
  renameDomain: (oldName: string, newName: string) => Promise<void>
  deleteDomain: (name: string) => Promise<boolean>
  // v1.3：标签 CRUD（v1.9：改为 async 调用后端 API）
  addTag: (name: string) => Promise<boolean>
  deleteTag: (name: string) => Promise<void>
  // v1.1：版本级审核操作（v1.9：改为 async 调用后端 API）
  submitVersionForReview: (workId: string, version: string) => Promise<boolean>
  approveVersion: (workId: string, version: string) => Promise<boolean>
  rejectVersion: (workId: string, version: string, reason: string) => Promise<boolean>
  withdrawVersion: (workId: string, version: string) => Promise<boolean>
  startModifyRejected: (workId: string, version: string) => Promise<boolean>
  // 互动数据归属作品级（v1.9：改为 async 调用后端 API）
  toggleLike: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  incrementDownload: (id: string) => Promise<void>
  incrementView: (id: string) => void
  addComment: (id: string, content: string) => Promise<boolean>
  toggleRecommend: (id: string) => Promise<void>
  // v1.7：设置多角色（v1.9：改为 async 调用后端 API）
  setRoles: (roles: UserRole[]) => Promise<void>
  // v1.7：权限判断辅助
  hasPermission: (perm: import('../types').Permission) => boolean
  hasRole: (role: UserRole) => boolean
  // 辅助方法
  getLatestVersion: (work: Work) => Work['versions'][number] | undefined
  getPendingVersion: (work: Work) => Work['versions'][number] | undefined
  // v1.3：多版本并发控制
  hasActiveCandidate: (work: Work) => boolean
  canCreateNewVersion: (work: Work) => { allowed: boolean; reason?: string }
  publishCandidateVersion: (workId: string, version: string) => Promise<boolean>
  // v1.4：登录认证
  isAuthenticated: boolean
  login: (user: User, rememberMe: boolean) => void
  logout: () => void
  // v1.4：用户管理（后台配置账号密码、重置密码、启用/禁用）
  users: User[]
  usersLoading: boolean
  fetchUsers: () => Promise<void>
  updateUserAccount: (userId: string, updates: Partial<User>) => Promise<void>
  resetUserPassword: (userId: string) => Promise<string | null>
  // v2.0：操作日志改为后端持久化，前端仅负责埋点上报（fire-and-forget）
  // 日志查询/展示由 Admin.tsx 直接调用后端 API
  addOperationLog: (input: {
    module: LogModule
    action: LogAction
    content: string
    target: string
    result?: 'success' | 'failed'
  }) => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

// v1.9：清理旧版 mock 数据缓存（一次性执行，升级 key 版本号后旧缓存不再匹配）
// v2.0：操作日志改为后端持久化，清理 v2 本地缓存
function cleanLegacyCache() {
  const legacyKeys = [
    'ai-community-events-v2',     // 旧版审核事件缓存
    'ai-community-domains-v1',    // 旧版业务领域缓存（含 mock 初始值）
    'ai-community-tags-v1',       // 旧版标签缓存（含 mock 初始值）
    'ai-community-oplogs-v1',     // 旧版操作日志缓存（含 mock 初始值）
    'ai-community-oplogs-v2',     // v2.0 前端本地日志缓存（已迁移至后端）
    'ai-community-users-v1',      // 旧版用户列表缓存（含 mock 数据）
  ]
  legacyKeys.forEach((key) => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  })
}

// 模块加载时立即执行清理
cleanLegacyCache()

let toastId = 0

// v1.7：未登录时的空用户对象
const EMPTY_USER: User = {
  id: '',
  name: '',
  department: '',
  position: '',
  roles: ['user'],
  avatarColor: '',
  loginMethod: 'wecom',
  accountStatus: 'active',
}

// v1.7：后端 API 返回的作品数据 → 前端 Work 类型转换
// v2.0：导出供 Gallery.tsx 等页面复用，保证数据转换逻辑统一
export function transformWork(raw: any): Work {
  // coreAbilities 后端存为 JSON 字符串，需 parse
  let coreAbilities: string[] = []
  if (raw.coreAbilities) {
    try {
      coreAbilities = typeof raw.coreAbilities === 'string' ? JSON.parse(raw.coreAbilities) : raw.coreAbilities
    } catch {
      coreAbilities = []
    }
  }
  // versions 转换
  const versions: WorkVersion[] = (raw.versions || []).map((v: any) => ({
    version: v.version,
    status: v.status,
    submittedAt: v.submittedAt?.toISOString?.() || v.submittedAt || '',
    reviewedAt: v.reviewedAt?.toISOString?.() || v.reviewedAt,
    reviewer: v.reviewer,
    reviewNote: v.reviewNote,
    changelog: v.changelog || '',
    attachmentId: v.attachmentId,
    attachmentUrl: v.attachmentUrl,
    attachmentName: v.attachmentName,
    attachmentSize: v.attachmentSize,
    baseVersionId: v.baseVersionId,
    candidate: v.candidate,
    current: v.current,
  }))
  return {
    id: raw.id,
    title: raw.title,
    type: raw.type,
    category: raw.category || '',
    tags: raw.tags || [],
    intro: raw.intro || '',
    authorId: raw.authorId,
    authorName: raw.authorName,
    department: raw.department || '',
    status: raw.status,
    versions,
    currentVersion: raw.currentVersion || undefined,
    coverUrl: raw.coverUrl || undefined,
    usage: raw.usage || '',
    businessValue: raw.businessValue || undefined,
    scene: raw.scene || undefined,
    coreAbilities,
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map((attachment: any) => ({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      downloads: attachment.downloads || 0,
      url: attachment.url || undefined,
      storedName: attachment.storedName || undefined,
    })) : [],
    comments: [],
    likes: raw.likes || 0,
    favorites: raw.favorites || 0,
    downloads: raw.downloads || 0,
    views: raw.views || 0,
    likedByMe: !!raw.likedByMe,
    favoritedByMe: !!raw.favoritedByMe,
    createdAt: raw.createdAt?.toISOString?.() || raw.createdAt || '',
    publishedAt: raw.publishedAt?.toISOString?.() || raw.publishedAt || undefined,
    recommended: !!raw.recommended,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  // v1.7：作品列表初始为空，从后端 API 拉取
  const [works, setWorks] = useState<Work[]>([])
  const [worksLoading, setWorksLoading] = useState(true)
  const [worksError, setWorksError] = useState('')
  // v1.9：所有业务数据初始值为空，从后端 API 拉取，不再使用 mockData
  const [events, setEvents] = useState<ReviewEvent[]>(() => loadFromStorage(EVENTS_KEY, []))
  // v1.7：默认未登录，从 localStorage 恢复登录态
  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const stored = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.user && getToken()) return parsed.user as User
      }
    } catch {
      // ignore
    }
    return EMPTY_USER  // v1.7：默认未登录
  })
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return !!parsed?.authenticated && !!getToken()
      }
    } catch {
      // ignore
    }
    return false  // v1.7：默认未登录
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [users, setUsers] = useState<User[]>(() => loadFromStorage(USERS_KEY, []))
  const [usersLoading, setUsersLoading] = useState(false)
  // v1.9：业务领域和标签初始为空，从后端 API 拉取
  const [domains, setDomains] = useState<string[]>(() => loadFromStorage(DOMAINS_KEY, []))
  const [tags, setTags] = useState<string[]>(() => loadFromStorage(TAGS_KEY, []))

  // v1.8：使用 useRef 跟踪最新 works，避免在 useCallback 依赖中加入会变化的状态
  // 这样依赖 works 的回调函数可以稳定引用，不会因 works 更新而重新生成，避免无限渲染循环（React Error #185）
  const worksRef = useRef(works)
  useEffect(() => { worksRef.current = works }, [works])

  // v1.7：从后端 API 拉取作品列表
  const fetchWorks = useCallback(async () => {
    setWorksLoading(true)
    setWorksError('')
    try {
      if (!isAuthenticated || !currentUser.id) {
        setWorks([])
        return
      }
      if (currentUser.roles.some((role) => ['reviewer', 'operator', 'super_admin'].includes(role))) {
        const data = await apiFetch<{ items: any[]; total: number }>('/admin/works?pageSize=100')
        setWorks(data.items.map(transformWork))
      } else {
        const [published, own] = await Promise.all([
          apiFetch<{ items: any[]; total: number }>('/works?pageSize=50'),
          apiFetch<any[]>(`/users/${currentUser.id}/works`),
        ])
        const merged = new Map<string, any>()
        published.items.forEach((item) => merged.set(item.id, item))
        own.forEach((item) => merged.set(item.id, item))
        setWorks(Array.from(merged.values()).map(transformWork))
      }
    } catch (err: any) {
      setWorksError(err.message || '加载作品失败')
      setWorks([])
    } finally {
      setWorksLoading(false)
    }
  }, [currentUser.id, currentUser.roles, isAuthenticated])

  useEffect(() => { fetchWorks() }, [fetchWorks])

  // v1.9：从后端 API 拉取用户列表（含多角色信息），替代 localStorage 缓存
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const data = await getAdminUsers()
      const mapped: User[] = data.items.map((u: any) => ({
        id: u.id,
        name: u.name,
        department: u.department || '',
        position: u.position || '',
        roles: u.roles || [u.role] || ['user'],
        role: u.role,
        avatarColor: u.avatarColor || '',
        avatar: u.avatar,
        employeeId: u.employeeId,
        loginMethod: u.loginMethod || 'wecom',
        accountStatus: u.accountStatus || 'active',
        loginAccount: u.loginAccount,
        password: u.password,
        failedLoginCount: u.failedLoginCount,
        lockedUntil: u.lockedUntil?.toISOString?.() || u.lockedUntil,
        lastLoginAt: u.lastLoginAt?.toISOString?.() || u.lastLoginAt,
        worksCount: u._count?.worksAuthored ?? 0,
      }))
      setUsers(mapped)
    } catch {
      // 权限不足或网络错误时保持现有数据
    } finally {
      setUsersLoading(false)
    }
  }, [])

  // v1.9：从后端 API 拉取业务领域列表（公开接口，无需登录）
  const fetchDomains = useCallback(async () => {
    try {
      const data = await getPublicDomains()
      setDomains(data)
    } catch {
      // 网络错误时保持现有数据
    }
  }, [])

  // v1.9：从后端 API 拉取标签列表（公开接口，无需登录）
  const fetchTags = useCallback(async () => {
    try {
      const data = await getPublicTags()
      setTags(data)
    } catch {
      // 网络错误时保持现有数据
    }
  }, [])

  // v1.9：从后端 API 拉取审核事件（需审核权限）
  const fetchEvents = useCallback(async () => {
    try {
      const data = await getReviewEvents(50)
      const mapped: ReviewEvent[] = data.map((e: any) => ({
        id: e.id,
        workId: e.workId,
        workTitle: e.workTitle,
        version: e.version,
        status: e.status,
        date: e.createdAt,
        reviewer: e.reviewer?.name,
        reason: e.reason,
        isFirstVersion: e.isFirstVersion,
      }))
      setEvents(mapped)
    } catch {
      // 权限不足或网络错误时保持现有数据
    }
  }, [])

  // v1.9：应用启动时拉取业务领域和标签（公开数据）
  useEffect(() => { fetchDomains() }, [fetchDomains])
  useEffect(() => { fetchTags() }, [fetchTags])

  useEffect(() => { saveToStorage(EVENTS_KEY, events) }, [events])
  useEffect(() => { saveToStorage(DOMAINS_KEY, domains) }, [domains])
  useEffect(() => { saveToStorage(TAGS_KEY, tags) }, [tags])
  useEffect(() => { saveToStorage(USERS_KEY, users) }, [users])

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2800)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // v2.0：记录操作日志——调用后端 POST /api/operation-logs 持久化
  // fire-and-forget：不阻塞用户操作，失败仅打日志（不影响主流程）
  // 操作人信息（id/姓名/部门/角色/IP/时间）由后端从 JWT + 数据库自动获取，前端不可伪造
  const addOperationLog = useCallback(async (input: {
    module: LogModule
    action: LogAction
    content: string
    target: string
    result?: 'success' | 'failed'
  }) => {
    try {
      await createOperationLog({
        module: input.module,
        action: input.action,
        content: input.content,
        target: input.target,
        result: input.result,
      })
    } catch (err) {
      // 日志记录失败不应影响用户主流程，仅打控制台日志
      console.error('[addOperationLog] 后端记录失败:', err)
    }
  }, [])

  // v1.9：创建作品——调用后端 POST /api/works
  const addWork = useCallback(async (work: Partial<Work> & { title: string; type: string; category: string; intro: string; tags: string[] }): Promise<Work | null> => {
    try {
      const raw = await createWork({
        title: work.title,
        type: work.type,
        category: work.category,
        tags: work.tags || [],
        intro: work.intro,
        usage: work.usage || '',
        businessValue: work.businessValue,
        scene: work.scene,
        coreAbilities: work.coreAbilities,
        coverUrl: work.coverUrl,
        changelog: work.versions?.[0]?.changelog || '初始版本',
        attachments: (work.attachments || []).map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          url: attachment.url || '',
          storedName: attachment.storedName || '',
        })),
      })
      const transformed = transformWork(raw)
      setWorks((prev) => [transformed, ...prev])
      addOperationLog({ module: '作品发布', action: '创建', content: '新建作品', target: work.title || '未命名作品' })
      return transformed
    } catch (err: any) {
      addOperationLog({ module: '作品发布', action: '创建', content: '新建作品', target: work.title || '未命名作品', result: 'failed' })
      addToast('error', err instanceof Error ? err.message : '创建作品失败')
      return null
    }
  }, [addOperationLog, addToast])

  // v1.9：更新作品——调用后端 PUT /api/works/:id
  const updateWork = useCallback(async (id: string, updates: Partial<Work>): Promise<boolean> => {
    const w = worksRef.current.find((x) => x.id === id)
    try {
      await updateWorkApi(id, {
        ...(updates.title && { title: updates.title }),
        ...(updates.type && { type: updates.type }),
        ...(updates.intro && { intro: updates.intro }),
        ...(updates.usage !== undefined && { usage: updates.usage }),
        ...(updates.businessValue !== undefined && { businessValue: updates.businessValue }),
        ...(updates.scene !== undefined && { scene: updates.scene }),
        ...(updates.coverUrl !== undefined && { coverUrl: updates.coverUrl }),
        ...(updates.coreAbilities && { coreAbilities: updates.coreAbilities }),
        ...(updates.category && { category: updates.category }),
        ...(updates.tags && { tags: updates.tags }),
        ...(updates.attachments && { attachments: updates.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          url: attachment.url || '',
          storedName: attachment.storedName || '',
        })) }),
        ...(updates.versions?.[0]?.changelog && { changelog: updates.versions[0].changelog }),
      })
      setWorks((prev) => prev.map((wk) => (wk.id === id ? { ...wk, ...updates } : wk)))
      if (w) addOperationLog({ module: '作品发布', action: '更新', content: '编辑作品信息', target: w.title })
      return true
    } catch (err: any) {
      if (w) addOperationLog({ module: '作品发布', action: '更新', content: '编辑作品信息', target: w.title, result: 'failed' })
      return false
    }
  }, [addOperationLog])

  // v1.9：删除作品——调用后端 DELETE /api/works/:id
  const deleteWork = useCallback(async (id: string): Promise<boolean> => {
    const w = worksRef.current.find((x) => x.id === id)
    try {
      await deleteWorkApi(id)
      setWorks((prev) => prev.filter((work) => work.id !== id))
      if (w) addOperationLog({ module: '个人中心', action: '删除', content: '删除作品', target: w.title })
      return true
    } catch (err: any) {
      if (w) addOperationLog({ module: '个人中心', action: '删除', content: '删除作品', target: w.title, result: 'failed' })
      return false
    }
  }, [addOperationLog])

  // v1.5：后台作品管理——下架（已发布 → 已下架，数据保留）
  // v1.8：调用后端 /api/admin/works/:id/offline，成功后更新本地 state
  const offlineWork = useCallback(async (id: string): Promise<boolean> => {
    const w = worksRef.current.find((x) => x.id === id)
    if (!w) return false
    try {
      await adminOfflineWork(id)
      setWorks((prev) => prev.map((work) =>
        work.id === id && work.status === 'published' ? { ...work, status: 'offline' as WorkStatus } : work
      ))
      addOperationLog({ module: '后台管理', action: '上架/下架', content: '下架作品', target: w.title })
      return true
    } catch (err: any) {
      addOperationLog({ module: '后台管理', action: '上架/下架', content: '下架作品', target: w.title, result: 'failed' })
      return false
    }
  }, [addOperationLog])

  // v1.5：上架（已下架 → 已发布，重新在大厅展示）
  // v1.8：调用后端 /api/admin/works/:id/republish，成功后更新本地 state
  const onlineWork = useCallback(async (id: string): Promise<boolean> => {
    const w = worksRef.current.find((x) => x.id === id)
    if (!w) return false
    try {
      await adminRepublishWork(id)
      setWorks((prev) => prev.map((work) =>
        work.id === id && work.status === 'offline' ? { ...work, status: 'published' as WorkStatus } : work
      ))
      addOperationLog({ module: '后台管理', action: '上架/下架', content: '上架作品', target: w.title })
      return true
    } catch (err: any) {
      addOperationLog({ module: '后台管理', action: '上架/下架', content: '上架作品', target: w.title, result: 'failed' })
      return false
    }
  }, [addOperationLog])

  // v1.5：批量下架
  // v1.8：并发调用后端 API，返回实际成功数
  const batchOfflineWorks = useCallback(async (ids: string[]): Promise<number> => {
    const targets = worksRef.current.filter((w) => ids.includes(w.id) && w.status === 'published')
    if (targets.length === 0) return 0
    const results = await Promise.allSettled(targets.map((w) => adminOfflineWork(w.id)))
    const successIds: string[] = []
    const successTitles: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        successIds.push(targets[i].id)
        successTitles.push(targets[i].title)
      }
    })
    if (successIds.length > 0) {
      setWorks((prev) => prev.map((w) =>
        successIds.includes(w.id) ? { ...w, status: 'offline' as WorkStatus } : w
      ))
      addOperationLog({ module: '后台管理', action: '上架/下架', content: `批量下架作品（${successIds.length} 个）`, target: successTitles.slice(0, 3).join('、') + (successTitles.length > 3 ? ' 等' : '') })
    }
    return successIds.length
  }, [addOperationLog])

  // v1.5：批量上架
  // v1.8：并发调用后端 API，返回实际成功数
  const batchOnlineWorks = useCallback(async (ids: string[]): Promise<number> => {
    const targets = worksRef.current.filter((w) => ids.includes(w.id) && w.status === 'offline')
    if (targets.length === 0) return 0
    const results = await Promise.allSettled(targets.map((w) => adminRepublishWork(w.id)))
    const successIds: string[] = []
    const successTitles: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        successIds.push(targets[i].id)
        successTitles.push(targets[i].title)
      }
    })
    if (successIds.length > 0) {
      setWorks((prev) => prev.map((w) =>
        successIds.includes(w.id) ? { ...w, status: 'published' as WorkStatus } : w
      ))
      addOperationLog({ module: '后台管理', action: '上架/下架', content: `批量上架作品（${successIds.length} 个）`, target: successTitles.slice(0, 3).join('、') + (successTitles.length > 3 ? ' 等' : '') })
    }
    return successIds.length
  }, [addOperationLog])

  // v1.5：批量软删除（已删除作品不可再操作）
  // v1.8：并发调用后端 API，返回实际成功数
  const batchDeleteWorks = useCallback(async (ids: string[]): Promise<number> => {
    const targets = worksRef.current.filter((w) => ids.includes(w.id) && w.status !== 'deleted')
    if (targets.length === 0) return 0
    const results = await Promise.allSettled(targets.map((w) => adminDeleteWork(w.id)))
    const successIds: string[] = []
    const successTitles: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        successIds.push(targets[i].id)
        successTitles.push(targets[i].title)
      }
    })
    if (successIds.length > 0) {
      setWorks((prev) => prev.map((w) =>
        successIds.includes(w.id) ? { ...w, status: 'deleted' as WorkStatus } : w
      ))
      addOperationLog({ module: '后台管理', action: '删除', content: `批量删除作品（${successIds.length} 个，软删除）`, target: successTitles.slice(0, 3).join('、') + (successTitles.length > 3 ? ' 等' : '') })
    }
    return successIds.length
  }, [addOperationLog])

  // v1.1：获取最新版本（按日期/版本号排序的第一个）
  const getLatestVersion = useCallback((work: Work) => {
    if (!work.versions.length) return undefined
    // 找到非 passed 的最新版本，否则返回第一个
    const nonPassed = work.versions.find((v) => v.status !== 'passed')
    return nonPassed || work.versions[0]
  }, [])

  // v1.1：获取待审核版本
  const getPendingVersion = useCallback((work: Work) => {
    return work.versions.find((v) => v.status === 'pending')
  }, [])

  // v1.9：提交版本审核——调用后端 POST /api/works/:id/versions/:v/submit
  const submitVersionForReview = useCallback(async (workId: string, version: string): Promise<boolean> => {
    const work = worksRef.current.find((w) => w.id === workId)
    try {
      await submitVersionApi(workId, version)
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
      setWorks((prev) => prev.map((w) => {
        if (w.id !== workId) return w
        return {
          ...w,
          versions: w.versions.map((v) =>
            v.version === version ? { ...v, status: 'pending' as VersionStatus, submittedAt: now } : v
          ),
        }
      }))
      if (work) {
        fetchEvents()
        addOperationLog({ module: '作品发布', action: '创建', content: '提交版本审核', target: `${work.title} ${version}` })
      }
      return true
    } catch (err: any) {
      return false
    }
  }, [addOperationLog, fetchEvents])

  // v1.9：审核通过——调用后端 POST /api/works/:id/versions/:v/approve（三重校验由后端处理）
  const approveVersion = useCallback(async (workId: string, version: string): Promise<boolean> => {
    const work = worksRef.current.find((w) => w.id === workId)
    try {
      const result = await approveVersionApi(workId, version)
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
      // 根据后端返回的 type 更新本地 state
      setWorks((prev) => prev.map((w) => {
        if (w.id !== workId) return w
        if (result.type === 'published') {
          const wasUnpublished = w.status === 'unpublished'
          return {
            ...w,
            status: (wasUnpublished ? 'published' : w.status) as WorkStatus,
            publishedAt: wasUnpublished ? now.slice(0, 10) : w.publishedAt,
            currentVersion: version,
            versions: w.versions.map((v) => {
              if (v.version === version) return { ...v, status: 'passed' as VersionStatus, current: true, candidate: false, reviewedAt: now }
              if (v.current && v.version !== version) return { ...v, current: false }
              return v
            }),
          }
        }
        // candidate_base_outdated 或 candidate_work_offline：标记为候选版本
        return {
          ...w,
          versions: w.versions.map((v) =>
            v.version === version ? { ...v, status: 'passed' as VersionStatus, current: false, candidate: true, reviewedAt: now } : v
          ),
        }
      }))
      fetchEvents()
      if (work) addOperationLog({ module: '审核管理', action: '审核', content: `通过版本审核（${result.message}）`, target: `${work.title} ${version}` })
      return true
    } catch (err: any) {
      return false
    }
  }, [addOperationLog, fetchEvents])

  // v1.9：驳回版本——调用后端 POST /api/works/:id/versions/:v/reject
  const rejectVersion = useCallback(async (workId: string, version: string, reason: string): Promise<boolean> => {
    const work = worksRef.current.find((w) => w.id === workId)
    try {
      await rejectVersionApi(workId, version, reason)
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
      setWorks((prev) => prev.map((w) => {
        if (w.id !== workId) return w
        return {
          ...w,
          versions: w.versions.map((v) =>
            v.version === version ? { ...v, status: 'rejected' as VersionStatus, reviewedAt: now, rejectReason: reason } : v
          ),
        }
      }))
      fetchEvents()
      if (work) addOperationLog({ module: '审核管理', action: '审核', content: '驳回版本（附修改意见）', target: `${work.title} ${version}` })
      return true
    } catch (err: any) {
      return false
    }
  }, [addOperationLog, fetchEvents])

  // v1.9：撤回版本——调用后端 POST /api/works/:id/versions/:v/withdraw
  const withdrawVersion = useCallback(async (workId: string, version: string): Promise<boolean> => {
    try {
      await withdrawVersionApi(workId, version)
      setWorks((prev) => prev.map((w) => {
        if (w.id !== workId) return w
        return {
          ...w,
          versions: w.versions.map((v) =>
            v.version === version ? { ...v, status: 'draft' as VersionStatus, submittedAt: undefined } : v
          ),
        }
      }))
      return true
    } catch (err: any) {
      return false
    }
  }, [])

  // v1.9：修改已驳回版本——调用后端 POST /api/works/:id/versions/:v/modify
  const startModifyRejected = useCallback(async (workId: string, version: string): Promise<boolean> => {
    try {
      await modifyRejectedVersionApi(workId, version)
      setWorks((prev) => prev.map((w) => {
        if (w.id !== workId) return w
        return {
          ...w,
          versions: w.versions.map((v) =>
            v.version === version ? { ...v, status: 'draft' as VersionStatus, rejectReason: undefined } : v
          ),
        }
      }))
      return true
    } catch (err: any) {
      return false
    }
  }, [])

  // v1.9：互动数据——调用后端 API
  const toggleLike = useCallback(async (id: string): Promise<void> => {
    try {
      const { liked } = await toggleLikeApi(id)
      setWorks((prev) => prev.map((w) => w.id === id ? { ...w, likedByMe: liked, likes: w.likes + (liked ? 1 : -1) } : w))
    } catch { /* ignore */ }
  }, [])

  const toggleFavorite = useCallback(async (id: string): Promise<void> => {
    try {
      const { favorited } = await toggleFavoriteApi(id)
      setWorks((prev) => prev.map((w) => w.id === id ? { ...w, favoritedByMe: favorited, favorites: w.favorites + (favorited ? 1 : -1) } : w))
    } catch { /* ignore */ }
  }, [])

  const incrementDownload = useCallback(async (id: string): Promise<void> => {
    try {
      const { downloads } = await incrementDownloadApi(id)
      setWorks((prev) => prev.map((w) => w.id === id ? { ...w, downloads } : w))
    } catch { /* ignore */ }
  }, [])

  // 浏览量由后端 GET /api/works/:id 自动 +1，前端无需额外调用
  const incrementView = useCallback((_id: string) => { /* no-op: backend handles view count */ }, [])

  const addComment = useCallback(async (id: string, content: string): Promise<boolean> => {
    try {
      const comment = await addCommentApi(id, content)
      setWorks((prev) => prev.map((w) => {
        if (w.id !== id) return w
        return { ...w, comments: [{
          id: comment.id,
          userId: comment.userId,
          userName: comment.userName,
          department: comment.department || '',
          avatarColor: comment.avatarColor || '',
          content: comment.content,
          date: comment.createdAt?.toISOString?.() || comment.createdAt || new Date().toISOString().slice(0, 10),
        }, ...w.comments] }
      }))
      return true
    } catch (err: any) {
      return false
    }
  }, [])

  const toggleRecommend = useCallback(async (id: string): Promise<void> => {
    try {
      const { recommended } = await toggleRecommendApi(id)
      setWorks((prev) => prev.map((w) => w.id === id ? { ...w, recommended } : w))
    } catch { /* ignore */ }
  }, [])

  // v1.3：单候选版本限制——检查作品是否已有活动候选版本（草稿或待审核）
  const hasActiveCandidate = useCallback((work: Work) => {
    return work.versions.some((v) => v.status === 'draft' || v.status === 'pending')
  }, [])

  // v1.3：是否允许创建新版本（已有活动候选版本时禁止）
  const canCreateNewVersion = useCallback((work: Work) => {
    if (work.status === 'deleted') {
      return { allowed: false, reason: '作品已删除，无法创建新版本' }
    }
    if (hasActiveCandidate(work)) {
      const active = work.versions.find((v) => v.status === 'draft' || v.status === 'pending')
      const statusText = active?.status === 'pending' ? '待审核' : '草稿'
      return {
        allowed: false,
        reason: `该作品已有${statusText}版本 ${active?.version}，请先撤回、删除或等审核完成后才能创建新版本`,
      }
    }
    return { allowed: true }
  }, [hasActiveCandidate])

  // v1.3：手动发布候选版本（已下架作品恢复发布后，作者可在个人中心手动上线候选版本）
  // v1.9：上线候选版本——调用后端 POST /api/works/:id/versions/:v/publish-candidate
  const publishCandidateVersion = useCallback(async (workId: string, version: string): Promise<boolean> => {
    try {
      await publishCandidateVersionApi(workId, version)
      const today = new Date().toISOString().slice(0, 10)
      setWorks((prev) => prev.map((w) => {
        if (w.id !== workId) return w
        return {
          ...w,
          status: 'published' as WorkStatus,
          publishedAt: w.publishedAt || today,
          currentVersion: version,
          versions: w.versions.map((v) => {
            if (v.version === version) return { ...v, current: true, candidate: false }
            if (v.current && v.version !== version) return { ...v, current: false }
            return v
          }),
        }
      }))
      return true
    } catch (err: any) {
      return false
    }
  }, [])

  // 角色由超级管理员分配，当前用户不能自行切换。
  const setRoles = useCallback(async (roles: UserRole[]): Promise<void> => {
    void roles
    addToast('error', '系统角色只能由超级管理员分配')
  }, [addToast])

  // v1.7：权限判断辅助（基于当前用户多角色并集）
  const hasPermission = useCallback((perm: Permission) => {
    return checkPermission(currentUser.roles, perm)
  }, [currentUser.roles])

  const hasRole = useCallback((role: UserRole) => {
    return currentUser.roles.includes(role)
  }, [currentUser.roles])

  // v1.4：登录
  const login = useCallback((user: User, rememberMe: boolean) => {
    setCurrentUser(user)
    setIsAuthenticated(true)
    const authData = { authenticated: true, user, rememberMe, loginAt: Date.now() }
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
    localStorage.removeItem('aic_current_user')
    sessionStorage.removeItem('aic_current_user')
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem('aic_current_user', JSON.stringify(user))
    storage.setItem(AUTH_KEY, JSON.stringify(authData))
    // v2.0：记录登录日志——调用后端 API（此时 JWT Token 已由 loginWithPassword/setToken 写入 localStorage）
    // 操作人信息由后端从 JWT + 数据库获取，前端只需传 module/action/content/target
    createOperationLog({
      module: '登录认证',
      action: '登录/登出',
      content: user.loginMethod === 'password' ? '账号密码登录' : '企业微信扫码登录',
      target: user.employeeId || user.loginAccount || user.name,
    }).catch((err) => console.error('[login] 记录登录日志失败:', err))
  }, [])

  // v1.4：退出登录（清除本地状态 + 调用后端退出接口）
  const logout = useCallback(() => {
    // v1.5：记录登出日志（需在清除 currentUser 前记录）
    addOperationLog({ module: '个人中心', action: '登录/登出', content: '退出登录', target: currentUser.name })
    // 异步调用后端退出接口（不阻塞 UI）
    logoutApi().catch(() => {})
    setIsAuthenticated(false)
    setCurrentUser(EMPTY_USER)
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
    localStorage.removeItem('aic_current_user')
    sessionStorage.removeItem('aic_current_user')
    localStorage.removeItem('ai-community-token')
    sessionStorage.removeItem('ai-community-token')
  }, [addOperationLog, currentUser])

  // v1.4：更新用户账号配置（登录方式、账号、密码、角色、状态）
  // v1.7：支持多角色（updates.roles 数组）
  // v1.9：角色修改同步到后端 API，避免仅修改前端 state 导致刷新后数据还原
  const updateUserAccount = useCallback(async (userId: string, updates: Partial<User>) => {
    const target = users.find((u) => u.id === userId)

    // 角色与账号配置均由后端持久化
    if (updates.roles && target) {
      try {
        await adminUpdateUserRoles(userId, updates.roles)
      } catch {
        // 后端 API 调用失败时，不更新前端 state，保持数据一致
        throw new Error('角色分配失败，请检查权限')
      }
    }

    const accountChanges = {
      ...(updates.loginMethod ? { loginMethod: updates.loginMethod } : {}),
      ...(updates.loginAccount !== undefined ? { loginAccount: updates.loginAccount } : {}),
      ...(updates.password ? { password: updates.password } : {}),
      ...(updates.accountStatus && updates.accountStatus !== 'locked' ? { accountStatus: updates.accountStatus } : {}),
    }
    if (Object.keys(accountChanges).length > 0) {
      await updateUserAccountApi(userId, accountChanges)
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updates } : u)))
    if (target) {
      const changes: string[] = []
      const roleLabel: Record<UserRole, string> = {
        user: '普通用户', creator: '创作者', reviewer: '审核管理员', operator: '运营管理员', super_admin: '超级管理员',
      }
      if (updates.roles) {
        const oldStr = (target.roles || []).map((r) => roleLabel[r]).join('、')
        const newStr = updates.roles.map((r) => roleLabel[r]).join('、')
        if (newStr !== oldStr) changes.push(`角色→${newStr}`)
      }
      if (updates.loginMethod && updates.loginMethod !== target.loginMethod) changes.push(`登录方式→${updates.loginMethod}`)
      if (updates.accountStatus && updates.accountStatus !== target.accountStatus) changes.push(`状态→${updates.accountStatus}`)
      addOperationLog({
        module: '后台管理',
        action: updates.roles ? '角色分配' : '更新',
        content: changes.length ? `更新用户配置（${changes.join('、')}）` : '更新用户配置',
        target: `${target.name} (${target.employeeId || target.id})`,
      })
    }
  }, [addOperationLog, users])

  // v1.9：重置用户密码——调用后端 POST /api/admin/users/:id/reset-password
  const resetUserPassword = useCallback(async (userId: string): Promise<string | null> => {
    const target = users.find((u) => u.id === userId)
    try {
      const result = await resetUserPasswordApi(userId)
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, failedLoginCount: 0, lockedUntil: undefined } : u
      ))
      if (target) addOperationLog({ module: '后台管理', action: '更新', content: '重置用户密码为默认密码', target: `${target.name} (${target.employeeId || target.id})` })
      return result.temporaryPassword
    } catch (err: any) {
      return null
    }
  }, [addOperationLog, users])

  // v1.9：业务领域 CRUD——调用后端 API
  const addDomain = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = name.trim()
    if (!trimmed) return false
    try {
      await createDomainApi(trimmed)
      await fetchDomains()
      return true
    } catch (err: any) {
      return false
    }
  }, [fetchDomains])

  const renameDomain = useCallback(async (oldName: string, newName: string): Promise<void> => {
    const trimmed = newName.trim()
    if (!trimmed || oldName === trimmed) return
    try {
      // 查找业务领域的 id
      const adminDomains = await getAdminDomains()
      const domain = adminDomains.find((d: any) => d.name === oldName)
      if (!domain) return
      await updateDomainApi(domain.id, trimmed)
      await fetchDomains()
      // 同步更新作品中的 category 字段
      setWorks((prev) => prev.map((w) => (w.category === oldName ? { ...w, category: trimmed } : w)))
    } catch (err: any) {
      // 重命名失败
    }
  }, [fetchDomains])

  const deleteDomain = useCallback(async (name: string): Promise<boolean> => {
    // 有作品关联时禁止删除
    const hasWork = worksRef.current.some((w) => w.category === name && w.status !== 'deleted')
    if (hasWork) return false
    try {
      const adminDomains = await getAdminDomains()
      const domain = adminDomains.find((d: any) => d.name === name)
      if (!domain) return false
      await deleteDomainApi(domain.id)
      await fetchDomains()
      return true
    } catch (err: any) {
      return false
    }
  }, [fetchDomains])

  // v1.9：标签 CRUD——调用后端 API
  const addTag = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = name.trim()
    if (!trimmed) return false
    try {
      await createTagApi(trimmed)
      await fetchTags()
      return true
    } catch (err: any) {
      return false
    }
  }, [fetchTags])

  const deleteTag = useCallback(async (name: string): Promise<void> => {
    try {
      const adminTags = await getAdminTags()
      const tag = adminTags.find((t: any) => t.name === name)
      if (!tag) return
      await deleteTagApi(tag.id)
      await fetchTags()
      // 同步从作品的 tags 数组中移除
      setWorks((prev) => prev.map((w) => ({ ...w, tags: w.tags.filter((t) => t !== name) })))
    } catch (err: any) {
      // 删除失败
    }
  }, [fetchTags])

  return (
    <AppContext.Provider value={{
      works, events, fetchEvents, currentUser, toasts,
      worksLoading, worksError, reloadWorks: fetchWorks,
      domains, fetchDomains, tags, fetchTags,
      addToast, removeToast,
      addWork, updateWork, deleteWork,
      // v1.5：后台作品管理
      offlineWork, onlineWork, batchOfflineWorks, batchOnlineWorks, batchDeleteWorks,
      addDomain, renameDomain, deleteDomain,
      addTag, deleteTag,
      submitVersionForReview, approveVersion, rejectVersion, withdrawVersion, startModifyRejected,
      toggleLike, toggleFavorite, incrementDownload, incrementView, addComment, toggleRecommend,
      setRoles, hasPermission, hasRole,
      getLatestVersion, getPendingVersion,
      hasActiveCandidate, canCreateNewVersion, publishCandidateVersion,
      // v1.4：登录认证
      isAuthenticated, login, logout,
      users, usersLoading, fetchUsers, updateUserAccount, resetUserPassword,
      // v2.0：操作日志埋点（查询/展示由 Admin.tsx 直接调用后端 API）
      addOperationLog,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
