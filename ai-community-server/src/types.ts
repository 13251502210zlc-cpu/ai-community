// 共享类型定义（与前端保持语义一致）
export type WorkType = 'skill' | 'app' | 'agent' | 'prompt' | 'workflow' | 'case'
export type WorkStatus = 'unpublished' | 'published' | 'offline' | 'deleted'
export type VersionStatus = 'draft' | 'pending' | 'passed' | 'rejected'
export type UserRole = 'user' | 'creator' | 'reviewer' | 'operator' | 'super_admin'
