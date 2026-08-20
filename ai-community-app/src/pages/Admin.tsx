import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ClipboardList, FolderTree, Tag, Users, Package,
  Star, BarChart3, TrendingUp, Plus, Trash2, Pencil,
  ShieldCheck, KeyRound, Info, Check, X, FileText, AlertTriangle,
  Search, Filter, Save, RotateCcw, Lock, Key, Eye, EyeOff,
  ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle, Download,
} from 'lucide-react'
import { transformWork, useApp } from '../store/AppStore'
import { downloadAttachmentFile, getReviewQueue, getReviewStats, getAdminStats, getOperationLogs, exportOperationLogs, getPermissionMatrix, updatePermissionMatrix, getAdminRecommendedWorks, getAdminWorks } from '../lib/api'
import type { AdminStatsResult, OperationLogItem } from '../lib/api'
import { TYPE_CONFIG, ROLE_CONFIG, ROLE_PERMISSIONS, hasRole as checkRole, ALL_ROLES } from '../types'
import type { Permission, UserRole, Work, WorkVersion, User, LoginMethod, AccountStatus, WorkType, WorkStatus } from '../types'
import { TypeTag, VersionStatusBadge, Avatar, WorkStatusBadge } from '../components/Tags'
import { LOG_MODULES, LOG_ACTIONS } from '../data/mockData'
import { nowDate, nowDateTime, formatDateTime } from '../lib/datetime'

// v1.2：系统分组侧边栏（移除举报处理）
// v1.5：内容管理组新增"作品管理"入口，排在作品审核之前；系统组新增"操作日志"入口
const NAV_GROUPS = [
  {
    title: '内容管理',
    items: [
      { id: 'works', label: '作品管理', icon: Package },
      { id: 'review', label: '作品审核', icon: ClipboardList },
      { id: 'category', label: '业务领域管理', icon: FolderTree },
      { id: 'tag', label: '标签管理', icon: Tag },
    ],
  },
  {
    title: '用户与社区',
    items: [
      { id: 'user', label: '用户管理', icon: Users },
    ],
  },
  {
    title: '运营',
    items: [
      { id: 'recommend', label: '运营推荐', icon: Star },
      { id: 'stats', label: '数据统计', icon: BarChart3 },
    ],
  },
  {
    title: '系统',
    items: [
      { id: 'permission', label: '权限配置', icon: KeyRound },
      { id: 'role', label: '角色说明', icon: ShieldCheck },
      { id: 'log', label: '操作日志', icon: FileText },
    ],
  },
] as const

type NavId = (typeof NAV_GROUPS)[number]['items'][number]['id']

const ROLE_COLS: UserRole[] = ['user', 'creator', 'reviewer', 'operator', 'super_admin']

// 权限单元格渲染（v1.3：支持点击切换三态）
function PermCell({
  value,
  editable,
  onChange,
}: {
  value: 'yes' | 'own' | 'no'
  editable?: boolean
  onChange?: (next: 'yes' | 'own' | 'no') => void
}) {
  const cycle: Record<string, 'yes' | 'own' | 'no'> = { yes: 'own', own: 'no', no: 'yes' }
  const cfg = {
    yes: { label: '✓', bg: 'var(--state-success-bg)', color: 'var(--state-success)' },
    own: { label: '己', bg: 'var(--state-warning-bg)', color: 'var(--state-warning)' },
    no: { label: '—', bg: 'var(--aic-surface-elevated)', color: 'var(--aic-muted-foreground)' },
  }[value]

  if (!editable) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        {cfg.label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onChange?.(cycle[value])}
      title={`当前：${value === 'yes' ? '有权限' : value === 'own' ? '仅自己' : '无权限'}（点击切换）`}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition hover:scale-110 hover:shadow-md cursor-pointer"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </button>
  )
}

type PermValue = 'yes' | 'own' | 'no'

const PERMISSION_DEFINITIONS: Array<{
  permission: Permission
  group: string
  label: string
  own?: boolean
  desc: string
}> = [
  { permission: 'work:read', group: '作品大厅', label: '浏览已发布作品', desc: '查看作品大厅中的已发布内容' },
  { permission: 'work:create', group: '作品发布', label: '创建作品 / 保存草稿', desc: '创建作品并保存草稿版本' },
  { permission: 'work:submit', group: '作品发布', label: '提交版本审核', desc: '提交、撤回及修改自己的版本' },
  { permission: 'work:editOwn', group: '作品发布', label: '编辑自己的作品', own: true, desc: '仅限本人创建的作品' },
  { permission: 'work:deleteOwn', group: '作品发布', label: '删除自己的作品', own: true, desc: '仅限本人创建的作品' },
  { permission: 'work:offlineOwn', group: '作品发布', label: '下架自己的作品 / 确认候选版本', own: true, desc: '仅限本人创建的作品' },
  { permission: 'review:view', group: '审核管理', label: '查看审核队列', desc: '查看待审核版本及审核记录' },
  { permission: 'review:approve', group: '审核管理', label: '审核通过版本', desc: '批准待审核版本' },
  { permission: 'review:reject', group: '审核管理', label: '驳回版本', desc: '驳回待审核版本并填写原因' },
  { permission: 'admin:workRead', group: '后台管理', label: '查看全部状态作品', desc: '查看草稿、待审、已下架及已删除作品' },
  { permission: 'admin:workManage', group: '后台管理', label: '管理任意作品', desc: '上架、下架或删除任意作品；超级管理员可编辑任意作品' },
  { permission: 'admin:domain', group: '后台管理', label: '业务领域管理', desc: '新增、修改和删除业务领域' },
  { permission: 'admin:tag', group: '后台管理', label: '标签管理', desc: '新增和删除标签' },
  { permission: 'admin:user', group: '后台管理', label: '用户管理 / 角色查看', desc: '查看用户及配置账号' },
  { permission: 'admin:recommend', group: '后台管理', label: '运营推荐管理', desc: '设置和取消推荐作品' },
  { permission: 'admin:stats', group: '后台管理', label: '数据统计查看', desc: '查看平台统计数据' },
  { permission: 'admin:role', group: '后台管理', label: '权限配置 / 角色分配', desc: '配置角色权限及分配用户角色' },
]

function defaultPermissionMatrix(): Record<UserRole, Permission[]> {
  return Object.fromEntries(
    ROLE_COLS.map((role) => [role, [...ROLE_PERMISSIONS[role]]])
  ) as Record<UserRole, Permission[]>
}

