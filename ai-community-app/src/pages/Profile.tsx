import { useState, Fragment, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Edit, Undo, MessageSquareWarning, Clock, CheckCircle, XCircle, ArrowUpCircle } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { TypeTag, WorkStatusBadge, Avatar } from '../components/Tags'
import WorkCard from '../components/WorkCard'
import { EmptyState } from '../components/Common'
import type { Work, WorkVersion } from '../types'

const TABS = [
  { id: 'works', label: '我的作品' },
  { id: 'fav', label: '我的收藏' },
  { id: 'likes', label: '我的点赞' },
  { id: 'review', label: '审核进度' },
] as const

// v2.1：确定展示用版本（优先级：待审核 > 已驳回 > 草稿 > 待作者确认的候选版本 > 当前线上版本）
function pickDisplayVersion(work: Work): WorkVersion | undefined {
  if (!work.versions.length) return undefined
  const pending = work.versions.find((v) => v.status === 'pending')
  if (pending) return pending
  const rejected = work.versions.find((v) => v.status === 'rejected')
  if (rejected) return rejected
  const draft = work.versions.find((v) => v.status === 'draft')
  if (draft) return draft
  const candidate = work.versions.find((v) => v.status === 'passed' && v.candidate)
  if (candidate) return candidate
  const current = work.versions.find((v) => v.current)
  return current || work.versions[0]
}

