// 作品类型枚举
export type WorkType = 'skill' | 'app' | 'agent' | 'prompt' | 'workflow' | 'case'

// === v1.1 双层状态模型 ===
// 作品状态：决定作品是否在大厅对外可见
export type WorkStatus = 'unpublished' | 'published' | 'offline' | 'deleted'

// 版本状态：决定某个具体版本处于审核流程的哪个环节
export type VersionStatus = 'draft' | 'pending' | 'passed' | 'rejected'

// v1.2 用户角色（RBAC 5 个系统角色）
export type UserRole = 'user' | 'creator' | 'reviewer' | 'operator' | 'super_admin'

// v1.4 登录方式
export type LoginMethod = 'wecom' | 'password' | 'both'

// v1.4 账号状态
export type AccountStatus = 'active' | 'disabled' | 'locked'

// 用户
export interface User {
  id: string
  name: string
  department: string
  position: string
  // v1.7：多角色（数组，权限取并集）；保留 role 兼容字段（取 roles[0]）
  roles: UserRole[]
  role?: UserRole
  avatarColor: string
  // v1.4：登录认证相关字段
  employeeId?: string              // 工号
  loginMethod: LoginMethod         // 登录方式：企业微信/账号密码/两者
  accountStatus: AccountStatus     // 账号状态
  loginAccount?: string            // 登录账号（工号或邮箱）
  password?: string                // 密码（仅账号密码方式，演示用明文）
  failedLoginCount?: number        // 连续登录失败次数
  lockedUntil?: string             // 锁定截止时间
  lastLoginAt?: string             // 最后登录时间
  worksCount?: number              // 作品数量（从后端 _count 获取）
}

// 附件
export interface Attachment {
  id: string
  name: string
  size: string
  downloads: number
  url?: string // v1.3：真实文件上传后的访问地址
  storedName?: string
}

// 版本（v1.1：版本独立管理状态；v1.3：增加 baseVersionId 用于多版本并发控制）
export interface WorkVersion {
  version: string
  changelog: string
  date: string
  status: VersionStatus
  current?: boolean // 是否为当前线上版本
  changelogAuthor?: string
  submittedAt?: string
  reviewedAt?: string
  reviewer?: string
  rejectReason?: string
  // v1.3：创建该版本时记录的线上版本号，用于审核通过时校验是否发生并发替换
  baseVersionId?: string
  // v1.3：审核通过但因作品已下架或 base_version_id 过期未自动上线时标记为候选版本
  candidate?: boolean
  // 版本内容快照：编辑草稿时必须读取这里，不能回退到当前线上 Work 数据。
  title?: string
  type?: WorkType
  category?: string
  tags?: string[]
  intro?: string
  usage?: string
  businessValue?: string
  scene?: string
  coreAbilities?: string[]
  coverUrl?: string
  // v2.0：版本级附件列表（编辑草稿时加载此版本自己的附件）
  attachments?: Attachment[]
}

// 评论
export interface Comment {
  id: string
  userId: string
  userName: string
  department: string
  avatarColor: string
  content: string
  date: string
}

// 审核 timeline 事件
export interface ReviewEvent {
  id: string
  workId: string
  workTitle: string
  version: string
  status: 'submitted' | 'approved' | 'rejected'
  date: string
  reviewer?: string
  reason?: string
  isFirstVersion?: boolean
}

// 作品（v1.1：作品状态与版本状态分离）
export interface Work {
  id: string
  title: string
  type: WorkType
  category: string
  tags: string[]
  intro: string
  authorId: string
  authorName: string
  department: string
  // 作品状态
  status: WorkStatus
  // 版本列表（v1.1：支持多版本）
  versions: WorkVersion[]
  // 当前线上版本号
  currentVersion?: string
  coverUrl?: string
  usage: string
  businessValue?: string
  scene?: string
  coreAbilities?: string[]
  attachments: Attachment[]
  comments: Comment[]
  // 互动数据归属作品级（v1.1：版本替换时继承不清零）
  likes: number
  favorites: number
  downloads: number
  views: number
  likedByMe: boolean
  favoritedByMe: boolean
  createdAt: string
  publishedAt?: string
  recommended?: boolean
}

