import type { WorkType, WorkStatus, VersionStatus } from '../types'
import { TYPE_CONFIG, WORK_STATUS_CONFIG, VERSION_STATUS_CONFIG } from '../types'

// 类型标签
export function TypeTag({ type, size = 'md' }: { type: WorkType; size?: 'sm' | 'md' }) {
  const cfg = TYPE_CONFIG[type]
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
  return (
    <span
      className={`inline-block rounded font-medium ${padding}`}
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// v1.1：作品状态徽章
export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  const cfg = WORK_STATUS_CONFIG[status]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  )
}

// v1.1：版本状态徽章（带版本号）
export function VersionStatusBadge({ status, version, onlineVersion }: { status: VersionStatus; version?: string; onlineVersion?: string }) {
  const cfg = VERSION_STATUS_CONFIG[status]
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium w-fit"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
        {cfg.label}{version && ` ${version}`}
      </span>
      {onlineVersion && (
        <span className="text-[10px] text-muted-foreground pl-2">线上 {onlineVersion} 继续可见</span>
      )}
    </span>
  )
}

// 业务标签
export function BizTag({
  children,
  active,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  variant?: 'default' | 'purple' | 'success' | 'warn' | 'danger'
}) {
  const variants = {
    default: { bg: 'var(--aic-primary-light)', color: 'var(--aic-primary)' },
    purple: { bg: 'var(--aic-violet-light)', color: 'var(--aic-gradient-violet)' },
    success: { bg: 'var(--state-success-bg)', color: 'var(--state-success)' },
    warn: { bg: 'var(--state-warning-bg)', color: 'var(--state-warning)' },
    danger: { bg: 'var(--state-danger-bg)', color: 'var(--state-danger)' },
  }
  const style = active
    ? { backgroundColor: 'var(--aic-gradient-violet)', color: '#fff' }
    : variants[variant]
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition ${
        onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
      }`}
      style={style}
    >
      {children}
    </button>
  )
}

// 头像
export function Avatar({
  name,
  color,
  size = 32,
}: {
  name: string
  color: string
  size?: number
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {name.charAt(0)}
    </div>
  )
}
