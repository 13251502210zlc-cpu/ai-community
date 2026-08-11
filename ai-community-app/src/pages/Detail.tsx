import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ThumbsUp, Star, Download, Share2, FileText, ArrowLeft, Send,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { TYPE_CONFIG, TYPE_SPEC_CONFIG } from '../types'
import { TypeTag, BizTag, Avatar } from '../components/Tags'
import { assetUrl, downloadAttachmentFile } from '../lib/api'

const TABS = [
  { id: 'intro', label: '作品介绍' },
  { id: 'scene', label: '业务场景' },
  { id: 'tutorial', label: '使用教程' },
  { id: 'version', label: '版本信息' },
  { id: 'files', label: '附件' },
] as const

export default function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { works, currentUser, toggleLike, toggleFavorite, incrementDownload, incrementView, addComment, addToast } = useApp()
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('intro')
  const [comment, setComment] = useState('')
  const [viewCounted, setViewCounted] = useState(false)

  const work = works.find((w) => w.id === id)

  useEffect(() => {
    if (work && !viewCounted) {
      incrementView(work.id)
      setViewCounted(true)
    }
  }, [work, viewCounted, incrementView])

  if (!work) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">作品不存在或已被删除</p>
        <Link to="/" className="text-primary hover:underline">返回作品大厅</Link>
      </div>
    )
  }

  const cfg = TYPE_CONFIG[work.type]
  const isAuthor = work.authorId === currentUser.id

  const handleLike = async () => {
    await toggleLike(work.id)
    addToast('success', work.likedByMe ? '已取消点赞' : '点赞成功')
  }

  const handleFav = async () => {
    await toggleFavorite(work.id)
    addToast('success', work.favoritedByMe ? '已取消收藏' : '已加入收藏')
  }

  const handleDownload = async () => {
    await incrementDownload(work.id)
    addToast('success', '开始下载附件')
  }

  // 主操作：根据作品类型执行实际动作
  const handlePrimaryAction = async () => {
    const action = TYPE_SPEC_CONFIG[work.type].primaryAction.label
    const firstAttachment = work.attachments[0]

    // 有附件 URL → 真正触发文件下载
    if (firstAttachment?.url) {
      await downloadAttachmentFile(firstAttachment.url, firstAttachment.name)
      await incrementDownload(work.id)
      addToast('success', `正在下载：${firstAttachment.name}`)
      return
    }

    // 提示词类型 → 复制作品介绍到剪贴板
    if (work.type === 'prompt') {
      const text = work.intro
      navigator.clipboard?.writeText(text).then(
        () => addToast('success', 'Prompt 内容已复制到剪贴板'),
        () => addToast('error', '复制失败，请手动复制'),
      )
      return
    }

    // 应用类型 → 提示需要配置访问地址
    if (work.type === 'app') {
      addToast('info', '该应用需在对应平台打开，请联系作者获取访问地址')
      return
    }

    // 其他类型（agent / skill / workflow / case）有附件但无 URL
    if (firstAttachment) {
      addToast('info', `附件「${firstAttachment.name}」尚未上传文件，请联系作者`)
      return
    }

    // 无附件
    addToast('info', `${action}：该作品暂无可下载的资源`)
  }

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => {})
    addToast('success', '分享链接已复制')
  }

  const handleComment = async () => {
    if (!comment.trim() || comment.trim().length < 5) {
      addToast('error', '评论内容至少 5 个字符')
      return
    }
    const ok = await addComment(work.id, comment.trim())
    if (!ok) {
      addToast('error', '评价发表失败')
      return
    }
    setComment('')
    addToast('success', '评价已发表')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      {/* 返回 */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft size={16} /> 返回
      </button>

      {/* 作品头部 */}
      <div className="flex gap-4 sm:gap-6">
        {work.coverUrl ? (
          <img
            src={assetUrl(work.coverUrl)}
            alt={work.title}
            className="h-[100px] w-[100px] flex-shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            className={`flex h-[100px] w-[100px] flex-shrink-0 items-center justify-center rounded-xl text-4xl font-bold text-white ${cfg.coverClass}`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {cfg.label.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <TypeTag type={work.type} />
            <BizTag variant="purple">{work.category}</BizTag>
            {work.tags.map((t) => (
              <BizTag key={t} variant="purple">{t}</BizTag>
            ))}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold mb-2">{work.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Avatar name={work.authorName} color={cfg.color === 'var(--state-warning)' ? '#f59e0b' : 'var(--aic-primary)'} size={28} />
              <span>{work.authorName} · {work.department}</span>
            </div>
            <span className="text-xs text-muted-foreground">发布于 {work.publishedAt || work.createdAt}</span>
          </div>
        </div>
      </div>

      {/* 统计 + 操作栏 */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg p-4"
        style={{ backgroundColor: 'var(--aic-surface-elevated)' }}
      >
        <div className="flex items-center gap-5">
          <div className="text-sm">
            <span className="font-bold text-base">{work.likes}</span>{' '}
            <span className="text-muted-foreground">点赞</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-base">{work.favorites}</span>{' '}
            <span className="text-muted-foreground">收藏</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-base">{work.downloads}</span>{' '}
            <span className="text-muted-foreground">下载</span>
          </div>
          <div className="text-sm">
            <span className="font-bold text-base">{work.views}</span>{' '}
            <span className="text-muted-foreground">浏览</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleLike}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition ${
              work.likedByMe ? 'text-white border-transparent' : 'hover:border-primary hover:text-primary'
            }`}
            style={
              work.likedByMe
                ? { background: 'var(--aic-primary)', borderColor: 'transparent' }
                : { borderColor: 'var(--aic-border-solid)' }
            }
          >
            <ThumbsUp size={15} /> {work.likedByMe ? '已点赞' : '点赞'}
          </button>
          <button
            onClick={handleFav}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition ${
              work.favoritedByMe ? 'text-white border-transparent' : 'hover:border-primary hover:text-primary'
            }`}
            style={
              work.favoritedByMe
                ? { background: 'var(--aic-gradient-violet)', borderColor: 'transparent' }
                : { borderColor: 'var(--aic-border-solid)' }
            }
          >
            <Star size={15} /> {work.favoritedByMe ? '已收藏' : '收藏'}
          </button>
          <button
            onClick={handlePrimaryAction}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            <Download size={15} /> {TYPE_SPEC_CONFIG[work.type].primaryAction.label}
          </button>
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <Share2 size={15} /> 分享
          </button>
          {isAuthor && (
            <Link
              to={`/publish?edit=${work.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            >
              编辑
            </Link>
          )}
        </div>
      </div>

      {/* Tab 内容 */}
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

      {/* Tab 内容区 */}
      <div className="min-h-[200px] animate-fade-in">
        {activeTab === 'intro' && (
          <div className="space-y-3 text-sm">
            <p>{work.intro}</p>
            {work.coreAbilities && work.coreAbilities.length > 0 && (
              <>
                <p className="font-semibold mt-4">核心能力：</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {work.coreAbilities.map((ability, i) => (
                    <li key={i}>{ability}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {activeTab === 'scene' && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-1">适用场景：</p>
              <p className="text-muted-foreground">{work.scene || '暂未填写'}</p>
            </div>
            <div>
              <p className="font-semibold mb-1">业务价值：</p>
              <p className="text-muted-foreground">{work.businessValue || '暂未填写'}</p>
            </div>
          </div>
        )}

        {activeTab === 'tutorial' && (
          <div className="space-y-3 text-sm">
            <ol className="list-decimal pl-5 space-y-2">
              {work.usage.split(/\d+\.\s*/).filter(Boolean).map((step, i) => (
                <li key={i} className="text-muted-foreground">{step.trim()}</li>
              ))}
            </ol>
            <div
              className="rounded-lg p-3 mt-4 border-l-4"
              style={{ backgroundColor: 'var(--aic-primary-light)', borderColor: 'var(--aic-primary)' }}
            >
              <span className="font-semibold">注意事项：</span>
              <span className="text-muted-foreground">首次使用需配置数据源权限，建议先在测试环境验证数据准确性。</span>
            </div>
          </div>
        )}

        {activeTab === 'version' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--aic-surface-elevated)' }}>
                  <th className="text-left p-3 font-semibold">版本</th>
                  <th className="text-left p-3 font-semibold">更新内容</th>
                  <th className="text-left p-3 font-semibold">发布日期</th>
                </tr>
              </thead>
              <tbody>
                {work.versions.map((v) => (
                  <tr key={v.version} className="border-b" style={{ borderColor: 'var(--aic-border-solid)' }}>
                    <td className="p-3">
                      <span
                        className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: v.current ? 'var(--state-success-bg)' : 'var(--aic-muted)',
                          color: v.current ? 'var(--state-success)' : 'var(--aic-muted-foreground)',
                        }}
                      >
                        {v.version}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{v.changelog}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{v.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-2">
            {work.attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between border-b py-3 last:border-0"
                style={{ borderColor: 'var(--aic-border-solid)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={20} className="text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{file.size} · 下载 {file.downloads} 次</div>
                  </div>
                </div>
                {file.url ? (
                  <a
                    href={assetUrl(file.url)}
                    download={file.name}
                    onClick={async () => { await incrementDownload(work.id) }}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
                    style={{ borderColor: 'var(--aic-border-solid)' }}
                  >
                    <Download size={12} /> 下载
                  </a>
                ) : (
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:text-primary"
                    style={{ borderColor: 'var(--aic-border-solid)' }}
                  >
                    <Download size={12} /> 下载
                  </button>
                )}
              </div>
            ))}
            {work.attachments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">暂无附件</p>
            )}
          </div>
        )}
      </div>

      {/* 评论区 */}
      <div className="border-t pt-5" style={{ borderColor: 'var(--aic-border-solid)' }}>
        <h2 className="text-base font-bold mb-4">用户评价 ({work.comments.length})</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            placeholder="写下你的评价..."
            className="flex-1 h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          />
          <button
            onClick={handleComment}
            className="inline-flex items-center gap-1 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            <Send size={15} /> 发表
          </button>
        </div>
        <div className="space-y-4">
          {work.comments.map((c) => (
            <div key={c.id} className="border-b pb-3 last:border-0" style={{ borderColor: 'var(--aic-border-solid)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Avatar name={c.userName} color={c.avatarColor} size={24} />
                <span className="text-sm font-semibold">{c.userName}</span>
                <span className="text-xs text-muted-foreground">· {c.department}</span>
                <span className="text-xs text-muted-foreground ml-auto">{c.date}</span>
              </div>
              <p className="text-sm text-muted-foreground pl-8">{c.content}</p>
            </div>
          ))}
          {work.comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">还没有评价，快来发表第一条吧～</p>
          )}
        </div>
      </div>
    </div>
  )
}