// 类型显示配置
export const TYPE_CONFIG: Record<WorkType, { label: string; icon: string; coverClass: string; color: string; bg: string }> = {
  skill: { label: 'Skill', icon: '🔧', coverClass: 'cover-skill', color: 'var(--aic-primary)', bg: 'var(--aic-primary-light)' },
  app: { label: '应用程序', icon: '📱', coverClass: 'cover-app', color: 'var(--state-info)', bg: 'var(--state-info-bg)' },
  agent: { label: '智能体', icon: '🤖', coverClass: 'cover-agent', color: '#dc2626', bg: '#fef2f2' },
  prompt: { label: '提示词', icon: '💬', coverClass: 'cover-prompt', color: 'var(--state-success)', bg: 'var(--state-success-bg)' },
  workflow: { label: '工作流', icon: '⚡', coverClass: 'cover-workflow', color: 'var(--aic-gradient-violet)', bg: 'var(--aic-violet-light)' },
  case: { label: '案例方案', icon: '📋', coverClass: 'cover-case', color: '#ea580c', bg: '#fff7ed' },
}

// v1.3 作品类型差异化矩阵：专属字段、主操作、附件要求
export interface TypeSpecConfig {
  fields: string[]      // 专属字段名列表
  primaryAction: { label: string; icon: string }  // 详情页主操作按钮
  attachmentRequired: 'required' | 'optional' | 'none'  // 附件要求
}

export const TYPE_SPEC_CONFIG: Record<WorkType, TypeSpecConfig> = {
  skill: {
    fields: ['运行环境', '依赖说明', 'Skill 文件'],
    primaryAction: { label: '安装 / 下载', icon: '⬇' },
    attachmentRequired: 'required',
  },
  app: {
    fields: ['访问地址', '登录方式', '负责人'],
    primaryAction: { label: '打开应用', icon: '↗' },
    attachmentRequired: 'optional',
  },
  agent: {
    fields: ['构建平台', '体验地址', '权限要求'],
    primaryAction: { label: '体验 / 克隆', icon: '🚀' },
    attachmentRequired: 'optional',
  },
  prompt: {
    fields: ['Prompt 正文', '变量定义', '使用示例'],
    primaryAction: { label: '复制', icon: '📋' },
    attachmentRequired: 'none',
  },
  workflow: {
    fields: ['构建平台', '依赖说明', '导入文件'],
    primaryAction: { label: '导入 / 克隆', icon: '📥' },
    attachmentRequired: 'required',
  },
  case: {
    fields: ['实施步骤', '效果数据', '模板附件'],
    primaryAction: { label: '阅读 / 下载模板', icon: '📖' },
    attachmentRequired: 'optional',
  },
}

// 作品状态显示配置（v1.1）
export const WORK_STATUS_CONFIG: Record<WorkStatus, { label: string; color: string; bg: string }> = {
  unpublished: { label: '未发布', color: '#6b7280', bg: '#f3f4f6' },
  published: { label: '已发布', color: '#065f46', bg: '#d1fae5' },
  offline: { label: '已下架', color: '#3730a3', bg: '#e0e7ff' },
  deleted: { label: '已删除', color: '#991b1b', bg: '#fee2e2' },
}

// 版本状态显示配置（v1.1）
export const VERSION_STATUS_CONFIG: Record<VersionStatus, { label: string; color: string; bg: string }> = {
  draft: { label: '草稿', color: '#6b7280', bg: '#f3f4f6' },
  pending: { label: '待审核', color: '#92400e', bg: '#fef3c7' },
  passed: { label: '已通过', color: '#065f46', bg: '#d1fae5' },
  rejected: { label: '已驳回', color: '#991b1b', bg: '#fee2e2' },
}

// v1.3 角色配置（平行可叠加模型，五角色彼此独立、互不继承）
export const ROLE_CONFIG: Record<UserRole, { label: string; badge: string; badgeBg: string; desc: string }> = {
  user: {
    label: '普通用户',
    badge: '基础角色',
    badgeBg: 'rgba(107,114,128,0.12)',
    desc: '所有登录员工默认拥有。可浏览已发布作品、搜索筛选、点赞收藏下载、发表评论。可创建作品（首次创建时自动获得创作者角色）。',
  },
  creator: {
    label: '创作者',
    badge: '管理角色',
    badgeBg: 'rgba(37,99,235,0.12)',
    desc: '管理自己的作品。可创建作品、管理版本、提交审核、编辑已发布作品、下架自己的作品、删除自己的作品。普通用户首次创建作品时自动获得此角色。',
  },
  reviewer: {
    label: '审核管理员',
    badge: '管理角色',
    badgeBg: 'rgba(245,158,11,0.12)',
    desc: '负责内容审核与内容治理。可查看审核队列、通过/驳回版本、查看审核相关数据统计。不自动拥有运营管理权限。',
  },
  operator: {
    label: '运营管理员',
    badge: '管理角色',
    badgeBg: 'rgba(124,58,237,0.12)',
    desc: '负责社区运营。可管理业务领域与标签、用户管理、运营推荐、数据统计。不自动拥有审核权限，需另行分配审核管理员角色方可审核。',
  },
  super_admin: {
    label: '超级管理员',
    badge: '系统角色',
    badgeBg: 'rgba(239,68,68,0.1)',
    desc: '拥有全部权限。另可配置角色权限矩阵、分配用户角色、系统初始化配置。仅限 IT 管理员担任。',
  },
}

