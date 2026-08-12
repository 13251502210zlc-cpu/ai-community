import { useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ImagePlus, FileUp, X, Save, Send, History, Lock, Loader2, Download } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { WORK_TYPES } from '../types'
import { WorkStatusBadge, VersionStatusBadge } from '../components/Tags'
import type { WorkType, Work, WorkVersion, VersionStatus } from '../types'
import { TYPE_SPEC_CONFIG } from '../types'
import { uploadCover, uploadAttachment, deleteAttachment, assetUrl, createVersionApi, downloadAttachmentFile } from '../lib/api'

// v1.3：计算下一个版本号（v1/v2/v3 递增格式）
function nextVersion(versions: WorkVersion[]): string {
  if (!versions.length) return 'v1'
  const nums = versions.map((v) => {
    const m = v.version.match(/v(\d+)/)
    return m ? +m[1] : 0
  })
  const max = nums.reduce((acc, n) => (n > acc ? n : acc), 0)
  return `v${max + 1}`
}

// v1.1：找到可编辑版本（草稿或已驳回）
function findEditableVersion(work?: Work): WorkVersion | undefined {
  if (!work) return undefined
  return work.versions.find((v) => v.status === 'draft' || v.status === 'rejected')
}

export default function Publish() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const { works, addWork, updateWork, submitVersionForReview, addToast, canCreateNewVersion, domains: appDomains, tags: appTags, currentUser } = useApp()

  const editingWork = editId ? works.find((w) => w.id === editId) : undefined
  // v1.3：单候选版本限制——编辑已存在作品时校验是否允许创建新版本
  const newVersionCheck = editingWork ? canCreateNewVersion(editingWork) : { allowed: true }
  const isLocked = editingWork ? !newVersionCheck.allowed && !editingWork.versions.some((v) => v.status === 'draft' || v.status === 'rejected') : false

  const [type, setType] = useState<WorkType>(editingWork?.type || 'skill')
  const [title, setTitle] = useState(editingWork?.title || '')
  const [category, setCategory] = useState(editingWork?.category || '财务')
  const [tags, setTags] = useState<string[]>(editingWork?.tags || [])
  const [intro, setIntro] = useState(editingWork?.intro || '')
  const [usage, setUsage] = useState(editingWork?.usage || '')
  const [businessValue, setBusinessValue] = useState(editingWork?.businessValue || '')
  const [scene, setScene] = useState(editingWork?.scene || '')
  const [coreAbilities, setCoreAbilities] = useState(editingWork?.coreAbilities?.join('；') || '')
  // v1.3：封面和附件支持真实文件上传
  const [coverFile, setCoverFile] = useState<{ url: string; name: string; size: string } | null>(
    editingWork?.coverUrl ? { url: editingWork.coverUrl, name: '已上传封面', size: '' } : null
  )
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string; url?: string; storedName?: string }[]>(
    editingWork?.attachments.map((a) => ({ id: a.id, name: a.name, size: a.size, url: a.url, storedName: a.storedName })) || []
  )
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  // v2.0：附件删除中状态（按 storedName 跟踪，避免并发删除时 UI 闪烁）
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null)
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [customTag, setCustomTag] = useState('')
  const [changelog, setChangelog] = useState('')

  // v2.0：移除附件——调用后端 DELETE 接口清理磁盘文件，再更新表单 state
  // 仅清理"本次新上传"的附件（有 storedName）；编辑已有作品时旧附件无 storedName，仅从表单移除
  const handleRemoveAttachment = async (index: number) => {
    const att = attachments[index]
    if (!att) return
    // 有 storedName 表示是新上传的文件，需调用后端删除磁盘文件
    if (att.storedName) {
      setDeletingAttachment(att.storedName)
      try {
        await deleteAttachment(att.storedName)
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : '附件删除失败，请重试')
        setDeletingAttachment(null)
        return
      }
      setDeletingAttachment(null)
    }
    setAttachments(attachments.filter((_, idx) => idx !== index))
    addToast('success', `附件 ${att.name} 已移除`)
  }

  // 编辑已有作品时，通过鉴权下载接口获取附件，普通直链无法携带 JWT。
  const handleDownloadAttachment = async (index: number) => {
    const att = attachments[index]
    if (!att?.url || downloadingAttachment) return
    const key = att.storedName || att.id || String(index)
    setDownloadingAttachment(key)
    try {
      await downloadAttachmentFile(att.url, att.name)
      addToast('success', `正在下载：${att.name}`)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '附件下载失败，请重试')
    } finally {
      setDownloadingAttachment(null)
    }
  }

  // v1.1：当前可编辑版本
  const editableVersion = useMemo(() => findEditableVersion(editingWork), [editingWork])
  // v1.1：是否需要创建新版本（编辑已发布/已下架且无草稿/驳回版本时）
  const isNewVersion = !!editingWork && !editableVersion
  // v1.3：当前操作版本号（用于显示提示，v1/v2/v3 格式）
  const operatingVersion = editingWork
    ? editableVersion?.version || nextVersion(editingWork.versions)
    : 'v1'
  // v1.3：附件要求（按当前作品类型）
  const attachmentRequired = TYPE_SPEC_CONFIG[type].attachmentRequired
  // v1.3：更新说明是否必填（编辑模式且非 v1 版本时必填，≥ 10 字符）
  const isChangelogRequired = !!editingWork && operatingVersion !== 'v1'

  const handleAddTag = (tag: string) => {
    if (tag.trim() && !tags.includes(tag.trim()) && tags.length < 5) {
      setTags([...tags, tag.trim()])
    }
    setCustomTag('')
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const validate = (): string | null => {
    if (!title.trim() || title.trim().length < 2) return '作品名称至少 2 个字符'
    if (title.trim().length > 50) return '作品名称不超过 50 个字符'
    if (tags.length === 0) return '请至少添加 1 个标签'
    if (!intro.trim() || intro.trim().length < 10) return '作品简介至少 10 个字符'
    if (intro.trim().length > 100) return '作品简介不超过 100 个字符'
    if (!usage.trim() || usage.trim().length < 20) return '使用说明至少 20 个字符'
    return null
  }

  // v1.1：构建作品基础信息（不含版本）
  const buildWorkBase = () => ({
    title: title.trim(),
    type,
    category,
    tags,
    intro: intro.trim(),
    usage: usage.trim(),
    businessValue: businessValue.trim(),
    scene: scene.trim(),
    coreAbilities: coreAbilities ? coreAbilities.split(/[#；;。\n]/).map((s) => s.trim()).filter(Boolean) : [],
    coverUrl: coverFile?.url || undefined,
    attachments: attachments.map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      url: a.url,
      // 后端用 storedName 校验附件是否由当前用户上传。这里不能丢弃，
      // 否则 POST /api/works 会因附件归属信息缺失返回 400。
      storedName: a.storedName,
      downloads: 0,
    })),
  })

  // v1.1：新建作品（首版本）
  const buildNewWork = (versionStatus: VersionStatus): Work => {
    const now = new Date().toISOString().slice(0, 10)
    const nowFull = new Date().toISOString().slice(0, 16).replace('T', ' ')
    return {
      id: `w${Date.now()}`,
      ...buildWorkBase(),
      authorId: currentUser.id,
      authorName: currentUser.name,
      department: currentUser.department,
      status: 'unpublished', // v1.1：作品状态默认未发布
      versions: [{
        version: 'v1',
        changelog: changelog.trim() || '初始版本',
        date: now,
        status: versionStatus,
        changelogAuthor: currentUser.name,
        submittedAt: versionStatus === 'pending' ? nowFull : undefined,
      }],
      comments: [],
      likes: 0,
      favorites: 0,
      downloads: 0,
      views: 0,
      likedByMe: false,
      favoritedByMe: false,
      createdAt: now,
      recommended: false,
    }
  }

  // v1.1：构建新版本对象（编辑已发布/已下架作品时；v1.3：记录 baseVersionId）
  const buildNewVersion = (): WorkVersion => {
    const now = new Date().toISOString().slice(0, 10)
    return {
      version: operatingVersion,
      changelog: changelog.trim() || '版本更新',
      date: now,
      status: 'draft',
      changelogAuthor: currentUser.name,
      // v1.3：记录创建时的线上版本号，用于审核通过时并发校验
      baseVersionId: editingWork?.currentVersion,
    }
  }

  // v1.1：保存草稿
  const handleSaveDraft = async () => {
    if (!title.trim()) {
      addToast('error', '请至少填写作品名称')
      return
    }
    if (editingWork) {
      // 编辑模式
      const base = buildWorkBase()
      if (editableVersion) {
        // 更新现有草稿/驳回版本（保持版本号、状态、其他元数据）
        const ok = await updateWork(editingWork.id, {
          ...base,
          versions: editingWork.versions.map((v) =>
            v.version === editableVersion.version
              ? { ...v, changelog: changelog.trim() || v.changelog, status: 'draft' as VersionStatus }
              : v
          ),
        })
        if (!ok) {
          addToast('error', '草稿保存失败')
          return
        }
      } else {
        // 新增草稿版本
        const createdVersion = await createVersionApi(editingWork.id, changelog.trim())
        const ok = await updateWork(editingWork.id, {
          ...base,
          versions: [{ ...buildNewVersion(), version: createdVersion.version }, ...editingWork.versions],
        })
        if (!ok) {
          addToast('error', '草稿保存失败')
          return
        }
      }
      addToast('success', `草稿已保存（${operatingVersion}），可在个人中心继续编辑`)
    } else {
      // 新建作品
      const newWork = await addWork(buildNewWork('draft'))
      if (!newWork) {
        // addWork 已展示后端返回的具体失败原因
        return
      }
      addToast('success', '草稿已保存，可在个人中心继续编辑')
    }
    navigate('/profile')
  }

  // v1.1：提交审核
  const handleSubmit = async () => {
    const error = validate()
    if (error) {
      addToast('error', error)
      return
    }
    // v1.3：附件必填校验（Skill / 工作流）
    if (attachmentRequired === 'required' && attachments.length === 0) {
      addToast('error', '该类型作品必须上传附件')
      return
    }
    // v1.3：更新说明条件必填校验（编辑模式且非 v1 版本，≥ 10 字符）
    if (isChangelogRequired) {
      if (!changelog.trim()) {
        addToast('error', '请填写版本更新说明')
        return
      }
      if (changelog.trim().length < 10) {
        addToast('error', '更新说明至少 10 个字符')
        return
      }
    }
    if (editingWork) {
      // 编辑模式
      const base = buildWorkBase()
      const workId = editingWork.id
      let targetVersion = editableVersion?.version || operatingVersion
      if (editableVersion) {
        // 提交现有草稿/驳回版本
        const newStatus: VersionStatus = 'draft'
        const ok = await updateWork(editingWork.id, {
          ...base,
          versions: editingWork.versions.map((v) =>
            v.version === editableVersion.version
              ? { ...v, changelog: changelog.trim() || v.changelog, status: newStatus, rejectReason: undefined }
              : v
          ),
        })
        if (!ok) {
          addToast('error', '提交审核失败')
          return
        }
      } else {
        // 新增草稿版本，再提交审核
        const createdVersion = await createVersionApi(editingWork.id, changelog.trim())
        targetVersion = createdVersion.version
        const ok = await updateWork(editingWork.id, {
          ...base,
          versions: [{ ...buildNewVersion(), version: createdVersion.version }, ...editingWork.versions],
        })
        if (!ok) {
          addToast('error', '提交审核失败')
          return
        }
      }
      // 调用版本级提交审核
      const submitted = await submitVersionForReview(workId, targetVersion)
      if (!submitted) {
        addToast('error', '提交审核失败')
        return
      }
      addToast('success', `版本 ${operatingVersion} 已提交审核，请等待管理员审核`)
    } else {
      // 新建作品直接提交审核
      const newWork = buildNewWork('pending')
      const created = await addWork(newWork)
      if (!created) {
        // addWork 已展示后端返回的具体失败原因
        return
      }
      const submitted = await submitVersionForReview(created.id, created.versions[0].version)
      if (!submitted) {
        addToast('error', '作品已保存为草稿，但提交审核失败，请在个人中心重试')
        return
      }
      addToast('success', `版本 ${operatingVersion} 已提交审核，请等待管理员审核`)
    }
    navigate('/profile')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold mb-1">
          {editingWork ? (isNewVersion ? '发布新版本' : '编辑作品') : '发布作品'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {editingWork
            ? `修改作品信息并提交新版本审核（${operatingVersion}）`
            : '将自己的 AI 作品分享给同事，支持 Skill、应用程序、智能体等类型'}
        </p>
      </div>

      {/* v1.3：单候选版本限制提示（已有活动候选版本时禁止创建新版本） */}
      {isLocked && (
        <div
          className="flex items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--state-warning)', backgroundColor: 'var(--state-warning-bg)' }}
        >
          <Lock size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--state-warning)' }} />
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--state-warning)' }}>无法创建新版本</div>
            <p className="text-xs mt-1 text-muted-foreground">{newVersionCheck.reason}</p>
            <p className="text-xs mt-2">
              请前往
              <button onClick={() => navigate('/profile')} className="mx-1 underline" style={{ color: 'var(--aic-primary)' }}>个人中心</button>
              撤回或删除已有候选版本，或等待审核完成后再编辑。
            </p>
          </div>
        </div>
      )}

      {/* v1.1：编辑模式状态提示 */}
      {editingWork && (
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--aic-border-solid)', backgroundColor: 'var(--aic-surface-elevated)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">作品状态：</span>
            <WorkStatusBadge status={editingWork.status} />
            <span className="text-xs text-muted-foreground ml-2">当前编辑版本：</span>
            <VersionStatusBadge
              status={editableVersion?.status || 'draft'}
              version={operatingVersion}
              onlineVersion={editingWork.currentVersion && operatingVersion !== editingWork.currentVersion ? editingWork.currentVersion : undefined}
            />
          </div>
          <div className="text-xs text-muted-foreground flex items-start gap-1">
            <History size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              {editingWork.status === 'published'
                ? `已发布作品：新版本 ${operatingVersion} 审核通过后将替换线上版本 ${editingWork.currentVersion}，期间线上版本继续可见。`
                : editableVersion?.status === 'rejected'
                  ? `已驳回版本：修改后重新提交审核，作品状态保持未发布。`
                  : `未发布作品：审核通过后将首次发布至作品大厅。`}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-6" style={{ borderColor: 'var(--aic-border-solid)' }}>
        {/* 步骤 1：选择作品类型 */}
        <div>
          <label className="block text-sm font-semibold mb-3">
            步骤 1：选择作品类型 <span style={{ color: 'var(--state-danger)' }}>*</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {WORK_TYPES.map((item) => {
              const isSelected = type === item.type
              return (
                <button
                  key={item.type}
                  onClick={() => setType(item.type)}
                  className={`rounded-lg border-2 p-4 text-center transition ${
                    isSelected ? 'bg-primary/5' : 'hover:border-primary/50'
                  }`}
                  style={{
                    borderColor: isSelected ? 'var(--aic-primary)' : 'var(--aic-border-solid)',
                    backgroundColor: isSelected ? 'var(--aic-primary-light)' : 'transparent',
                  }}
                >
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <div className="text-sm font-medium">{item.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="h-px" style={{ background: 'var(--aic-border-solid)' }} />

        {/* 步骤 2：填写作品信息 */}
        <div>
          <label className="block text-sm font-semibold mb-3">步骤 2：填写作品信息</label>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">
                作品名称 <span style={{ color: 'var(--state-danger)' }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="请输入作品名称（2-50字）"
                maxLength={50}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--aic-border-solid)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">
                所属业务领域 <span style={{ color: 'var(--state-danger)' }}>*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm outline-none cursor-pointer"
                style={{ borderColor: 'var(--aic-border-solid)' }}
              >
                {appDomains.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">
              标签 <span style={{ color: 'var(--state-danger)' }}>*</span>
              <span className="font-normal text-muted-foreground">（最多 5 个）</span>
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white cursor-pointer"
                  style={{ background: 'var(--aic-gradient-violet)' }}
                  onClick={() => handleRemoveTag(tag)}
                >
                  {tag} <X size={12} />
                </span>
              ))}
              {tags.length < 5 && (
                <>
                  {appTags.filter((t) => !tags.includes(t)).slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleAddTag(tag)}
                      className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:border-primary transition"
                      style={{ borderColor: 'var(--aic-border-solid)' }}
                    >
                      + {tag}
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag(customTag))}
                      placeholder="自定义标签"
                      className="h-7 w-24 rounded border px-2 text-xs outline-none"
                      style={{ borderColor: 'var(--aic-border-solid)' }}
                    />
                    <button
                      onClick={() => handleAddTag(customTag)}
                      className="text-xs text-primary hover:underline"
                    >
                      添加
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">
              作品简介 <span style={{ color: 'var(--state-danger)' }}>*</span>
              <span className="font-normal text-muted-foreground">（10-100 字）</span>
            </label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="一句话描述作品的核心能力"
              maxLength={100}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
            <div className="text-right text-xs text-muted-foreground mt-1">{intro.length}/100</div>
          </div>
        </div>

        <div className="h-px" style={{ background: 'var(--aic-border-solid)' }} />

        {/* 步骤 3：上传封面与附件 */}
        <div>
          <label className="block text-sm font-semibold mb-3">步骤 3：上传封面与附件</label>
          <div className="grid sm:grid-cols-[200px_1fr] gap-4">
            {/* 封面上传 */}
            <div>
              <label className="block text-xs font-semibold mb-1.5">封面图（可选）</label>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setUploadingCover(true)
                  try {
                    const result = await uploadCover(file)
                    setCoverFile(result)
                    addToast('success', `封面 ${result.name} 上传成功`)
                  } catch (err) {
                    addToast('error', err instanceof Error ? err.message : '封面上传失败')
                  } finally {
                    setUploadingCover(false)
                    if (coverInputRef.current) coverInputRef.current.value = ''
                  }
                }}
              />
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="relative flex h-[120px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                style={{ borderColor: 'var(--aic-border-solid)' }}
              >
                {uploadingCover ? (
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                ) : coverFile ? (
                  <div className="relative w-full h-full rounded-lg overflow-hidden">
                    <img src={assetUrl(coverFile.url)} alt="封面预览" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCoverFile(null)
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <ImagePlus size={24} className="text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">点击上传封面</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">jpg/png/webp · ≤5MB</span>
                  </>
                )}
              </button>
            </div>

            {/* 附件上传 */}
            <div>
              <label className="block text-xs font-semibold mb-1.5">
                附件 / 下载文件
                {attachmentRequired === 'required' && <span style={{ color: 'var(--state-danger)' }}> *</span>}
                {attachmentRequired === 'optional' && <span className="font-normal text-muted-foreground">（可选）</span>}
                {attachmentRequired === 'none' && <span className="font-normal text-muted-foreground">（不需要）</span>}
              </label>
              {attachmentRequired === 'none' ? (
                <div
                  className="flex w-full items-center justify-center rounded-lg border-2 border-dashed p-4 text-xs text-muted-foreground"
                  style={{ borderColor: 'var(--aic-border-solid)' }}
                >
                  该类型作品（提示词）无需上传附件，正文内容在详情页展示
                </div>
              ) : (
                <>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setUploadingAttachment(true)
                      try {
                        const result = await uploadAttachment(file)
                        setAttachments((prev) => [...prev, result])
                        addToast('success', `附件 ${result.name} 上传成功`)
                      } catch (err) {
                        addToast('error', err instanceof Error ? err.message : '附件上传失败')
                      } finally {
                        setUploadingAttachment(false)
                        if (attachmentInputRef.current) attachmentInputRef.current.value = ''
                      }
                    }}
                  />
                  <button
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={uploadingAttachment}
                    className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                    style={{ borderColor: 'var(--aic-border-solid)' }}
                  >
                    {uploadingAttachment ? (
                      <>
                        <Loader2 size={24} className="animate-spin text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">上传中...</span>
                      </>
                    ) : (
                      <>
                        <FileUp size={24} className="text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">点击选择文件上传</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">支持 .zip / .json / .md / .skill 等 · ≤50MB</span>
                      </>
                    )}
                  </button>
                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {attachments.map((a, i) => {
                        const isDeleting = !!a.storedName && deletingAttachment === a.storedName
                        const downloadKey = a.storedName || a.id || String(i)
                        const isDownloading = downloadingAttachment === downloadKey
                        return (
                          <div key={a.id || i} className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs" style={{ backgroundColor: 'var(--state-success-bg)', color: 'var(--state-success)' }}>
                            <span className="truncate flex-1">{a.name} · {a.size}</span>
                            <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                              {a.url && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttachment(i)}
                                  disabled={downloadingAttachment !== null}
                                  className="hover:opacity-70 disabled:opacity-50"
                                  title={isDownloading ? '下载中...' : '下载附件'}
                                >
                                  {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(i)}
                                disabled={isDeleting}
                                className="hover:opacity-70 disabled:opacity-50"
                                title={isDeleting ? '删除中...' : '移除附件'}
                              >
                                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="h-px" style={{ background: 'var(--aic-border-solid)' }} />

        {/* 步骤 4：补充说明 */}
        <div>
          <label className="block text-sm font-semibold mb-3">步骤 4：补充使用说明与业务价值</label>
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              使用说明 <span style={{ color: 'var(--state-danger)' }}>*</span>
              <span className="font-normal text-muted-foreground">（≥ 20 字）</span>
            </label>
            <textarea
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
              placeholder="详细描述如何使用该作品，包括前置条件、操作步骤、注意事项"
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">业务价值（可选）</label>
            <textarea
              value={businessValue}
              onChange={(e) => setBusinessValue(e.target.value)}
              placeholder="描述该作品解决了什么业务问题，带来了哪些效率提升或成本节约"
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">应用场景（可选）</label>
            <input
              type="text"
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="例如：财务部门月度报表生成、多部门数据汇总分析"
              className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">核心能力（可选，用分号分隔）</label>
            <input
              type="text"
              value={coreAbilities}
              onChange={(e) => setCoreAbilities(e.target.value)}
              placeholder="例如：自动解析数据源；支持自定义模板；定时任务调度"
              className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
          </div>
        </div>

        <div className="h-px" style={{ background: 'var(--aic-border-solid)' }} />

        {/* v1.3：步骤 5：版本说明 */}
        <div>
          <label className="block text-sm font-semibold mb-3">
            步骤 5：版本说明
            {isChangelogRequired
              ? <span style={{ color: 'var(--state-danger)' }}> *</span>
              : <span className="font-normal text-muted-foreground">（可选）</span>}
          </label>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: 'var(--aic-primary-light)', color: 'var(--aic-primary)' }}>
              {operatingVersion}
            </span>
            <span className="text-xs text-muted-foreground">
              {editingWork ? '本次提交的版本号（由系统自动生成）' : '首版本（由系统自动生成）'}
            </span>
          </div>
          <textarea
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder={isChangelogRequired
              ? '请描述本次版本的主要更新内容（至少 10 字符），便于审核员快速了解变更'
              : editingWork
                ? '描述本次版本的主要更新内容，便于审核员快速了解变更'
                : '初始版本说明，例如：首个版本，包含核心功能'}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleSaveDraft}
            disabled={isLocked}
            className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <Save size={16} /> 保存草稿
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLocked}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            <Send size={16} /> 提交审核
          </button>
        </div>
      </div>
    </div>
  )
}