function PermissionMatrix({
  canEdit,
  addToast,
  refreshPermissions,
}: {
  canEdit: boolean
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void
  refreshPermissions: () => Promise<void>
}) {
  const [matrix, setMatrix] = useState<Record<UserRole, Permission[]>>(defaultPermissionMatrix)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const permGroups = PERMISSION_DEFINITIONS.reduce<Record<string, typeof PERMISSION_DEFINITIONS>>((acc, row) => {
    if (!acc[row.group]) acc[row.group] = []
    acc[row.group].push(row)
    return acc
  }, {})

  useEffect(() => {
    if (!canEdit) return
    let active = true
    setLoading(true)
    getPermissionMatrix()
      .then((data) => {
        if (!active) return
        setMatrix({
          ...data,
          // 超级管理员为系统全权限角色，不受数据库配置影响。
          super_admin: [...ROLE_PERMISSIONS.super_admin],
        })
        setDirty(false)
      })
      .catch((err: Error) => {
        if (active) addToast('error', err.message || '权限配置加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [canEdit, addToast])

  const handleCellChange = (permission: Permission, role: UserRole, next: PermValue) => {
    if (role === 'super_admin') return
    setMatrix((prev) => ({
      ...prev,
      [role]: next === 'no'
        ? prev[role].filter((item) => item !== permission)
        : Array.from(new Set([...prev[role], permission])),
    }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all(
        ROLE_COLS
          .filter((role): role is Exclude<UserRole, 'super_admin'> => role !== 'super_admin')
          .map((role) => updatePermissionMatrix(role, matrix[role]))
      )
      await refreshPermissions()
      setDirty(false)
      addToast('success', '权限配置已保存并立即生效；其他用户切回页面或刷新后会同步操作入口')
    } catch (err: any) {
      addToast('error', err.message || '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setMatrix(defaultPermissionMatrix())
    setDirty(true)
    addToast('info', '已重置为默认权限矩阵，点击"保存修改"后生效')
  }

  const handleSetColumn = (role: UserRole, value: PermValue) => {
    if (role === 'super_admin') return
    setMatrix((prev) => ({
      ...prev,
      [role]: value === 'no' ? [] : PERMISSION_DEFINITIONS.map((row) => row.permission),
    }))
    setDirty(true)
  }

  if (!canEdit) {
    return (
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center animate-fade-in" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <KeyRound size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground mb-1">权限不足</p>
        <p className="text-xs text-muted-foreground">权限配置仅超级管理员可用，请切换角色体验</p>
      </div>
    )
  }

  if (loading) {
    return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">正在从服务端加载权限配置…</div>
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold mb-1">权限配置矩阵</h2>
          <p className="text-xs text-muted-foreground">
            点击单元格后需保存才会生效；“仅自己”由对应权限码的资源归属规则决定。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning)' }}>
              未保存
            </span>
          )}
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <RotateCcw size={13} /> 重置默认
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            <Save size={13} /> {saving ? '保存中…' : '保存修改'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5"><PermCell value="yes" /> <span className="text-muted-foreground">有权限</span></div>
        <div className="flex items-center gap-1.5"><PermCell value="own" /> <span className="text-muted-foreground">仅自己的资源</span></div>
        <div className="flex items-center gap-1.5"><PermCell value="no" /> <span className="text-muted-foreground">无权限</span></div>
        <span className="text-muted-foreground hidden sm:inline">·</span>
        <span className="text-muted-foreground hidden sm:inline">点击单元格可循环切换</span>
      </div>

      <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning)' }}>
        当前超级管理员账号始终拥有系统全部权限，不能用来验证普通角色的禁用效果。普通用户同时拥有“普通用户、创作者”等多个角色时权限取并集，需在其所有角色列中关闭同一权限后再用该用户验证。
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ROLE_COLS.map((r) => (
            <div key={r} className="rounded-lg p-2.5 text-center" style={{ backgroundColor: ROLE_CONFIG[r].badgeBg }}>
              <div className="text-sm font-bold">{ROLE_CONFIG[r].label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 mb-2">{ROLE_CONFIG[r].badge}</div>
              {r === 'super_admin' ? (
                <span
                  className="inline-flex text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}
                >系统全权限</span>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => handleSetColumn(r, 'yes')}
                    className="text-[10px] px-1.5 py-0.5 rounded transition hover:opacity-80"
                    style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}
                    title="整列设为有权限"
                  >全有</button>
                  <button
                    onClick={() => handleSetColumn(r, 'no')}
                    className="text-[10px] px-1.5 py-0.5 rounded transition hover:opacity-80"
                    style={{ backgroundColor: 'var(--aic-surface-elevated)', color: 'var(--aic-muted-foreground)' }}
                    title="整列清空（基础权限除外）"
                  >清空</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <th className="text-left p-3 font-semibold whitespace-nowrap">功能分组</th>
                <th className="text-left p-3 font-semibold min-w-[200px]">操作</th>
                {ROLE_COLS.map((r) => (
                  <th key={r} className="text-center p-3 font-semibold whitespace-nowrap">{ROLE_CONFIG[r].label}</th>
                ))}
                <th className="text-left p-3 font-semibold min-w-[180px]">说明</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(permGroups).map(([group, rows]) => (
                rows.map((row) => {
                  return (
                    <tr key={`${group}-${row.permission}`} className="border-b last:border-0" style={{ borderColor: 'var(--aic-border-solid)' }}>
                      {rows.indexOf(row) === 0 && (
                        <td className="p-3 align-top font-semibold text-xs whitespace-nowrap" rowSpan={rows.length} style={{ backgroundColor: 'var(--aic-surface-elevated)', color: 'var(--aic-primary)' }}>
                          {group}
                        </td>
                      )}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span>{row.label}</span>
                          <code className="text-[10px] text-muted-foreground">{row.permission}</code>
                        </div>
                      </td>
                      {ROLE_COLS.map((r) => (
                        <td key={r} className="p-3 text-center">
                          <div className="flex justify-center">
                            <PermCell
                              value={r === 'super_admin'
                                ? 'yes'
                                : matrix[r]?.includes(row.permission) ? (row.own ? 'own' : 'yes') : 'no'}
                              editable={r !== 'super_admin'}
                              onChange={(next) => handleCellChange(
                                row.permission,
                                r,
                                row.own ? (next === 'yes' ? 'own' : next) : (next === 'own' ? 'no' : next)
                              )}
                            />
                          </div>
                        </td>
                      ))}
                      <td className="p-3 text-xs text-muted-foreground">{row.desc}</td>
                    </tr>
                  )
                })
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info)' }}>
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          超级管理员可调整普通用户、创作者、审核管理员和运营管理员的权限；超级管理员权限为系统保护项，不允许修改。
          保存后配置将写入数据库，并由后端鉴权中间件立即读取执行。用户同时拥有多个角色时权限取并集；
          如需关闭某项权限，必须在该用户拥有的所有角色中都关闭该权限。
        </span>
      </div>

      {dirty && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xl">
          <span className="text-sm font-medium" style={{ color: 'var(--state-warning)' }}>权限修改尚未生效</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            <Save size={13} /> {saving ? '保存中…' : '保存并立即生效'}
          </button>
        </div>
      )}
    </div>
  )
}

// 审核队列项
interface ReviewItem {
  work: Work
  version: WorkVersion
  isFirstVersion: boolean
  onlineVersion?: string
}

// v1.3：业务领域管理组件（真实增删改）
function DomainManagement({
  domains,
  works,
  addDomain,
  renameDomain,
  deleteDomain,
  addToast,
}: {
  domains: string[]
  works: Work[]
  addDomain: (name: string) => Promise<boolean>
  renameDomain: (oldName: string, newName: string) => Promise<void>
  deleteDomain: (name: string) => Promise<boolean>
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleAdd = async () => {
    if (!newName.trim()) {
      addToast('error', '业务领域名称不能为空')
      return
    }
    if (newName.trim().length > 20) {
      addToast('error', '业务领域名称不能超过 20 个字符')
      return
    }
    const ok = await addDomain(newName)
    if (ok) {
      addToast('success', `业务领域「${newName.trim()}」已添加`)
      setNewName('')
    } else {
      return
    }
  }

  const handleStartEdit = (name: string) => {
    setEditing(name)
    setEditName(name)
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    if (!editName.trim()) {
      addToast('error', '业务领域名称不能为空')
      return
    }
    if (editName.trim().length > 20) {
      addToast('error', '业务领域名称不能超过 20 个字符')
      return
    }
    if (editName.trim() !== editing && domains.includes(editName.trim())) {
      addToast('error', '该业务领域已存在')
      return
    }
    try {
      await renameDomain(editing, editName.trim())
      addToast('success', '业务领域已重命名')
      setEditing(null)
    } catch {
      // 具体原因由状态层展示，保留编辑状态方便用户修正。
    }
  }

  const handleDelete = async (name: string) => {
    const count = works.filter((w) => w.category === name && w.status !== 'deleted').length
    if (count > 0) {
      addToast('error', `该业务领域下有 ${count} 个作品，请先迁移后再删除`)
      return
    }
    const ok = await deleteDomain(name)
    if (ok) {
      addToast('success', `业务领域「${name}」已删除`)
    } else {
      return
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-base font-bold mb-1">业务领域管理</h2>
        <p className="text-xs text-muted-foreground">管理作品大厅的业务领域筛选项，名称不超过 20 个字符。删除前需确保该领域下无作品。</p>
      </div>
      <div className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        {/* 新增 */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 20))}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="输入新业务领域名称（不超过20字）..."
            maxLength={20}
            className="h-9 flex-1 max-w-xs rounded-md border px-3 text-sm outline-none focus:ring-2"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          />
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: 'var(--aic-primary)' }}
          >
            <Plus size={14} /> 添加
          </button>
        </div>

        {/* 列表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <th className="text-left p-2.5 font-semibold">业务领域名称</th>
                <th className="text-left p-2.5 font-semibold">关联作品数</th>
                <th className="text-left p-2.5 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => {
                const count = works.filter((w) => w.category === domain && w.status !== 'deleted').length
                const isEditing = editing === domain
                return (
                  <tr key={domain} className="border-b last:border-0" style={{ borderColor: 'var(--aic-border-solid)' }}>
                    <td className="p-2.5 font-medium">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value.slice(0, 20))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          autoFocus
                          maxLength={20}
                          className="h-8 rounded border px-2 text-sm outline-none focus:ring-2"
                          style={{ borderColor: 'var(--aic-primary)' }}
                        />
                      ) : (
                        <span className="block min-w-0 max-w-full break-words [overflow-wrap:anywhere]">{domain}</span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <span
                        className="inline-block rounded px-1.5 py-0.5 text-xs"
                        style={{
                          backgroundColor: count > 0 ? 'var(--aic-primary-light)' : 'var(--aic-surface-elevated)',
                          color: count > 0 ? 'var(--aic-primary)' : 'var(--aic-muted-foreground)',
                        }}
                      >
                        {count}
                      </span>
                    </td>
                    <td className="p-2.5">
                      {isEditing ? (
                        <>
                          <button
                            onClick={handleSaveEdit}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition mr-1"
                            style={{ borderColor: 'var(--state-success)', color: 'var(--state-success)' }}
                          >
                            <Check size={11} /> 保存
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition hover:bg-muted"
                            style={{ borderColor: 'var(--aic-border-solid)' }}
                          >
                            <X size={11} /> 取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(domain)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition hover:border-primary hover:text-primary mr-1"
                            style={{ borderColor: 'var(--aic-border-solid)' }}
                          >
                            <Pencil size={11} /> 重命名
                          </button>
                          <button
                            onClick={() => handleDelete(domain)}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition hover:opacity-80"
                            style={{ borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
                          >
                            <Trash2 size={11} /> 删除
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {domains.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">
                    暂无业务领域，请添加
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// v1.3：标签管理组件（真实增删）
function TagManagement({
  tags,
  works,
  addTag,
  deleteTag,
  addToast,
}: {
  tags: string[]
  works: Work[]
  addTag: (name: string) => Promise<boolean>
  deleteTag: (name: string) => Promise<void>
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newName.trim()) {
      addToast('error', '标签名称不能为空')
      return
    }
    if (newName.trim().length > 30) {
      addToast('error', '标签名称不能超过 30 个字符')
      return
    }
    const ok = await addTag(newName)
    if (ok) {
      addToast('success', `标签「${newName.trim()}」已添加`)
      setNewName('')
    } else {
      return
    }
  }

  const handleDelete = async (tag: string) => {
    const count = works.filter((w) => w.tags.includes(tag) && w.status !== 'deleted').length
    try {
      await deleteTag(tag)
      setConfirmDelete(null)
      addToast('success', `标签「${tag}」已删除${count > 0 ? `，已从 ${count} 个作品中移除` : ''}`)
    } catch {
      // 具体原因由状态层展示。
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-base font-bold mb-1">标签管理</h2>
        <p className="text-xs text-muted-foreground">管理作品标签。删除标签时会自动从所有作品中移除该标签。</p>
      </div>
      <div className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        {/* 新增 */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 30))}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="输入新标签名称..."
            maxLength={30}
            className="h-9 flex-1 max-w-xs rounded-md border px-3 text-sm outline-none focus:ring-2"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          />
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: 'var(--aic-primary)' }}
          >
            <Plus size={14} /> 添加
          </button>
        </div>

        {/* 统计 */}
        <div className="text-xs text-muted-foreground mb-3">
          共 {tags.length} 个标签
        </div>

        {/* 标签列表 */}
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const count = works.filter((w) => w.tags.includes(tag) && w.status !== 'deleted').length
            const isConfirming = confirmDelete === tag
            return (
              <div
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition"
                style={{
                  backgroundColor: isConfirming ? 'var(--state-danger-bg)' : 'var(--aic-primary-light)',
                  color: isConfirming ? 'var(--state-danger)' : 'var(--aic-primary)',
                }}
              >
                {tag} <span className="text-xs opacity-60">({count})</span>
                {isConfirming ? (
                  <>
                    <span className="text-xs">确认删除？</span>
                    <button
                      onClick={() => handleDelete(tag)}
                      className="opacity-80 hover:opacity-100 font-bold"
                      title="确认删除"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="opacity-80 hover:opacity-100"
                      title="取消"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(tag)}
                    className="opacity-60 hover:opacity-100"
                    title="删除标签"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center w-full">暂无标签，请添加</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Admin() {
  const { works, toggleRecommend, currentUser, addToast, approveVersion, rejectVersion, domains, tags, addDomain, renameDomain, deleteDomain, addTag, deleteTag, hasPermission, refreshPermissions } = useApp()
  const [activeNav, setActiveNav] = useState<NavId>('review')

  // v1.9：审核队列与统计从后端 API 拉取，替代直接从 works 过滤
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [reviewStats, setReviewStats] = useState<{ pending: number; approvedToday: number; rejectedToday: number; totalWorks: number } | null>(null)
  const [platformStats, setPlatformStats] = useState<AdminStatsResult | null>(null)
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([])
  const [recommendedLoading, setRecommendedLoading] = useState(false)

  const publishedWorks = works.filter((w) => w.status === 'published')
  const totalWorks = platformStats?.summary.totalWorks ?? 0
  const totalUsers = platformStats?.summary.totalUsers ?? 0
  const totalDownloads = platformStats?.summary.totalDownloads ?? 0
  // v1.3：已删除作品的待审核版本不计入待审核数量
  const pendingCount = works.reduce((sum, w) => w.status === 'deleted' ? sum : sum + w.versions.filter((v) => v.status === 'pending').length, 0)
  // 推荐位必须使用服务端的全量权威结果。后台作品列表仅加载最新 100 条，
  // 不能据此推算推荐数量，否则较旧的推荐作品会在页面上“消失”。
  const recommended = recommendedWorks

  // v1.7：基于多角色权限并集判断
  const userRoles = currentUser.roles || []
  const isSuperAdmin = userRoles.includes('super_admin')
  const canConfigPerm = hasPermission('admin:role')
  // v1.3：作品审核需要审核管理员或超级管理员（运营管理员不再有审核权限）
  const canReview = hasPermission('review:view')
  // v1.2：用户管理需要运营管理员及以上
  const canManageUser = hasPermission('admin:user')
  const canReadWorks = hasPermission('admin:workRead')
  const canManageWorks = hasPermission('admin:workManage')
  const canManageDomains = hasPermission('admin:domain')
  const canManageTags = hasPermission('admin:tag')
  const canRecommend = hasPermission('admin:recommend')
  const canViewStats = hasPermission('admin:stats')
  // v1.5：操作日志——查看自身记录（审核管理员及以上）；查看全部 + 导出（仅超级管理员）
  const canViewOpLog = checkRole(userRoles, 'reviewer', 'operator', 'super_admin')
  const canViewAllOpLog = checkRole(userRoles, 'super_admin')
  const canExportOpLog = checkRole(userRoles, 'super_admin')

  const typeStats = (Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]).map((type) => {
    const count = platformStats?.typeDistribution.find((item) => item.type === type)?.count ?? 0
    const publishedTotal = platformStats?.publishedWorks ?? 0
    return { type, count, percent: publishedTotal > 0 ? Math.round((count / publishedTotal) * 100) : 0 }
  })

  const topWorks = platformStats?.topWorks ?? []

  // 拉取审核队列与统计
  const refreshReview = useCallback(async () => {
    try {
      const [queue, stats] = await Promise.all([getReviewQueue(), getReviewStats()])
      setReviewQueue(queue as ReviewItem[])
      setReviewStats(stats)
    } catch {
      // 忽略，ReviewPanel 会以空列表兜底
    }
  }, [])

  // 组件挂载或切换到审核 tab 时拉取数据
  useEffect(() => {
    if (canReview && activeNav === 'review') {
      refreshReview()
    }
  }, [canReview, activeNav, refreshReview])

  useEffect(() => {
    if (canViewStats && activeNav === 'stats') {
      getAdminStats().then(setPlatformStats).catch((error) => {
        setPlatformStats(null)
        addToast('error', error instanceof Error ? error.message : '统计数据加载失败')
      })
    }
  }, [activeNav, addToast, canViewStats])

  const refreshRecommended = useCallback(async () => {
    setRecommendedLoading(true)
    try {
      const items = await getAdminRecommendedWorks()
      setRecommendedWorks(items.map(transformWork))
    } catch (error) {
      setRecommendedWorks([])
      addToast('error', error instanceof Error ? error.message : '推荐作品加载失败')
    } finally {
      setRecommendedLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    if (canRecommend && activeNav === 'recommend') {
      refreshRecommended()
    }
  }, [activeNav, canRecommend, refreshRecommended])

  const handleToggleRecommend = async (id: string, title: string) => {
    const wasRecommended = recommended.some((work) => work.id === id)
    if (!wasRecommended && recommended.length >= 5) {
      addToast('error', '推荐位最多 5 个，请先取消其他推荐')
      return
    }
    if (await toggleRecommend(id)) {
      await refreshRecommended()
      addToast('success', wasRecommended ? `已取消「${title}」推荐` : `已推荐「${title}」`)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold mb-1">后台管理</h1>
        <p className="text-sm text-muted-foreground">平台运营和管理的集中入口</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* 侧边栏 */}
        <aside className="lg:w-56 flex-shrink-0">
          <div className="rounded-xl border bg-card p-2 shadow-sm lg:sticky lg:top-20" style={{ borderColor: 'var(--aic-border-solid)' }}>
            <nav className="flex lg:flex-col gap-1 overflow-x-auto">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="lg:mb-2">
                  <div className="hidden lg:block text-xs font-bold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = activeNav === item.id
                    const locked = (item.id === 'permission' && !canConfigPerm)
                      || (item.id === 'review' && !canReview)
                      || (item.id === 'user' && !canManageUser)
                      || (item.id === 'works' && !canReadWorks)
                      || (item.id === 'category' && !canManageDomains)
                      || (item.id === 'tag' && !canManageTags)
                      || (item.id === 'recommend' && !canRecommend)
                      || (item.id === 'stats' && !canViewStats)
                      || (item.id === 'log' && !canViewOpLog)
                    return (
                      <button
                        key={item.id}
                        onClick={() => !locked && setActiveNav(item.id)}
                        disabled={locked}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition whitespace-nowrap w-full text-left ${
                          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        } ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={isActive ? { backgroundColor: 'var(--aic-primary-light)', color: 'var(--aic-primary)' } : {}}
                      >
                        <Icon size={16} /> {item.label}
                        {item.id === 'review' && pendingCount > 0 && !locked && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: 'var(--state-danger)' }}>{pendingCount}</span>
                        )}
                        {locked && <KeyRound size={11} className="ml-auto" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* 主内容区 */}
        <div className="flex-1 min-w-0">
          {/* v1.5：作品管理 - 统一的作品列表入口 */}
          {activeNav === 'works' && (
            <WorkManagement
              canReadWorks={canReadWorks}
              canManageWorks={canManageWorks}
              canEditAnyWork={isSuperAdmin}
            />
          )}

          {/* 作品审核 - 内嵌审核管理 */}
          {activeNav === 'review' && (
            <ReviewPanel
              reviewQueue={reviewQueue}
              reviewStats={reviewStats}
              canReview={canReview}
              approveVersion={approveVersion}
              rejectVersion={rejectVersion}
              refreshReview={refreshReview}
              addToast={addToast}
            />
          )}

          {/* 权限配置 */}
          {activeNav === 'permission' && (
            <PermissionMatrix
              canEdit={canConfigPerm}
              addToast={addToast}
              refreshPermissions={refreshPermissions}
            />
          )}

          {/* 角色说明 */}
          {activeNav === 'role' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-base font-bold mb-1">角色说明</h2>
                <p className="text-xs text-muted-foreground">系统内置 5 个角色，权限按基础角色 → 管理角色 → 系统角色逐级递增</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLE_COLS.map((r) => {
                  const cfg = ROLE_CONFIG[r]
                  return (
                    <div key={r} className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base font-bold">{cfg.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: cfg.badgeBg, color: 'var(--aic-foreground)' }}>
                          {cfg.badge}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{cfg.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 运营推荐 */}
          {activeNav === 'recommend' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-base font-bold mb-1">运营推荐管理</h2>
                <p className="text-xs text-muted-foreground">推荐作品将展示在作品大厅顶部推荐位，最多 5 个（当前 {recommended.length}/5）</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2" style={{ borderColor: 'var(--aic-border-solid)' }}>
                {recommended.map((w, i) => (
                  <div key={w.id} className="flex items-center justify-between border-b last:border-0 py-3" style={{ borderColor: 'var(--aic-border-solid)' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-bold flex-shrink-0" style={{ color: 'var(--aic-primary)' }}>{i + 1}</span>
                      <div className="min-w-0">
                        <Link to={`/works/${w.id}`} className="text-sm font-semibold hover:text-primary transition">{w.title}</Link>
                        <span className="ml-2"><TypeTag type={w.type} size="sm" /></span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleRecommend(w.id, w.title)}
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition"
                      style={{ borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
                    >
                      <Trash2 size={12} /> 取消推荐
                    </button>
                  </div>
                ))}
                {recommendedLoading && (
                  <p className="text-sm text-muted-foreground text-center py-6">推荐作品加载中...</p>
                )}
                {!recommendedLoading && recommended.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">暂无推荐作品</p>
                )}
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
                <h3 className="text-sm font-bold mb-3">添加推荐作品</h3>
                <div className="space-y-2">
                  {publishedWorks.filter((w) => !recommended.some((item) => item.id === w.id)).slice(0, 8).map((w) => (
                    <div key={w.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <TypeTag type={w.type} size="sm" />
                        <span className="text-sm truncate">{w.title}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{w.authorName}</span>
                      </div>
                      <button
                        onClick={() => handleToggleRecommend(w.id, w.title)}
                        disabled={recommended.length >= 5}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ borderColor: 'var(--aic-border-solid)' }}
                      >
                        <Plus size={12} /> 推荐
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 业务领域管理 */}
          {activeNav === 'category' && (
            <DomainManagement
              domains={domains}
              works={works}
              addDomain={addDomain}
              renameDomain={renameDomain}
              deleteDomain={deleteDomain}
              addToast={addToast}
            />
          )}

          {/* 标签管理 */}
          {activeNav === 'tag' && (
            <TagManagement
              tags={tags}
              works={works}
              addTag={addTag}
              deleteTag={deleteTag}
              addToast={addToast}
            />
          )}

          {/* 数据统计 */}
          {activeNav === 'stats' && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">数据统计概览</h2>
                <span className="text-xs text-muted-foreground">数据更新时间：{nowDateTime()}</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="累计作品" value={totalWorks} change="不含已删除作品" color="var(--aic-primary)" />
                <StatCard label="注册用户" value={totalUsers} change="全部注册账号" color="var(--aic-gradient-violet)" />
                <StatCard label="总下载量" value={totalDownloads} change="已发布作品累计" color="var(--state-success)" />
                <StatCard label="待审核版本" value={platformStats?.summary.pendingVersions ?? 0} change={(platformStats?.summary.pendingVersions ?? 0) > 0 ? '需及时处理' : '已清空'} color="var(--state-warning)" danger={(platformStats?.summary.pendingVersions ?? 0) > 0} />
              </div>

              <div className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
                <h3 className="text-sm font-bold mb-1">作品类型分布</h3>
                <p className="text-xs text-muted-foreground mb-4">统计范围：已发布作品，共 {platformStats?.publishedWorks ?? 0} 个</p>
                <div className="space-y-3">
                  {typeStats.map((s) => (
                    <div key={s.type}>
                      <div className="flex items-center justify-between mb-1 text-sm">
                        <span>{TYPE_CONFIG[s.type].label}</span>
                        <span className="font-medium">{s.count} ({s.percent}%)</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                        <div
                          className={`h-full rounded-full ${TYPE_CONFIG[s.type].coverClass}`}
                          style={{ width: `${Math.max(s.percent, 2)}%`, transition: 'width 0.4s' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
                <h3 className="text-sm font-bold mb-3">热门作品 TOP 5（按下载量）</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                        <th className="text-left p-2.5 font-semibold">#</th>
                        <th className="text-left p-2.5 font-semibold">作品名称</th>
                        <th className="text-left p-2.5 font-semibold">类型</th>
                        <th className="text-left p-2.5 font-semibold">作者</th>
                        <th className="text-left p-2.5 font-semibold">下载</th>
                        <th className="text-left p-2.5 font-semibold">点赞</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topWorks.map((w, i) => (
                        <tr key={w.id} className="border-b last:border-0" style={{ borderColor: 'var(--aic-border-solid)' }}>
                          <td className="p-2.5 font-bold" style={{ color: 'var(--aic-primary)' }}>{i + 1}</td>
                          <td className="p-2.5">
                            <Link to={`/works/${w.id}`} className="font-medium hover:text-primary transition">{w.title}</Link>
                          </td>
                          <td className="p-2.5"><TypeTag type={w.type} size="sm" /></td>
                          <td className="p-2.5 text-muted-foreground whitespace-nowrap text-xs">{w.authorName} · {w.department}</td>
                          <td className="p-2.5 font-medium">{w.downloads}</td>
                          <td className="p-2.5 text-muted-foreground">{w.likes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 用户管理 */}
          {activeNav === 'user' && (
            <UserManagement canManageUser={canManageUser} />
          )}

          {/* v2.0：操作日志 - 从后端 API 拉取，支持筛选/搜索/导出 */}
          {activeNav === 'log' && (
            <OperationLogPanel
              canViewAll={canViewAllOpLog}
              canExport={canExportOpLog}
              addToast={addToast}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============ 审核管理面板（内嵌组件） ============
function ReviewPanel({
  reviewQueue,
  reviewStats,
  canReview,
  approveVersion,
  rejectVersion,
  refreshReview,
  addToast,
}: {
  reviewQueue: ReviewItem[]
  reviewStats: { pending: number; approvedToday: number; rejectedToday: number; totalWorks: number } | null
  canReview: boolean
  approveVersion: (workId: string, version: string) => Promise<boolean>
  rejectVersion: (workId: string, version: string, reason: string) => Promise<boolean>
  refreshReview: () => void
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void
}) {
  // v1.9：审核队列直接来自后端 API（Admin 组件通过 getReviewQueue 拉取）
  const reviewItems = reviewQueue

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null)

  const selected = reviewItems.find((item) => `${item.work.id}-${item.version.version}` === selectedKey)
    || reviewItems[0]

  const todayReviewed = (reviewStats?.approvedToday ?? 0) + (reviewStats?.rejectedToday ?? 0)

  const handleApprove = async () => {
    if (!selected) return
    const { work, version, isFirstVersion } = selected
    const ok = await approveVersion(work.id, version.version)
    if (!ok) return
    const msg = isFirstVersion
      ? `「${work.title}」${version.version} 已审核通过，作品从未发布变为已发布`
      : `「${work.title}」${version.version} 已审核通过，已替换为线上版本`
    addToast('success', msg)
    const remaining = reviewItems.filter((item) => !(item.work.id === work.id && item.version.version === version.version))
    setSelectedKey(remaining[0] ? `${remaining[0].work.id}-${remaining[0].version.version}` : null)
    setShowReject(false)
    setRejectReason('')
    refreshReview()
  }

  const handleReject = async () => {
    if (!selected) return
    if (rejectReason.trim().length < 20) {
      addToast('error', '驳回修改意见不少于 20 字')
      return
    }
    if (rejectReason.trim().length > 200) {
      addToast('error', '驳回修改意见不能超过 200 字')
      return
    }
    const { work, version } = selected
    const ok = await rejectVersion(work.id, version.version, rejectReason.trim())
    if (!ok) return
    addToast('success', `「${work.title}」${version.version} 已驳回，修改意见已发送给作者。作品线上版本不受影响`)
    const remaining = reviewItems.filter((item) => !(item.work.id === work.id && item.version.version === version.version))
    setSelectedKey(remaining[0] ? `${remaining[0].work.id}-${remaining[0].version.version}` : null)
    setShowReject(false)
    setRejectReason('')
    refreshReview()
  }

  const handleReviewAttachmentDownload = async (attachment: ReviewItem['work']['attachments'][number]) => {
    if (!attachment.url || downloadingAttachmentId) return
    setDownloadingAttachmentId(attachment.id)
    try {
      await downloadAttachmentFile(attachment.url, attachment.name)
      addToast('success', `正在下载：${attachment.name}`)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : '附件下载失败，请重试')
    } finally {
      setDownloadingAttachmentId(null)
    }
  }

  if (!canReview) {
    return (
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center animate-fade-in" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <ClipboardList size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground mb-1">权限不足</p>
        <p className="text-xs text-muted-foreground">作品审核需要审核管理员及以上角色，请切换角色体验</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold mb-1">作品审核</h2>
          <p className="text-sm text-muted-foreground">审核创作者提交的版本，保障社区内容质量（审核对象为版本而非作品）</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning)' }}
          >
            <AlertTriangle size={12} /> 待审核版本: {reviewItems.length}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: 'var(--aic-surface-elevated)', color: 'var(--aic-muted-foreground)' }}
          >
            今日已审: {todayReviewed}
          </span>
        </div>
      </div>

      {/* 审核队列 */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <th className="text-left p-3 font-semibold">作品名称</th>
                <th className="text-left p-3 font-semibold">作者</th>
                <th className="text-left p-3 font-semibold">类型</th>
                <th className="text-left p-3 font-semibold">提交时间</th>
                <th className="text-left p-3 font-semibold">版本状态</th>
                <th className="text-left p-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {reviewItems.map((item) => {
                const key = `${item.work.id}-${item.version.version}`
                const isSelected = selected ? `${selected.work.id}-${selected.version.version}` === key : false
                return (
                  <tr
                    key={key}
                    className="border-b cursor-pointer transition hover:bg-primary/5 last:border-0"
                    style={{
                      borderColor: 'var(--aic-border-solid)',
                      backgroundColor: isSelected ? 'var(--aic-primary-light)' : undefined,
                    }}
                    onClick={() => { setSelectedKey(key); setShowReject(false); setRejectReason('') }}
                  >
                    <td className="p-3">
                      <div className="font-medium">{item.work.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {item.isFirstVersion ? `首次发布 ${item.version.version}` : `新版本 ${item.version.version}（线上 ${item.onlineVersion}）`}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{item.work.authorName} · {item.work.department}</td>
                    <td className="p-3"><TypeTag type={item.work.type} size="sm" /></td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">{item.version.submittedAt}</td>
                    <td className="p-3">
                      <VersionStatusBadge status={item.version.status} version={item.version.version} />
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedKey(key); setShowReject(false); setRejectReason('') }}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
                        style={{ borderColor: 'var(--aic-border-solid)' }}
                      >
                        审核
                      </button>
                    </td>
                  </tr>
                )
              })}
              {reviewItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    暂无待审核版本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 审核详情面板 */}
      {selected ? (
        <div
          key={`${selected.work.id}-${selected.version.version}`}
          className="rounded-xl border p-5 sm:p-6 shadow-sm animate-fade-in"
          style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: '#fafafa' }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-lg text-xl font-bold text-white ${TYPE_CONFIG[selected.work.type].coverClass}`}
              >
                {TYPE_CONFIG[selected.work.type].label.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-base">
                  {selected.work.title} <span className="text-xs font-medium ml-1" style={{ color: 'var(--aic-primary)' }}>{selected.version.version}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selected.work.authorName} · {selected.work.department} · 提交于 {selected.version.submittedAt}
                  {selected.isFirstVersion
                    ? ' · 首次发布'
                    : ` · 新版本（线上 ${selected.onlineVersion}）`}
                </div>
              </div>
            </div>
            <TypeTag type={selected.work.type} />
          </div>

          <div className="mb-3">
            <div className="text-xs font-semibold mb-1">作品简介</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{selected.work.intro}</div>
          </div>

          <div className="mb-3">
            <div className="text-xs font-semibold mb-1">使用说明</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{selected.work.usage}</div>
          </div>

          {selected.work.businessValue && (
            <div className="mb-3">
              <div className="text-xs font-semibold mb-1">业务价值</div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{selected.work.businessValue}</div>
            </div>
          )}

          <div className="mb-4">
            <div className="text-xs font-semibold mb-1">版本更新内容</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{selected.version.changelog}</div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-semibold mb-1">附件</div>
            <div className="flex flex-wrap gap-2">
              {selected.work.attachments.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => handleReviewAttachmentDownload(a)}
                  disabled={!a.url || downloadingAttachmentId !== null}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                  style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}
                >
                  <Download size={12} /> {a.name} · {a.size}{downloadingAttachmentId === a.id ? '（下载中）' : ''}
                </button>
              ))}
              {selected.work.attachments.length === 0 && (
                <span className="text-xs text-muted-foreground">无附件</span>
              )}
            </div>
          </div>

          <div
            className="rounded-lg p-3 mb-4 border-l-4 text-xs"
            style={{ backgroundColor: 'var(--aic-primary-light)', borderColor: 'var(--aic-primary)', color: 'var(--aic-muted-foreground)' }}
          >
            <strong style={{ color: 'var(--aic-foreground)' }}>审核影响：</strong>
            {selected.isFirstVersion
              ? '此为首版本，通过后作品状态将从「未发布」变为「已发布」，立即出现在作品大厅。'
              : `此为新版本，通过后将替换线上版本 ${selected.onlineVersion}（旧版本归档为历史版本），作品状态保持「已发布」不变。`}
            驳回只影响此版本，{selected.isFirstVersion ? '作品仍不可见' : `线上版本 ${selected.onlineVersion} 继续服务`}。
          </div>

          <div className="h-px mb-4" style={{ background: 'var(--aic-border-solid)' }} />

          <div>
            <label className="block text-sm font-semibold mb-2">审核意见</label>
            {!showReject ? (
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  style={{ background: 'var(--state-success)' }}
                >
                  <Check size={16} /> 通过
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  style={{ background: 'var(--state-danger)' }}
                >
                  <X size={16} /> 驳回
                </button>
              </div>
            ) : (
              <div className="animate-fade-in">
                <label className="block text-xs font-semibold mb-1.5">
                  驳回修改意见 <span style={{ color: 'var(--state-danger)' }}>*</span>
                  <span className="font-normal text-muted-foreground">（20-200 字）</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value.slice(0, 200))}
                  placeholder="请详细说明需要修改的内容，帮助作者理解问题..."
                  maxLength={200}
                  rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y whitespace-pre-wrap break-all"
                  style={{ borderColor: 'var(--aic-border-solid)' }}
                />
                <div className="text-right text-xs text-muted-foreground mt-1">{rejectReason.length}/200 字</div>
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => { setShowReject(false); setRejectReason('') }}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                    style={{ borderColor: 'var(--aic-border-solid)' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleReject}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                    style={{ background: 'var(--state-danger)' }}
                  >
                    确认驳回
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border p-12 text-center text-muted-foreground" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <p className="text-sm">选择上方作品查看审核详情</p>
        </div>
      )}
    </div>
  )
}

// ============ 用户管理面板（v1.4：重构，支持登录方式配置） ============
function UserManagement({ canManageUser }: { canManageUser: boolean }) {
  const { addToast, users, fetchUsers, updateUserAccount, resetUserPassword } = useApp()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  // v1.4：编辑弹窗状态
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{
    roles: UserRole[]
    loginMethod: LoginMethod
    loginAccount: string
    password: string
    accountStatus: AccountStatus
  }>({ roles: ['user'], loginMethod: 'wecom', loginAccount: '', password: '', accountStatus: 'active' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetResult, setResetResult] = useState<{ userName: string; password: string } | null>(null)

  // v1.9：组件挂载时从后端拉取最新用户列表（含真实角色数据），替代 localStorage 缓存
  useEffect(() => {
    if (canManageUser) fetchUsers()
  }, [canManageUser, fetchUsers])

  // v1.7：统计每个角色的用户数（基于多角色，一个用户可计入多个角色）
  const roleStats = useMemo(() => {
    const stats: Record<string, number> = {}
    ROLE_COLS.forEach((r) => stats[r] = 0)
    users.forEach((u) => {
      (u.roles || []).forEach((r) => { stats[r] = (stats[r] || 0) + 1 })
    })
    return stats
  }, [users])

  // 部门列表
  const departments = useMemo(() => {
    const set = new Set<string>()
    users.forEach((u) => set.add(u.department))
    return ['all', ...Array.from(set)]
  }, [users])

  // v1.7：筛选后的用户（角色筛选匹配多角色任一）
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && !(u.roles || []).includes(roleFilter)) return false
      if (deptFilter !== 'all' && u.department !== deptFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!u.name.toLowerCase().includes(q) && !u.position.toLowerCase().includes(q) && !u.department.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [users, search, roleFilter, deptFilter])

  if (!canManageUser) {
    return (
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center animate-fade-in" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <Users size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground mb-1">权限不足</p>
        <p className="text-xs text-muted-foreground">用户管理需要运营管理员及以上角色，请切换角色体验</p>
      </div>
    )
  }

  // v1.4：打开编辑弹窗
  const handleEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({
      roles: user.roles || [user.role || 'user'],
      loginMethod: user.loginMethod,
      loginAccount: user.loginAccount || user.employeeId || '',
      password: '',
      accountStatus: user.accountStatus,
    })
    setShowPassword(false)
  }

  // v1.4：保存编辑
  // v1.9：改为异步，等待后端 API 同步完成后再提示成功
  const handleSaveEdit = async () => {
    if (!editingUser) return
    // v1.7：至少分配一个角色
    if (editForm.roles.length === 0) {
      addToast('error', '请至少分配一个角色')
      return
    }
    // 校验：账号密码方式必须有登录账号和密码
    if (editForm.loginMethod === 'password' || editForm.loginMethod === 'both') {
      if (!editForm.loginAccount.trim()) {
        addToast('error', '请填写登录账号')
        return
      }
      if (editForm.password && (editForm.password.length < 6 || !/[A-Za-z]/.test(editForm.password) || !/\d/.test(editForm.password))) {
        addToast('error', '新密码须至少 6 个字符并同时包含字母和数字')
        return
      }
    }
    setSaving(true)
    try {
      await updateUserAccount(editingUser.id, {
        roles: editForm.roles,
        role: editForm.roles[0],
        loginMethod: editForm.loginMethod,
        loginAccount: editForm.loginMethod === 'wecom' ? undefined : editForm.loginAccount.trim(),
        password: editForm.loginMethod === 'wecom' || !editForm.password ? undefined : editForm.password,
        accountStatus: editForm.accountStatus,
      })
      addToast('success', `已更新用户「${editingUser.name}」的配置`)
      setEditingUser(null)
    } catch (err: any) {
      addToast('error', err.message || '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  // v1.4：重置密码
  // v1.9：改为异步，等待后端 API 同步完成后再提示成功
  const handleResetPassword = async (user: User) => {
    if (user.accountStatus === 'disabled') {
      addToast('error', `账号「${user.name}」已禁用，无法重置密码`)
      return
    }
    if (user.loginMethod === 'wecom') {
      addToast('info', `用户「${user.name}」仅开通了企业微信登录，无需重置密码`)
      return
    }
    const temporaryPassword = await resetUserPassword(user.id)
    if (temporaryPassword) setResetResult({ userName: user.name, password: temporaryPassword })
  }

  // 登录方式标签
  const renderLoginMethod = (method: LoginMethod) => {
    const tags: React.ReactNode[] = []
    if (method === 'wecom' || method === 'both') {
      tags.push(
        <span key="wecom" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}>
          企业微信
        </span>
      )
    }
    if (method === 'password' || method === 'both') {
      tags.push(
        <span key="pwd" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning)' }}>
          账号密码
        </span>
      )
    }
    return <div className="flex gap-1 flex-wrap">{tags}</div>
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold mb-1">用户管理</h2>
          <p className="text-xs text-muted-foreground">配置账号密码登录、分配角色、管理账号状态</p>
        </div>
      </div>

      {/* 角色分布统计 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ROLE_COLS.map((r) => (
          <div key={r} className="rounded-xl border bg-card p-3 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
            <div className="text-xs font-medium" style={{ color: 'var(--aic-muted-foreground)' }}>{ROLE_CONFIG[r].label}</div>
            <div className="text-2xl font-bold mt-0.5" style={{ color: 'var(--aic-primary)' }}>{roleStats[r] || 0}</div>
          </div>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="rounded-xl border bg-card p-4 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名、工号、部门..."
              className="h-10 w-full rounded-md border pl-9 pr-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
              className="h-10 rounded-md border px-3 text-sm outline-none cursor-pointer"
              style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-background)' }}
            >
              <option value="all">全部角色</option>
              {ROLE_COLS.map((r) => (
                <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
              ))}
            </select>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-10 rounded-md border px-3 text-sm outline-none cursor-pointer"
              style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-background)' }}
            >
              {departments.map((d) => (
                <option key={d} value={d}>{d === 'all' ? '全部部门' : d}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">共 {filteredUsers.length} / {users.length} 个用户</div>
      </div>

      {/* 用户列表表格（v1.4：新增登录方式列、重置密码按钮） */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <th className="text-left p-3 font-semibold whitespace-nowrap">姓名 / 工号</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">部门 / 职位</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">角色</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">登录方式</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">状态</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">作品数</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">最后活跃</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                // v1.9：使用后端返回的真实数据替代 mockData 的 USER_ACTIVITY
                const worksCount = u.worksCount ?? 0
                const lastActive = u.lastLoginAt
                  ? formatDateTime(u.lastLoginAt)
                  : '—'
                return (
                  <tr key={u.id} className="border-b last:border-0" style={{ borderColor: 'var(--aic-border-solid)' }}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} color={u.avatarColor} size={32} />
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.employeeId || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">
                      {u.department} · {u.position}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles || []).map((r) => (
                          <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: ROLE_CONFIG[r].badgeBg, color: 'var(--aic-foreground)' }}>
                            {ROLE_CONFIG[r].label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">{renderLoginMethod(u.loginMethod)}</td>
                    <td className="p-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: u.accountStatus === 'active' ? 'var(--state-success-bg)' : u.accountStatus === 'disabled' ? 'var(--state-danger-bg)' : 'var(--state-warning-bg)',
                          color: u.accountStatus === 'active' ? 'var(--state-success)' : u.accountStatus === 'disabled' ? 'var(--state-danger)' : 'var(--state-warning)',
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
                        {u.accountStatus === 'active' ? '正常' : u.accountStatus === 'disabled' ? '已禁用' : '已锁定'}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{worksCount}</td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{lastActive}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(u)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
                          style={{ borderColor: 'var(--aic-border-solid)' }}
                        >
                          <Pencil size={11} /> 编辑
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
                          style={{ borderColor: 'var(--aic-border-solid)' }}
                          title="重置为默认密码"
                        >
                          <Key size={11} /> 重置密码
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">
                    没有符合条件的用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 账号密码配置说明 */}
      <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info)' }}>
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          <strong>账号密码配置说明：</strong>
          企业微信用户默认以扫码方式登录，无需配置账号密码。如需为用户开通账号密码登录（如外部协作人员、企业微信不可用场景），
          管理员可在"编辑用户"弹窗中设置账号和初始密码。密码需满足复杂度要求（6-32 字符，含字母和数字），重置后密码以默认密码形式下发。
        </span>
      </div>

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setResetResult(null)}>
          <div className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold">密码重置成功</h3>
              <button type="button" onClick={() => setResetResult(null)} className="rounded p-1 hover:bg-muted"><X size={18} /></button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">请将以下临时密码安全告知“{resetResult.userName}”，关闭后将不再显示。</p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3" style={{ borderColor: 'var(--aic-border-solid)' }}>
              <code className="flex-1 select-all text-base font-bold tracking-wider">{resetResult.password}</code>
              <button type="button" className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--aic-border-solid)' }} onClick={async () => {
                await navigator.clipboard.writeText(resetResult.password)
                addToast('success', '临时密码已复制')
              }}>复制</button>
            </div>
            <button type="button" onClick={() => setResetResult(null)} className="mt-5 w-full rounded-md py-2 text-sm font-medium text-white" style={{ background: 'var(--aic-primary)' }}>我已妥善保存</button>
          </div>
        </div>
      )}

      {/* v1.4：编辑用户弹窗 */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setEditingUser(null)}
        >
          <div
            className="w-full max-w-[480px] rounded-xl bg-white p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">编辑用户 — 账号配置</h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            {/* 基本信息（只读） */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>姓名</label>
                <input
                  type="text"
                  value={editingUser.name}
                  readOnly
                  className="w-full h-9 rounded-md border px-3 text-sm"
                  style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-surface-elevated)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>工号</label>
                <input
                  type="text"
                  value={editingUser.employeeId || ''}
                  readOnly
                  className="w-full h-9 rounded-md border px-3 text-sm"
                  style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-surface-elevated)' }}
                />
              </div>
            </div>

            {/* v1.7：角色分配（多选，权限取并集） */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--aic-muted-foreground)' }}>角色分配（可多选，权限取并集）</label>
              <div className="flex flex-wrap gap-3">
                {ALL_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.roles.includes(r)}
                      onChange={() => {
                        const has = editForm.roles.includes(r)
                        setEditForm({
                          ...editForm,
                          roles: has ? editForm.roles.filter((x) => x !== r) : [...editForm.roles, r],
                        })
                      }}
                    />
                    {ROLE_CONFIG[r].label}
                  </label>
                ))}
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--aic-muted-foreground)' }}>
                已选 {editForm.roles.length} 个角色，权限取并集
              </p>
            </div>

            {/* 登录方式 */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--aic-muted-foreground)' }}>登录方式</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="loginMethod"
                    checked={editForm.loginMethod === 'wecom'}
                    onChange={() => setEditForm({ ...editForm, loginMethod: 'wecom' })}
                  />
                  企业微信扫码
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="loginMethod"
                    checked={editForm.loginMethod === 'password'}
                    onChange={() => setEditForm({ ...editForm, loginMethod: 'password' })}
                  />
                  账号密码
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="loginMethod"
                    checked={editForm.loginMethod === 'both'}
                    onChange={() => setEditForm({ ...editForm, loginMethod: 'both' })}
                  />
                  两者都支持
                </label>
              </div>
            </div>

            {/* 账号密码配置（仅当登录方式包含密码时显示） */}
            {(editForm.loginMethod === 'password' || editForm.loginMethod === 'both') && (
              <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <div className="mb-3">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>
                    登录账号 <span style={{ color: 'var(--state-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.loginAccount}
                    onChange={(e) => setEditForm({ ...editForm, loginAccount: e.target.value })}
                    placeholder="工号或邮箱"
                    className="w-full h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
                    style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'white' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--aic-muted-foreground)' }}>默认使用工号，也可修改为邮箱</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>
                    密码 <span style={{ color: 'var(--state-danger)' }}>*</span>
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--aic-muted-foreground)' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="6-32 字符，需含字母和数字"
                      className="w-full h-9 rounded-md border pl-9 pr-9 text-sm outline-none focus:ring-2"
                      style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'white' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--aic-muted-foreground)' }}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--aic-muted-foreground)' }}>6-32 字符，需含字母和数字。用户首次登录后可由管理员随时重置。</p>
                </div>
              </div>
            )}

            {/* 账号状态 */}
            <div className="mb-5">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--aic-muted-foreground)' }}>账号状态</label>
              <select
                value={editForm.accountStatus}
                onChange={(e) => setEditForm({ ...editForm, accountStatus: e.target.value as AccountStatus })}
                className="w-full h-9 rounded-md border px-3 text-sm outline-none cursor-pointer"
                style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'white' }}
              >
                <option value="active">正常</option>
                <option value="disabled">已禁用</option>
              </select>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingUser(null)}
                className="inline-flex items-center gap-1 rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-muted"
                style={{ borderColor: 'var(--aic-border-solid)' }}
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
              >
                <Save size={14} /> {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============ 作品管理面板（v1.5：统一的作品列表入口） ============
function WorkManagement({
  canReadWorks,
  canManageWorks,
  canEditAnyWork,
}: {
  canReadWorks: boolean
  canManageWorks: boolean
  canEditAnyWork: boolean
}) {
  const navigate = useNavigate()
  const {
    addToast,
    offlineWork, onlineWork,
    batchOfflineWorks, batchOnlineWorks, batchDeleteWorks,
  } = useApp()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<WorkType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<WorkStatus | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [pageWorks, setPageWorks] = useState<Work[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ total: 0, published: 0, offline: 0, deleted: 0, unpublished: 0 })

  const loadAdminWorks = useCallback(async () => {
    if (!canReadWorks) return
    setLoading(true)
    try {
      const result = await getAdminWorks({
        page,
        pageSize,
        status: statusFilter,
        type: typeFilter,
        q: search,
      })
      const nextTotalPages = Math.max(1, result.totalPages)
      setStats(result.stats)
      setTotal(result.total)
      setTotalPages(nextTotalPages)
      if (page > nextTotalPages) {
        setPage(nextTotalPages)
        return
      }
      setPageWorks(result.items.map(transformWork))
    } catch (error) {
      setPageWorks([])
      addToast('error', error instanceof Error ? error.message : '作品列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [addToast, canReadWorks, page, search, statusFilter, typeFilter])

  useEffect(() => {
    const timer = window.setTimeout(loadAdminWorks, search.trim() ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadAdminWorks])

  const currentPage = page
  const pageStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, total)

  // 筛选条件变化时重置到第 1 页
  useEffect(() => { setPage(1) }, [search, typeFilter, statusFilter])

  // 全选（仅当前页）
  const pageIds = pageWorks.filter((w) => w.status !== 'deleted').map((w) => w.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id))
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)))
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])])
    }
  }
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  if (!canReadWorks) {
    return (
      <div className="rounded-xl border bg-card p-8 shadow-sm text-center animate-fade-in" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <Package size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground mb-1">权限不足</p>
        <p className="text-xs text-muted-foreground">作品管理需要审核管理员或运营管理员及以上角色，请切换角色体验</p>
      </div>
    )
  }

  // 行操作：下架
  const handleOffline = async (work: Work) => {
    if (!canManageWorks) { addToast('error', '没有作品管理权限'); return }
    if (work.status !== 'published') {
      addToast('info', '仅已发布作品可下架')
      return
    }
    const reason = window.prompt(`请输入强制下架《${work.title}》的原因（至少 5 个字符）`)
    if (reason === null) return
    if (reason.trim().length < 5) { addToast('error', '强制下架原因至少 5 个字符'); return }
    const ok = await offlineWork(work.id, reason.trim())
    if (ok) {
      addToast('success', `已下架《${work.title}》`)
      await loadAdminWorks()
    }
  }

  // 行操作：上架
  const handleOnline = async (work: Work) => {
    if (!canManageWorks) { addToast('error', '没有作品管理权限'); return }
    if (work.status !== 'offline') {
      addToast('info', '仅已下架作品可上架')
      return
    }
    if (!window.confirm(`确认上架《${work.title}》？上架后作品重新在大厅展示。`)) return
    const ok = await onlineWork(work.id)
    if (ok) {
      addToast('success', `已上架《${work.title}》`)
      await loadAdminWorks()
    }
  }

  // 行操作：删除（软删除）
  const handleDelete = async (work: Work) => {
    if (!canManageWorks) { addToast('error', '没有作品管理权限'); return }
    if (work.status === 'deleted') {
      addToast('info', '该作品已删除，不可重复操作')
      return
    }
    if (!window.confirm(`确认删除《${work.title}》？删除后不可恢复（数据归档保留）。`)) return
    const count = await batchDeleteWorks([work.id])
    if (count > 0) addToast('success', `已删除《${work.title}》`)
    if (count > 0) setSelectedIds((prev) => prev.filter((id) => id !== work.id))
    if (count > 0) await loadAdminWorks()
  }

  // 超级管理员可编辑任意未删除作品，修改内容仍生成新版本并进入审核流程。
  const handleEdit = (work: Work) => {
    if (!canEditAnyWork) {
      addToast('error', '仅超级管理员可编辑其他用户的作品')
      return
    }
    if (work.status === 'deleted') {
      addToast('info', '已删除作品不可编辑')
      return
    }
    navigate(`/publish?edit=${encodeURIComponent(work.id)}`)
  }

  // 批量操作
  const handleBatchOffline = async () => {
    if (!canManageWorks) { addToast('error', '没有作品管理权限'); return }
    if (selectedIds.length === 0) { addToast('error', '请先选择作品'); return }
    const reason = window.prompt(`请输入批量强制下架 ${selectedIds.length} 个作品的原因（至少 5 个字符）`)
    if (reason === null) return
    if (reason.trim().length < 5) { addToast('error', '强制下架原因至少 5 个字符'); return }
    const count = await batchOfflineWorks(selectedIds, reason.trim())
    if (count > 0) addToast('success', `已下架 ${count} 个作品`)
    if (count > 0) setSelectedIds([])
    if (count > 0) await loadAdminWorks()
  }
  const handleBatchOnline = async () => {
    if (!canManageWorks) { addToast('error', '没有作品管理权限'); return }
    if (selectedIds.length === 0) { addToast('error', '请先选择作品'); return }
    if (!window.confirm(`确认批量上架选中的 ${selectedIds.length} 个作品？`)) return
    const count = await batchOnlineWorks(selectedIds)
    if (count > 0) addToast('success', `已上架 ${count} 个作品`)
    if (count > 0) setSelectedIds([])
    if (count > 0) await loadAdminWorks()
  }
  const handleBatchDelete = async () => {
    if (!canManageWorks) { addToast('error', '没有作品管理权限'); return }
    if (selectedIds.length === 0) { addToast('error', '请先选择作品'); return }
    if (!window.confirm(`确认批量删除选中的 ${selectedIds.length} 个作品？删除后不可恢复。`)) return
    const count = await batchDeleteWorks(selectedIds)
    if (count > 0) addToast('success', `已删除 ${count} 个作品`)
    if (count > 0) setSelectedIds([])
    if (count > 0) await loadAdminWorks()
  }

  // 状态徽章（使用 Tags 组件）
  const renderStatus = (status: WorkStatus) => <WorkStatusBadge status={status} />

  // 线上版本号
  const getOnlineVersion = (work: Work) => {
    if (!work.currentVersion) return <span className="text-xs text-muted-foreground">—</span>
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}>
        {work.currentVersion}
      </span>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold mb-1">作品管理</h2>
          <p className="text-xs text-muted-foreground">平台全部作品的统一管理入口，支持上架/下架/编辑/删除等操作</p>
        </div>
      </div>

      {/* 状态统计 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--aic-muted-foreground)' }}>全部作品</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: 'var(--aic-primary)' }}>{stats.total}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--aic-muted-foreground)' }}>已发布</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: 'var(--state-success)' }}>{stats.published}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--aic-muted-foreground)' }}>已下架</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: '#3730a3' }}>{stats.offline}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--aic-muted-foreground)' }}>已删除</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: 'var(--state-danger)' }}>{stats.deleted}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--aic-muted-foreground)' }}>未发布</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: 'var(--aic-muted-foreground)' }}>{stats.unpublished}</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="rounded-xl border bg-card p-4 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 50))}
              placeholder="搜索作品名称、作者、作品简介..."
              maxLength={50}
              className="h-10 w-full rounded-md border pl-9 pr-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as WorkType | 'all')}
              className="h-10 rounded-md border px-3 text-sm outline-none cursor-pointer"
              style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-background)' }}
            >
              <option value="all">全部类型</option>
              {(Object.keys(TYPE_CONFIG) as WorkType[]).map((t) => (
                <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WorkStatus | 'all')}
              className="h-10 rounded-md border px-3 text-sm outline-none cursor-pointer"
              style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-background)' }}
            >
              <option value="all">全部状态</option>
              <option value="published">已发布</option>
              <option value="offline">已下架</option>
              <option value="deleted">已删除</option>
              <option value="unpublished">未发布</option>
            </select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">共 {total} / {stats.total} 个作品</div>
      </div>

      {/* 批量操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            全选
          </label>
          <span className="text-xs text-muted-foreground">|</span>
          <button
            onClick={handleBatchOffline}
            disabled={!canManageWorks || selectedIds.length === 0}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--state-warning)', color: 'var(--state-warning)' }}
          >
            <ArrowDownCircle size={12} /> 批量下架
          </button>
          <button
            onClick={handleBatchOnline}
            disabled={!canManageWorks || selectedIds.length === 0}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--state-success)', color: 'var(--state-success)' }}
          >
            <ArrowUpCircle size={12} /> 批量上架
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={!canManageWorks || selectedIds.length === 0}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
          >
            <Trash2 size={12} /> 批量删除
          </button>
          {selectedIds.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--aic-primary-light)', color: 'var(--aic-primary)' }}>
              已选 {selectedIds.length}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">第 {pageStart}-{pageEnd} 条，共 {total} 条</span>
      </div>

      {/* 作品列表表格 */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <th className="text-left p-3 font-semibold whitespace-nowrap" style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">作品名称</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">类型</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">业务领域</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">作者</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">线上版本</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">作品状态</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">互动数据</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">最后更新</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageWorks.map((w) => {
                const isDeleted = w.status === 'deleted'
                const lastUpdate = w.publishedAt || w.createdAt
                return (
                  <tr
                    key={w.id}
                    className="border-b last:border-0"
                    style={{ borderColor: 'var(--aic-border-solid)', opacity: isDeleted ? 0.55 : 1 }}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(w.id)}
                        onChange={() => toggleOne(w.id)}
                        disabled={isDeleted}
                      />
                    </td>
                    <td className="p-3">
                      <div className="min-w-[160px]">
                        {isDeleted ? (
                          <span className="font-medium">{w.title}</span>
                        ) : (
                          <Link to={`/works/${w.id}`} className="font-medium hover:text-primary transition">{w.title}</Link>
                        )}
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{w.intro}</div>
                      </div>
                    </td>
                    <td className="p-3"><TypeTag type={w.type} size="sm" /></td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">{w.category}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">{w.authorName} · {w.department}</td>
                    <td className="p-3">{getOnlineVersion(w)}</td>
                    <td className="p-3">{renderStatus(w.status)}</td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      👍 {w.likes} · ⭐ {w.favorites} · ⬇ {w.downloads}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{lastUpdate}</td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {w.status === 'published' && (
                          <button
                            onClick={() => handleOffline(w)}
                            disabled={!canManageWorks}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:opacity-80"
                            style={{ borderColor: 'var(--state-warning)', color: 'var(--state-warning)' }}
                          >
                            <ArrowDownCircle size={11} /> 下架
                          </button>
                        )}
                        {w.status === 'offline' && (
                          <button
                            onClick={() => handleOnline(w)}
                            disabled={!canManageWorks}
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-white transition hover:opacity-90"
                            style={{ backgroundColor: 'var(--state-success)' }}
                          >
                            <ArrowUpCircle size={11} /> 上架
                          </button>
                        )}
                        {!isDeleted && (
                          <>
                            {canEditAnyWork && (
                              <button
                                onClick={() => handleEdit(w)}
                                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:opacity-80"
                                style={{ borderColor: 'var(--aic-primary)', color: 'var(--aic-primary)' }}
                              >
                                <Pencil size={11} /> 编辑
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(w)}
                              disabled={!canManageWorks}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
                            >
                              <Trash2 size={11} /> 删除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground text-sm">
                    作品列表加载中...
                  </td>
                </tr>
              )}
              {!loading && pageWorks.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground text-sm">
                    没有符合条件的作品
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">第 {currentPage} / {totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            >
              <ChevronLeft size={12} /> 上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-xs text-muted-foreground px-1">…</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={`min-w-[28px] h-7 rounded text-xs font-medium transition ${
                      p === currentPage ? 'text-white' : 'border hover:bg-muted'
                    }`}
                    style={
                      p === currentPage
                        ? { background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }
                        : { borderColor: 'var(--aic-border-solid)' }
                    }
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            >
              下一页 <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* 操作说明 */}
      <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info)' }}>
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          <strong>作品管理说明：</strong>
          下架后作品从大厅移除但数据保留，可随时上架；删除为软删除（数据归档保留，不可恢复）；
          普通后台管理员不可代替作者编辑或提交版本；超级管理员可编辑任意未删除作品，修改内容仍按新版本进入审核流程。已删除作品不可再操作。
        </span>
      </div>
    </div>
  )
}

// ============ 统计卡片 ============
function StatCard({
  label,
  value,
  change,
  color,
  danger,
}: {
  label: string
  value: number
  change: string
  color: string
  danger?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
      <div className="text-2xl font-bold" style={{ color }}>{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      <div className="flex items-center gap-1 text-xs mt-1.5" style={{ color: danger ? 'var(--state-danger)' : 'var(--state-success)' }}>
        {!danger && <TrendingUp size={11} />}
        {change}
      </div>
    </div>
  )
}

// ============ v1.5：操作日志面板（只读，系统自动记录） ============
// 权限模型：审核管理员/运营管理员可查看自身记录；超级管理员可查看全部并导出 CSV
const LOG_PAGE_SIZE = 15

// 模块标签配色
const LOG_MODULE_STYLE: Record<string, { bg: string; color: string }> = {
  '作品大厅': { bg: 'rgba(37,99,235,0.1)', color: 'var(--aic-primary)' },
  '作品发布': { bg: 'rgba(37,99,235,0.1)', color: 'var(--aic-primary)' },
  '审核管理': { bg: 'rgba(245,158,11,0.1)', color: 'var(--state-warning)' },
  '作品详情': { bg: 'rgba(107,114,128,0.12)', color: 'var(--aic-muted-foreground)' },
  '个人中心': { bg: 'rgba(107,114,128,0.12)', color: 'var(--aic-muted-foreground)' },
  '后台管理': { bg: 'rgba(13,148,136,0.1)', color: '#0d9488' },
  '登录认证': { bg: 'rgba(107,114,128,0.12)', color: 'var(--aic-muted-foreground)' },
}

// 操作类型标签配色
const LOG_ACTION_STYLE: Record<string, { bg: string; color: string }> = {
  '创建': { bg: 'rgba(37,99,235,0.1)', color: 'var(--aic-primary)' },
  '更新': { bg: 'rgba(37,99,235,0.1)', color: 'var(--aic-primary)' },
  '删除': { bg: 'rgba(239,68,68,0.1)', color: 'var(--state-danger)' },
  '审核': { bg: 'rgba(34,197,94,0.1)', color: '#16a34a' },
  '上架/下架': { bg: 'rgba(245,158,11,0.1)', color: '#d97706' },
  '登录/登出': { bg: 'rgba(107,114,128,0.12)', color: 'var(--aic-muted-foreground)' },
  '角色分配': { bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
}

function HighlightMatch({ text, keyword }: { text: string; keyword: string }) {
  const value = String(text || '')
  const term = keyword.trim()
  if (!term) return <>{value}</>
  const compactValue = value.replace(/[\/／]/g, '').toLowerCase()
  const compactTerm = term.replace(/[\/／]/g, '').toLowerCase()
  if (!value.toLowerCase().includes(term.toLowerCase()) && compactTerm && compactValue.includes(compactTerm)) {
    return <mark className="rounded px-0.5 bg-yellow-200 text-inherit">{value}</mark>
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = value.split(new RegExp(`(${escaped})`, 'gi'))
  return <>{parts.map((part, index) => part.toLowerCase() === term.toLowerCase()
    ? <mark key={`${part}-${index}`} className="rounded px-0.5 bg-yellow-200 text-inherit">{part}</mark>
    : part)}</>
}

function OperationLogPanel({
  canViewAll,
  canExport,
  addToast,
}: {
  canViewAll: boolean
  canExport: boolean
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [moduleFilter, setModuleFilter] = useState<string>('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  // v2.0：日志数据从后端 API 拉取
  const [logs, setLogs] = useState<OperationLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  // 关键词防抖（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword])

  // 筛选条件变化时重置到第 1 页
  useEffect(() => { setPage(1) }, [debouncedKeyword, moduleFilter, actionFilter, dateFilter])

  // 拉取日志数据
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await getOperationLogs({
          page,
          pageSize: LOG_PAGE_SIZE,
          module: moduleFilter || undefined,
          action: actionFilter || undefined,
          startDate: dateFilter || undefined,
          endDate: dateFilter || undefined,
          keyword: debouncedKeyword || undefined,
        })
        setLogs(data.items)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      } catch (err: any) {
        setError(err.message || '获取操作日志失败')
        setLogs([])
        setTotal(0)
        setTotalPages(1)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [page, moduleFilter, actionFilter, dateFilter, debouncedKeyword])

  // 导出 CSV（仅超级管理员，从后端下载）
  const handleExport = async () => {
    if (!canExport) {
      addToast('error', '仅超级管理员可导出操作日志')
      return
    }
    setExporting(true)
    try {
      const blob = await exportOperationLogs({
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        startDate: dateFilter || undefined,
        endDate: dateFilter || undefined,
        keyword: debouncedKeyword || undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `操作日志_${nowDate().replaceAll('/', '-')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('success', '操作日志已导出（CSV）')
    } catch (err: any) {
      addToast('error', err.message || '导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const handleReset = () => {
    setKeyword('')
    setModuleFilter('')
    setActionFilter('')
    setDateFilter('')
  }

  const currentPage = Math.min(page, totalPages)
  const hasFilter = !!(moduleFilter || actionFilter || dateFilter || debouncedKeyword)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 标题 + 工具栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold mb-1">操作日志</h2>
          <p className="text-xs text-muted-foreground">
            系统自动记录所有用户的关键操作行为。{canViewAll ? '当前可查看全部日志。' : '当前仅可查看自身操作记录。'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索操作人、操作内容..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-md border w-[220px]"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <option value="">全部模块</option>
            {LOG_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <option value="">全部操作类型</option>
            {LOG_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-md border"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          />
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition hover:bg-muted"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <RotateCcw size={12} /> 重置
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport || exporting}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
            title={canExport ? '导出当前筛选结果为 CSV' : '仅超级管理员可导出'}
          >
            <Download size={13} /> {exporting ? '导出中...' : '导出 CSV'}
          </button>
        </div>
      </div>

      {/* 只读说明 */}
      <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info)' }}>
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          <strong>只读说明：</strong>操作日志为系统自动记录，<strong>任何人均不可新增、修改或删除</strong>。日志保留期限为 180 天，超期自动归档。仅超级管理员可查看全部日志并导出，审核管理员和运营管理员可查看自身操作记录。
        </span>
      </div>

      {/* 统计条 */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {loading ? (
          <span>加载中...</span>
        ) : (
          <>
            <span>共 <strong style={{ color: 'var(--aic-foreground)' }}>{total}</strong> 条记录</span>
            {hasFilter && <span>（已筛选）</span>}
            <span>·</span>
            <span>第 {currentPage} / {totalPages} 页</span>
          </>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg p-3 flex items-start gap-2 text-xs" style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 日志列表表格 */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                <th className="text-left p-3 font-semibold whitespace-nowrap">日志ID</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">操作时间</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">操作人</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">模块</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">操作类型</th>
                <th className="text-left p-3 font-semibold min-w-[180px]">操作内容</th>
                <th className="text-left p-3 font-semibold min-w-[160px]">操作对象</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">IP 地址</th>
                <th className="text-left p-3 font-semibold whitespace-nowrap">结果</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const modStyle = LOG_MODULE_STYLE[l.module] || { bg: 'rgba(107,114,128,0.12)', color: 'var(--aic-muted-foreground)' }
                const actStyle = LOG_ACTION_STYLE[l.action] || { bg: 'rgba(107,114,128,0.12)', color: 'var(--aic-muted-foreground)' }
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40" style={{ borderColor: 'var(--aic-border-solid)' }}>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap font-mono">{l.id.slice(-8)}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{l.time}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="text-xs font-medium"><HighlightMatch text={l.operatorName} keyword={debouncedKeyword} /> · <HighlightMatch text={l.department} keyword={debouncedKeyword} /></div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{l.role}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: modStyle.bg, color: modStyle.color }}><HighlightMatch text={l.module} keyword={debouncedKeyword} /></span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: actStyle.bg, color: actStyle.color }}><HighlightMatch text={l.action} keyword={debouncedKeyword} /></span>
                    </td>
                    <td className="p-3 text-xs"><HighlightMatch text={l.content} keyword={debouncedKeyword} /></td>
                    <td className="p-3 text-xs text-muted-foreground"><HighlightMatch text={l.target} keyword={debouncedKeyword} /></td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap font-mono">{l.ip}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={l.result === 'success'
                          ? { backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }
                          : { backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
                      >
                        {l.result === 'success' ? '成功' : '失败'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                    {total === 0 ? '暂无操作日志记录' : '没有符合条件的日志，试试重置筛选条件'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">第 {currentPage} / {totalPages} 页，共 {total} 条</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border text-xs transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
                  <button
                    onClick={() => setPage(p)}
                    className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-md border text-xs font-medium transition"
                    style={p === currentPage
                      ? { borderColor: 'var(--aic-primary)', backgroundColor: 'var(--aic-primary-light)', color: 'var(--aic-primary)' }
                      : { borderColor: 'var(--aic-border-solid)' }
                    }
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border text-xs transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