// v1.2 权限矩阵单元格状态
export type PermCell = 'yes' | 'own' | 'no'

// 排序方式
export type SortBy = 'latest' | 'likes' | 'favorites' | 'downloads'

// v1.7：权限定义（与后端 permissions.ts 保持一致）
export type Permission =
  | 'work:read' // 浏览已发布作品
  | 'work:create' // 创建作品 / 保存草稿
  | 'work:submit' // 提交版本审核
  | 'work:editOwn' // 编辑自己的作品
  | 'work:deleteOwn' // 删除自己的作品
  | 'work:offlineOwn' // 下架自己的作品
  | 'review:view' // 查看审核队列
  | 'review:approve' // 审核通过版本
  | 'review:reject' // 驳回版本
  | 'admin:domain' // 业务领域管理
  | 'admin:tag' // 标签管理
  | 'admin:user' // 用户管理 / 角色查看
  | 'admin:recommend' // 运营推荐
  | 'admin:role' // 权限配置 / 角色分配
  | 'admin:stats' // 数据统计
  | 'admin:workRead' // 查看全部状态作品
  | 'admin:workManage' // 管理任意作品

// v1.7：单角色权限表（与后端 ROLE_PERMISSIONS 保持一致）
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: ['work:read', 'work:create'],
  creator: ['work:read', 'work:create', 'work:submit', 'work:editOwn', 'work:deleteOwn', 'work:offlineOwn'],
  reviewer: ['work:read', 'review:view', 'review:approve', 'review:reject', 'admin:stats', 'admin:workRead', 'admin:workManage'],
  operator: ['work:read', 'admin:domain', 'admin:tag', 'admin:user', 'admin:recommend', 'admin:stats', 'admin:workRead', 'admin:workManage'],
  super_admin: [
    'work:read', 'work:create', 'work:submit', 'work:editOwn', 'work:deleteOwn', 'work:offlineOwn',
    'review:view', 'review:approve', 'review:reject',
    'admin:domain', 'admin:tag', 'admin:user', 'admin:recommend', 'admin:stats', 'admin:role', 'admin:workRead', 'admin:workManage',
  ],
}

// v1.7：计算多角色权限并集
export function getPermissionsByRoles(roles: UserRole[]): Permission[] {
  const set = new Set<Permission>()
  for (const r of roles) {
    const perms = ROLE_PERMISSIONS[r]
    if (perms) perms.forEach((p) => set.add(p))
  }
  return Array.from(set)
}

// v1.7：判断用户（多角色并集）是否拥有指定权限（任一即可）
export function hasPermission(roles: UserRole[], ...required: Permission[]): boolean {
  const perms = getPermissionsByRoles(roles)
  return required.some((p) => perms.includes(p))
}

// v1.7：判断用户是否拥有任一指定角色
export function hasRole(userRoles: UserRole[], ...roles: UserRole[]): boolean {
  return roles.some((r) => userRoles.includes(r))
}

// v1.7：全部系统角色（固定顺序）
export const ALL_ROLES: UserRole[] = ['user', 'creator', 'reviewer', 'operator', 'super_admin']

// v1.7：作品类型列表（从 mockData 迁移，供 UI 渲染用）
export const WORK_TYPES: { type: WorkType; label: string; icon: string }[] = [
  { type: 'skill', label: 'Skill', icon: '🔧' },
  { type: 'app', label: '应用程序', icon: '📱' },
  { type: 'agent', label: '智能体', icon: '🤖' },
  { type: 'prompt', label: '提示词', icon: '💬' },
  { type: 'workflow', label: '工作流', icon: '⚡' },
  { type: 'case', label: '案例方案', icon: '📋' },
]
