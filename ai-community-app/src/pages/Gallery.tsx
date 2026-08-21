import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Plus, Star, Loader2 } from 'lucide-react'
import { useApp, transformWork } from '../store/AppStore'
import { searchWorks, getRecommendedWorks } from '../lib/api'
import { WORK_TYPES } from '../types'
import type { WorkType, SortBy, Work } from '../types'
import WorkCard from '../components/WorkCard'
import { EmptyState, Pagination } from '../components/Common'

const PAGE_SIZE = 12

export default function Gallery() {
  const { domains, tags, works: sharedWorks, hasPermission } = useApp()
  const canCreateWork = hasPermission('work:create')
  const [urlParams, setUrlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeType, setActiveType] = useState<WorkType | 'all'>('all')
  const [activeDomain, setActiveDomain] = useState<string | 'all'>('all')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('latest')
  const requestedPage = Number(urlParams.get('page'))
  const [page, setPage] = useState(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
  const filtersMounted = useRef(false)

  // v2.0：作品列表从后端 API 分页拉取（支持搜索/筛选/排序）
  const [works, setWorks] = useState<Work[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // v2.0：推荐作品从后端 API 拉取
  const [recommended, setRecommended] = useState<Work[]>([])

  // 搜索关键词防抖（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // 筛选条件变化时重置到第 1 页
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true
      return
    }
    setPage(1)
  }, [debouncedSearch, activeType, activeDomain, activeTags, sortBy])

  // 页码写入地址栏，刷新或手动输入页码后仍能得到稳定结果。
  useEffect(() => {
    const next = new URLSearchParams(urlParams)
    if (page > 1) next.set('page', String(page))
    else next.delete('page')
    if (next.toString() !== urlParams.toString()) setUrlParams(next, { replace: true })
  }, [page, setUrlParams, urlParams])

  // 拉取作品列表（搜索/筛选/排序/分页变化时触发）
  useEffect(() => {
    const fetchWorks = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await searchWorks({
          q: debouncedSearch || undefined,
          type: activeType,
          domain: activeDomain,
          tag: activeTags.length > 0 ? activeTags : undefined,
          sort: sortBy,
          page,
          pageSize: PAGE_SIZE,
        })
        const safeTotalPages = Math.max(1, data.totalPages)
        setTotal(data.total)
        setTotalPages(safeTotalPages)
        if (page > safeTotalPages) {
          setPage(safeTotalPages)
          return
        }
        setWorks(data.items.map(transformWork))
      } catch (err: any) {
        setError(err.message || '加载作品失败')
        setWorks([])
        setTotal(0)
        setTotalPages(1)
      } finally {
        setLoading(false)
      }
    }
    fetchWorks()
  }, [debouncedSearch, activeType, activeDomain, activeTags, sortBy, page])

  // 拉取推荐作品（仅首屏、无筛选条件时展示）
  const showRecommended = activeType === 'all' && !debouncedSearch && activeTags.length === 0 && sortBy === 'latest' && page === 1
  useEffect(() => {
    if (!showRecommended) {
      setRecommended([])
      return
    }
    getRecommendedWorks()
      .then((data) => setRecommended(data.map(transformWork)))
      .catch(() => { /* 推荐加载失败不影响主流程 */ })
  }, [showRecommended])

  // 详情页互动会更新全局作品；同步大厅局部列表，返回时立即保持状态和计数。
  useEffect(() => {
    const syncInteraction = (work: Work): Work => {
      const shared = sharedWorks.find((item) => item.id === work.id)
      return shared
        ? { ...work, likes: shared.likes, favorites: shared.favorites, likedByMe: shared.likedByMe, favoritedByMe: shared.favoritedByMe }
        : work
    }
    setWorks((current) => current.map(syncInteraction))
    setRecommended((current) => current.map(syncInteraction))
  }, [sharedWorks])

  // v1.3：切换作品类型不清空业务领域和标签
  const handleTypeChange = (type: WorkType | 'all') => {
    setActiveType(type)
    setPage(1)
  }

  const handleDomainToggle = (domain: string) => {
    setActiveDomain((prev) => (prev === domain ? 'all' : domain))
    setPage(1)
  }

  const handleTagToggle = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
    setPage(1)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 推荐位 */}
      {recommended.length > 0 && (
        <section className="rounded-xl border p-5" style={{ borderColor: 'var(--aic-border-solid)', background: 'linear-gradient(135deg, var(--aic-primary-light), var(--aic-violet-light))' }}>
          <div className="flex items-center gap-2 mb-4">
            <Star size={18} style={{ color: 'var(--state-warning)' }} />
            <h2 className="text-base font-bold">运营推荐</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((w) => (
              <Link
                key={w.id}
                to={`/works/${w.id}`}
                state={{ trackView: true }}
                className="flex items-center gap-3 rounded-lg bg-white/70 p-3 backdrop-blur transition hover:bg-white"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white flex-shrink-0 ${WORK_TYPES.find((t) => t.type === w.type)?.label.charAt(0) ? '' : ''}`}
                  style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}>
                  {w.title.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{w.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{w.authorName} · {w.department}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 搜索栏 */}
      <section className="rounded-xl border bg-card p-4 sm:p-6 shadow-sm" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value.slice(0, 50)) }}
                maxLength={50}
                placeholder="搜索作品名称、作者、作品简介..."
                className="h-10 w-full rounded-md border pl-9 pr-12 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-background)' }}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{search.length}/50</span>
            </div>
            <button
              onClick={() => setDebouncedSearch(search.trim())}
              className="h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
            >
              搜索
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-10 rounded-md border px-3 text-sm outline-none cursor-pointer"
              style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-background)' }}
            >
              <option value="latest">最新发布</option>
              <option value="likes">最多点赞</option>
              <option value="favorites">最多收藏</option>
              <option value="downloads">最多下载</option>
            </select>
            {canCreateWork && (
              <Link
                to="/publish"
                className="inline-flex h-10 items-center gap-1 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
              >
                <Plus size={16} /> 发布作品
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 作品类型筛选 */}
      <section className="flex flex-wrap gap-2 border-b pb-4" style={{ borderColor: 'var(--aic-border-solid)' }}>
        {([{ type: 'all', label: '全部' } as const, ...WORK_TYPES] as const).map((item) => {
          const isActive = activeType === item.type
          return (
            <button
              key={item.type}
              onClick={() => handleTypeChange(item.type)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                isActive ? 'text-white' : 'border text-muted-foreground hover:text-foreground'
              }`}
              style={
                isActive
                  ? { background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }
                  : { borderColor: 'var(--aic-border-solid)' }
              }
            >
              {item.label}
            </button>
          )
        })}
      </section>

      {/* 业务领域筛选 */}
      <section className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">业务领域：</span>
        {domains.map((domain) => {
          const isActive = activeDomain === domain
          return (
            <button
              key={domain}
              onClick={() => handleDomainToggle(domain)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                isActive ? 'text-white border-transparent' : 'text-muted-foreground hover:text-primary'
              }`}
              style={
                isActive
                  ? { background: 'var(--aic-primary)', borderColor: 'transparent' }
                  : { borderColor: 'var(--aic-border-solid)' }
              }
            >
              {domain}
            </button>
          )
        })}
      </section>

      {/* 标签筛选 */}
      <section className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">标签：</span>
        {tags.map((tag) => {
          const isActive = activeTags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => handleTagToggle(tag)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                isActive ? 'text-white border-transparent' : 'text-muted-foreground hover:text-primary'
              }`}
              style={
                isActive
                  ? { background: 'var(--aic-gradient-violet)', borderColor: 'transparent' }
                  : { borderColor: 'var(--aic-border-solid)' }
              }
            >
              {tag}
            </button>
          )
        })}
        {activeTags.length > 0 && (
          <button
            onClick={() => { setActiveTags([]); setPage(1) }}
            className="text-xs text-muted-foreground underline hover:text-primary"
          >
            清除
          </button>
        )}
      </section>

      {/* 结果统计 */}
      <div className="text-xs text-muted-foreground">
        {loading ? '加载中...' : `共 ${total} 个作品`}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}>
          {error}
        </div>
      )}

      {/* 作品网格 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 size={32} className="animate-spin mb-3" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : works.length > 0 ? (
        <section className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => (
            <WorkCard key={work.id} work={work} trackView />
          ))}
        </section>
      ) : !error ? (
        <EmptyState />
      ) : null}

      {/* 分页 */}
      {totalPages > 1 && <Pagination current={page} total={totalPages} onChange={setPage} />}
    </div>
  )
}
