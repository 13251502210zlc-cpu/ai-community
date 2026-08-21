// v1.3：权限矩阵（角色平行可叠加模型，五角色彼此独立、互不继承）
// 多角色权限取并集

export type UserRole = 'user' | 'creator' | 'reviewer' | 'operator' | 'super_admin'

export const ROLE_LABELS: Record<UserRole, string> = {
  user: '普通用户',
  creator: '创作者',
  reviewer: '审核管理员',
  operator: '运营管理员',
  super_admin: '超级管理员',
}

// v1.3 权限定义
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
  | 'admin:userRole' // 用户角色分配
  | 'admin:recommend' // 运营推荐
  | 'admin:role' // 权限配置（仅超级管理员）
  | 'admin:stats' // 数据统计
  | 'admin:workRead' // 查看全部状态作品
  | 'admin:workManage' // 上架、下架、删除任意作品

// v1.3：单角色权限表（平行模型，不继承）
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: ['work:read', 'work:create'],
  creator: ['work:read', 'work:create', 'work:submit', 'work:editOwn', 'work:deleteOwn', 'work:offlineOwn'],
  reviewer: ['work:read', 'review:view', 'review:approve', 'review:reject', 'admin:stats', 'admin:workRead', 'admin:workManage'],
  operator: ['work:read', 'admin:domain', 'admin:tag', 'admin:user', 'admin:recommend', 'admin:stats', 'admin:workRead', 'admin:workManage'],
  super_admin: [
    'work:read', 'work:create', 'work:submit', 'work:editOwn', 'work:deleteOwn', 'work:offlineOwn',
    'review:view', 'review:approve', 'review:reject',
    'admin:domain', 'admin:tag', 'admin:user', 'admin:userRole', 'admin:recommend', 'admin:stats', 'admin:role', 'admin:workRead', 'admin:workManage',
  ],
}

export const ALL_PERMISSIONS: Permission[] = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat()))

// v1.7：多角色权限取并集
// 计算多个角色的权限并集
export function getPermissionsByRoles(roles: UserRole[]): Permission[] {
  const set = new Set<Permission>()
  for (const r of roles) {
    const perms = ROLE_PERMISSIONS[r]
    if (perms) perms.forEach((p) => set.add(p))
  }
  return Array.from(set)
}

// 校验用户（可拥有多个角色）是否拥有指定权限（任一即可，权限为多角色并集）
export function hasPermission(roles: string | string[], ...required: Permission[]): boolean {
  const roleArr = Array.isArray(roles) ? roles : [roles]
  const perms = getPermissionsByRoles(roleArr as UserRole[])
  return required.some((p) => perms.includes(p))
}

// 兼容旧版：单角色校验（内部转为单元素数组）
export function hasPermissionByRole(role: string, ...required: Permission[]): boolean {
  return hasPermission([role], ...required)
}