export default function Profile() {
  const navigate = useNavigate()
  const { works, events, currentUser, withdrawVersion, startModifyRejected, publishCandidateVersion, addToast, hasPermission } = useApp()
  const canCreateWork = hasPermission('work:create')
  const canSubmitWork = hasPermission('work:submit')
  const canEditOwnWork = hasPermission('work:editOwn')
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('works')
  const [showRejectId, setShowRejectId] = useState<string | null>(null)

  const myWorks = works.filter((w) => w.authorId === currentUser.id)
  const myFavorites = works.filter((w) => w.favoritedByMe)
  const myLikes = works.filter((w) => w.likedByMe)
  const myEvents = events.filter((e) => myWorks.some((w) => w.id === e.workId))

  // v1.1：按展示版本状态排序（待审核 → 已驳回 → 草稿 → 已发布）
  const sortedMyWorks = useMemo(() => {
    const order: Record<string, number> = { pending: 0, rejected: 1, draft: 2, passed: 3 }
    return [...myWorks].sort((a, b) => {
      const va = pickDisplayVersion(a)?.status || 'passed'
      const vb = pickDisplayVersion(b)?.status || 'passed'
      return (order[va] ?? 9) - (order[vb] ?? 9)
    })
  }, [myWorks])

  const handleWithdraw = async (workId: string, version: string, title: string) => {
    const ok = await withdrawVersion(workId, version)
    if (ok) addToast('success', `「${title} ${version}」已撤回，可在草稿中继续编辑`)
  }

  const handleEdit = async (workId: string, version: string, status: string) => {
    // 已驳回版本进入编辑时回退到草稿
    if (status === 'rejected') {
      const ok = await startModifyRejected(workId, version)
      if (!ok) return
    }
  }

  const handleGoModify = async (workId: string, version: string) => {
    const ok = await startModifyRejected(workId, version)
    if (!ok) return
    setShowRejectId(null)
    navigate(`/publish?edit=${encodeURIComponent(workId)}`)
  }

  const handlePublishCandidate = async (work: Work, version: WorkVersion) => {
    if (!window.confirm(`确认上线《${work.title}》的候选版本 ${version.version}？上线后将替换原线上版本并恢复作品展示。`)) return
    const ok = await publishCandidateVersion(work.id, version.version)
    if (ok) addToast('success', `《${work.title}》${version.version} 已确认上线`)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 个人信息头部 */}
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 rounded-xl border p-5 shadow-sm"
        style={{ borderColor: 'var(--aic-border-solid)' }}
      >
        <div className="flex items-center gap-4 flex-1">
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={56} />
          <div>
            <div className="text-lg font-bold">{currentUser.name}</div>
            <div className="text-sm text-muted-foreground">{currentUser.department} · {currentUser.position}</div>
          </div>
        </div>
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold" style={{ color: 'var(--aic-primary)' }}>{myWorks.filter((w) => w.status === 'published').length}</span>
            <span className="text-xs text-muted-foreground">已发布</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold" style={{ color: 'var(--aic-gradient-violet)' }}>{myFavorites.length}</span>
            <span className="text-xs text-muted-foreground">收藏</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold" style={{ color: 'var(--state-success)' }}>{myLikes.length}</span>
            <span className="text-xs text-muted-foreground">点赞</span>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="border-b" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={activeTab === tab.id ? { borderColor: 'var(--aic-primary)' } : { borderColor: 'transparent' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="animate-fade-in">
        {/* 我的作品 */}
        {activeTab === 'works' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">共 {myWorks.length} 个作品</span>
              {canCreateWork && (
                <Link
                  to="/publish"
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
                >
                  <Plus size={14} /> 发布新作品
                </Link>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                    <th className="text-left p-3 font-semibold">作品名称</th>
                    <th className="text-left p-3 font-semibold">类型</th>
                    <th className="text-left p-3 font-semibold">线上版本</th>
                    <th className="text-left p-3 font-semibold">作品状态</th>
                    <th className="text-left p-3 font-semibold">发布时间</th>
                    <th className="text-left p-3 font-semibold">互动</th>
                    <th className="text-left p-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMyWorks.map((w) => {
                    const displayVersion = pickDisplayVersion(w)
                    const vStatus = displayVersion?.status
                    const hasPending = w.versions.some((v) => v.status === 'pending')
                    const hasRejected = w.versions.some((v) => v.status === 'rejected')
                    const hasDraft = w.versions.some((v) => v.status === 'draft')
                    const candidateVersion = w.versions.find((v) => v.status === 'passed' && v.candidate)
                    const canEdit = canEditOwnWork && w.status !== 'deleted' && (hasDraft || hasRejected || w.status === 'published' || w.status === 'unpublished' || w.status === 'offline')
                    return (
                      <Fragment key={w.id}>
                        <tr className="border-b last:border-0" style={{ borderColor: 'var(--aic-border-solid)' }}>
                          <td className="p-3 font-medium">
                            {w.status === 'published' ? (
                              <Link to={`/works/${w.id}`} className="hover:text-primary transition">{w.title || '未命名作品'}</Link>
                            ) : (
                              w.title || '未命名作品'
                            )}
                          </td>
                          <td className="p-3"><TypeTag type={w.type} size="sm" /></td>
                          {/* 线上版本：展示当前线上版本号 */}
                          <td className="p-3">
                            {w.currentVersion ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}>
                                {w.currentVersion}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          {/* 作品状态：作品状态 + 进行中的版本状态（待审核/已驳回/草稿） */}
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <WorkStatusBadge status={w.status} />
                              {displayVersion && vStatus && vStatus !== 'passed' && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium w-fit"
                                  style={{
                                    backgroundColor:
                                      vStatus === 'pending' ? 'var(--state-warning-bg)'
                                      : vStatus === 'rejected' ? 'var(--state-danger-bg)'
                                      : 'var(--aic-surface-elevated)',
                                    color:
                                      vStatus === 'pending' ? 'var(--state-warning)'
                                      : vStatus === 'rejected' ? 'var(--state-danger)'
                                      : 'var(--aic-muted-foreground)',
                                  }}
                                  title={w.currentVersion ? `线上 ${w.currentVersion} 继续可见` : undefined}
                                >
                                  {vStatus === 'pending' ? '待审核' : vStatus === 'rejected' ? '已驳回' : '草稿'} {displayVersion.version}
                                </span>
                              )}
                              {displayVersion && vStatus === 'passed' && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium w-fit"
                                  style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}
                                >
                                  已通过 {displayVersion.version}
                                </span>
                              )}
                              {candidateVersion && w.status === 'offline' && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium w-fit"
                                  style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning)' }}
                                >
                                  待作者确认上线 {candidateVersion.version}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{w.publishedAt || w.createdAt || '—'}</td>
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {w.status === 'published' ? `👍${w.likes} ⭐${w.favorites} ⬇${w.downloads}` : '—'}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1 flex-wrap">
                              {canEdit && !hasRejected && (
                                <Link
                                  to={`/publish?edit=${w.id}`}
                                  onClick={() => displayVersion && handleEdit(w.id, displayVersion.version, displayVersion.status)}
                                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
                                  style={{ borderColor: 'var(--aic-border-solid)' }}
                                >
                                  <Edit size={11} /> 编辑
                                </Link>
                              )}
                              {canSubmitWork && w.status !== 'deleted' && hasPending && displayVersion && (
                                <button
                                  onClick={() => handleWithdraw(w.id, displayVersion.version, w.title)}
                                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition hover:bg-muted"
                                  style={{ borderColor: 'var(--aic-border-solid)' }}
                                >
                                  <Undo size={11} /> 撤回
                                </button>
                              )}
                              {w.status !== 'deleted' && hasRejected && displayVersion && (
                                <button
                                  onClick={() => setShowRejectId(showRejectId === w.id ? null : w.id)}
                                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition"
                                  style={{ borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
                                >
                                  <MessageSquareWarning size={11} /> 查看意见
                                </button>
                              )}
                              {candidateVersion && w.status === 'offline' && (
                                <button
                                  type="button"
                                  onClick={() => handlePublishCandidate(w, candidateVersion)}
                                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-white transition hover:opacity-90"
                                  style={{ backgroundColor: 'var(--state-success)', borderColor: 'var(--state-success)' }}
                                  title={`确认上线候选版本 ${candidateVersion.version}`}
                                >
                                  <ArrowUpCircle size={11} /> 确认上线 {candidateVersion.version}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {w.status !== 'deleted' && showRejectId === w.id && hasRejected && (
                          <tr>
                            <td colSpan={7} className="p-4" style={{ backgroundColor: 'var(--state-danger-bg)' }}>
                              {w.versions.filter((v) => v.status === 'rejected').map((v) => (
                                <div key={v.version} className="rounded-lg p-3 mb-2 last:mb-0" style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                  <div className="font-semibold text-sm mb-1" style={{ color: 'var(--state-danger)' }}>
                                    驳回修改意见 · {v.version}
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap break-all">{v.rejectReason}</p>
                                  <div className="text-xs text-muted-foreground">审核人：{v.reviewer || '审核管理员'} · {v.reviewedAt || '—'}</div>
                                  <div className="flex gap-2 mt-3">
                                    <button
                                      type="button"
                                      onClick={() => setShowRejectId(null)}
                                      className="rounded border px-3 py-1.5 text-xs font-medium"
                                      style={{ borderColor: 'var(--aic-border-solid)' }}
                                    >
                                      关闭
                                    </button>
                                    {canSubmitWork && canEditOwnWork && (
                                      <button
                                        type="button"
                                        onClick={() => handleGoModify(w.id, v.version)}
                                        className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-white"
                                        style={{ backgroundColor: 'var(--aic-primary)' }}
                                      >
                                        <Edit size={11} /> 去修改
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {myWorks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
                        {canCreateWork ? <>还没有作品，<Link to="/publish" className="text-primary hover:underline">去发布第一个</Link></> : '还没有作品，当前角色无创建作品权限'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 我的收藏 */}
        {activeTab === 'fav' && (
          <div>
            {myFavorites.length > 0 ? (
              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {myFavorites.map((w) => (
                  <WorkCard key={w.id} work={w} />
                ))}
              </div>
            ) : (
              <EmptyState message="还没有收藏任何作品" />
            )}
          </div>
        )}

        {/* 我的点赞 */}
        {activeTab === 'likes' && (
          <div>
            {myLikes.length > 0 ? (
              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {myLikes.map((w) => (
                  <WorkCard key={w.id} work={w} />
                ))}
              </div>
            ) : (
              <EmptyState message="还没有点赞任何作品" />
            )}
          </div>
        )}

        {/* 审核进度 */}
        {activeTab === 'review' && (
          <div>
            <h3 className="text-base font-bold mb-4">审核进度追踪</h3>
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5" style={{ background: 'var(--aic-border-solid)' }} />
              {myEvents.map((e) => {
                const isApproved = e.status === 'approved'
                const isRejected = e.status === 'rejected'
                const Icon = isApproved ? CheckCircle : isRejected ? XCircle : Clock
                const color = isApproved ? 'var(--state-success)' : isRejected ? 'var(--state-danger)' : 'var(--state-warning)'
                return (
                  <div key={e.id} className="relative pb-6 last:pb-0">
                    <div
                      className="absolute -left-6 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-white"
                      style={{ borderColor: color }}
                    >
                      {isApproved && <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} style={{ color }} />
                      <span className="text-xs text-muted-foreground">{e.date}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--aic-surface-elevated)', color: 'var(--aic-primary)' }}>{e.version}</span>
                      {e.isFirstVersion && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--aic-violet-light)', color: 'var(--aic-gradient-violet)' }}>首版本</span>
                      )}
                    </div>
                    <Link to={`/works/${e.workId}`} className="text-sm font-semibold hover:text-primary hover:underline">
                      {e.workTitle} — {isApproved ? '审核通过' : isRejected ? '审核驳回' : '提交审核'}
                    </Link>
                    {isApproved && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--state-success)' }}>
                        {e.isFirstVersion ? '作品首次发布至大厅' : `新版本 ${e.version} 已替换线上版本`}
                      </div>
                    )}
                    {isRejected && e.reason && (
                      <div className="text-xs mt-0.5 whitespace-pre-wrap break-all line-clamp-3" style={{ color: 'var(--state-danger)' }}>
                        修改意见：{e.reason}
                      </div>
                    )}
                    {!isApproved && !isRejected && (
                      <div className="text-xs text-muted-foreground mt-0.5">等待管理员审核中...</div>
                    )}
                  </div>
                )
              })}
              {myEvents.length === 0 && (
                <EmptyState message="暂无审核记录" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
