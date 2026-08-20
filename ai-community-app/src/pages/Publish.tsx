import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ImagePlus, FileUp, X, Save, Send, History, Lock, Loader2, Download } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { WORK_TYPES } from '../types'
import { WorkStatusBadge, VersionStatusBadge } from '../components/Tags'
import type { WorkType, Work, WorkVersion, VersionStatus } from '../types'
import { TYPE_SPEC_CONFIG } from '../types'
import { uploadCover, uploadAttachment, deleteAttachment, assetUrl, createVersionApi, downloadAttachmentFile } from '../lib/api'
import { nowDate, nowDateTime } from '../lib/datetime'

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
  const { works, addWork, updateWork, submitVersionForReview, addToast, canCreateNewVersion, domains: appDomains, tags: appTags, currentUser, hasPermission, refreshWork } = useApp()

  const editingWork = editId ? works.find((w) => w.id === editId) : undefined
  const editableVersion = useMemo(() => findEditableVersion(editingWork), [editingWork])
  // v1.3：单候选版本限制——编辑已存在作品时校验是否允许创建新版本
  const newVersionCheck = editingWork ? canCreateNewVersion(editingWork) : { allowed: true }
  const isLocked = editingWork ? !newVersionCheck.allowed && !editingWork.versions.some((v) => v.status === 'draft' || v.status === 'rejected') : false
  const canCreateWork = hasPermission('work:create')
  const canSubmitWork = hasPermission('work:submit')
  const canEditOwnWork = hasPermission('work:editOwn')
  const canSaveDraft = editingWork
    ? canEditOwnWork && (!!editableVersion || canSubmitWork)
    : canCreateWork
  const canSubmitCurrent = editingWork
    ? canEditOwnWork && canSubmitWork
    : canCreateWork && canSubmitWork

  const [type, setType] = useState<WorkType>(editableVersion?.type ?? editingWork?.type ?? 'skill')
  const [title, setTitle] = useState(editableVersion?.title ?? editingWork?.title ?? '')
  const [category, setCategory] = useState(editableVersion?.category ?? editingWork?.category ?? '财务')
  const [tags, setTags] = useState<string[]>(editableVersion?.tags ?? editingWork?.tags ?? [])
  const [intro, setIntro] = useState(editableVersion?.intro ?? editingWork?.intro ?? '')
  const [usage, setUsage] = useState(editableVersion?.usage ?? editingWork?.usage ?? '')
  const [businessValue, setBusinessValue] = useState(editableVersion?.businessValue ?? editingWork?.businessValue ?? '')
  const [scene, setScene] = useState(editableVersion?.scene ?? editingWork?.scene ?? '')
  const [coreAbilities, setCoreAbilities] = useState((editableVersion?.coreAbilities ?? editingWork?.coreAbilities ?? []).join('；'))
  const initialCoverUrl = editableVersion ? editableVersion.coverUrl : editingWork?.coverUrl
  // v1.3：封面和附件支持真实文件上传
  const [coverFile, setCoverFile] = useState<{ url: string; name: string; size: string } | null>(
    initialCoverUrl ? { url: initialCoverUrl, name: '已上传封面', size: '' } : null
  )
  // v2.0：附件初始化逻辑
  // - 编辑现有草稿/驳回版本：加载该版本自己的附件
  // - 新建版本：继承当前线上版本的附件（后端 createVersion 也会复制这些附件到新草稿）
  //   用户可在编辑页删除不需要的附件，保存时后端按提交的列表重建
  const initialAttachments = useMemo(() => {
    if (!editingWork) return []
    const editable = findEditableVersion(editingWork)
    const source = editable || editingWork.versions.find((v) => v.current) || editingWork.versions[0]
    if (!source) return []
    return (source.attachments || []).map((a) => ({
      id: a.id, name: a.name, size: a.size, url: a.url, storedName: a.storedName
    }))
  }, [editingWork])
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string; url?: string; storedName?: string }[]>(initialAttachments)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  // v2.0：附件删除中状态（按 storedName 跟踪，避免并发删除时 UI 闪烁）
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null)
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  // 只记录本次打开编辑页后新上传、尚未关联到作品版本的附件。
  const pendingAttachmentNamesRef = useRef(new Set<string>())
  const [customTag, setCustomTag] = useState('')
  const [changelog, setChangelog] = useState(editableVersion?.changelog || '')
  const hydratedEditRef = useRef<string | null>(null)
  const requestedEditRef = useRef<string | null>(null)

  // 后台列表采用服务端分页且可能省略详情字段。进入编辑页时始终按 ID 补拉完整详情，
  // 不能仅凭列表中已存在作品就跳过，否则草稿版本的附件等详情字段可能为空。
  useEffect(() => {
    if (!editId || requestedEditRef.current === editId) return
    requestedEditRef.current = editId
    refreshWork(editId).then((work) => {
      if (!work) addToast('error', '作品不存在或无权查看')
    })
  }, [addToast, editId, refreshWork])

  // 全局作品数据可能在路由打开后才从接口返回；仅在首次拿到该草稿时，用版本快照完整回填表单。
  useEffect(() => {
    if (!editId || !editingWork) return
    // 列表缓存与完整详情可能具有相同版本号，但前者不一定包含版本附件。
    // 将附件指纹纳入 hydration key，保证完整详情到达后能再次回填附件。
    const attachmentFingerprint = (editableVersion?.attachments || [])
      .map((attachment) => attachment.storedName || attachment.id)
      .join(',')
    const hydrationKey = `${editId}:${editableVersion?.version || 'online'}:${attachmentFingerprint}`
    if (hydratedEditRef.current === hydrationKey) return
    const source = editableVersion
    setType(source?.type ?? editingWork.type)
    setTitle(source?.title ?? editingWork.title)
    setCategory(source?.category ?? editingWork.category)
    setTags(source?.tags ?? editingWork.tags)
    setIntro(source?.intro ?? editingWork.intro)
    setUsage(source?.usage ?? editingWork.usage)
    setBusinessValue(source?.businessValue ?? editingWork.businessValue ?? '')
    setScene(source?.scene ?? editingWork.scene ?? '')
    setCoreAbilities((source?.coreAbilities ?? editingWork.coreAbilities ?? []).join('；'))
    const coverUrl = source ? source.coverUrl : editingWork.coverUrl
    setCoverFile(coverUrl ? { url: coverUrl, name: '已上传封面', size: '' } : null)
    const attachmentSource = source || editingWork.versions.find((v) => v.current) || editingWork.versions[0]
    setAttachments((attachmentSource?.attachments || []).map((a) => ({
      id: a.id, name: a.name, size: a.size, url: a.url, storedName: a.storedName,
    })))
    setChangelog(source?.changelog || '')
    hydratedEditRef.current = hydrationKey
  }, [editId, editableVersion, editingWork])

  // v2.1：本次新上传的附件立即清理物理文件；已有版本附件仅从当前编辑表单移除，保存时由版本更新事务处理。
  const handleRemoveAttachment = async (index: number) => {
    const att = attachments[index]
    if (!att) return
    const isPendingUpload = !!att.storedName && pendingAttachmentNamesRef.current.has(att.storedName)
    if (isPendingUpload && att.storedName) {
      setDeletingAttachment(att.storedName)
      try {
        await deleteAttachment(att.storedName)
        pendingAttachmentNamesRef.current.delete(att.storedName)
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
  // v1.1：是否需要创建新版本（编辑已发布/已下架且无草稿/驳回版本时）
  const isNewVersion = !!editingWork && !editableVersion
  // v1.3：当前操作版本号（用于显示提示，v1/v2/v3 格式）
  const operatingVersion = editingWork
    ? editableVersion?.version || nextVersion(editingWork.versions)
    : 'v1'
  // v1.3：附件要求（按当前作品类型）
  const attachmentRequired = TYPE_SPEC_CONFIG[type].attachmentRequired
  // 更新说明前后端统一为至少 20 个字符
  const isChangelogRequired = !!editingWork && operatingVersion !== 'v1'

  const handleAddTag = (tag: string) => {
    const value = tag.trim()
    const blockedTerms = ['色情', '赌博', '博彩', '毒品', '反动', '恐怖主义', '枪支弹药', '代开发票', '买卖账号']
    const blocked = blockedTerms.find((term) => value.includes(term))
    const invalidPattern = /<\/?(?:script|iframe|object|embed)\b|https?:\/\/|www\.|(?:微信|vx|qq|电话|手机)\s*[:：]?\s*[a-z0-9_-]{5,}/i.test(value)
    if (blocked || invalidPattern) {
      addToast('error', blocked ? `标签包含敏感词“${blocked}”` : '标签不能包含网址、联系方式或危险代码')
      return
    }
    if (value.length > 30) {
      addToast('error', '单个标签不能超过 30 个字符')
      return
    }
    if (value && !tags.includes(value) && tags.length < 5) {
      setTags([...tags, value])
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
    if (usage.length > 2000) return '使用说明不超过 2000 个字符'
    if (businessValue.length > 500) return '业务价值不超过 500 个字符'
    if (scene.length > 200) return '应用场景不超过 200 个字符'
    if (coreAbilities.length > 500) return '核心能力合计不超过 500 个字符'
    const abilityItems = coreAbilities.split(/[#；;。\n]/).map((item) => item.trim()).filter(Boolean)
    if (abilityItems.length > 10) return '核心能力最多填写 10 项'
    if (abilityItems.some((item) => item.length > 100)) return '单项核心能力不超过 100 个字符'
    if (changelog.length > 500) return '版本说明不超过 500 个字符'
    return null
  }

  // 草稿允许必填项未填完，但已填内容不能超过后端字段上限。
  const validateFieldLengths = (): string | null => {
    if (title.trim().length > 50) return '作品名称不超过 50 个字符'
    if (tags.length > 5) return '最多选择 5 个标签'
    if (tags.some((tag) => tag.trim().length > 30)) return '单个标签不超过 30 个字符'
    if (intro.trim().length > 100) return '作品简介不超过 100 个字符'
    if (usage.length > 2000) return '使用说明不超过 2000 个字符'
    if (businessValue.length > 500) return '业务价值不超过 500 个字符'
    if (scene.length > 200) return '应用场景不超过 200 个字符'
    if (coreAbilities.length > 500) return '核心能力合计不超过 500 个字符'
    const abilityItems = coreAbilities.split(/[#；;。\n]/).map((item) => item.trim()).filter(Boolean)
    if (abilityItems.length > 10) return '核心能力最多填写 10 项'
    if (abilityItems.some((item) => item.length > 100)) return '单项核心能力不超过 100 个字符'
    if (changelog.length > 500) return '版本说明不超过 500 个字符'
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
    // 编辑版本时用空字符串明确表示删除封面，避免 undefined 被后端当成“不修改”。
    coverUrl: editingWork ? (coverFile?.url ?? '') : (coverFile?.url || undefined),
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
    const now = nowDate()
    const nowFull = nowDateTime()
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
    const now = nowDate()
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
    if (!canSaveDraft) {
      addToast('error', editingWork ? '当前角色无编辑作品权限' : '当前角色无创建作品权限')
      return
    }
    if (!title.trim()) {
      addToast('error', '请至少填写作品名称')
      return
    }
    const lengthError = validateFieldLengths()
    if (lengthError) {
      addToast('error', lengthError)
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
          return
        }
      } else {
        // 新增草稿版本
        let createdVersion
        try {
          createdVersion = await createVersionApi(editingWork.id, changelog.trim())
        } catch (err) {
          addToast('error', err instanceof Error ? err.message : '创建版本失败')
          return
        }
        const ok = await updateWork(editingWork.id, {
          ...base,
          versions: [{ ...buildNewVersion(), version: createdVersion.version }, ...editingWork.versions],
        })
        if (!ok) {
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
    if (!canSubmitCurrent) {
      addToast('error', '当前角色无提交版本审核权限')
      return
    }
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
    // 更新说明前后端统一为至少 20 个字符
    if (isChangelogRequired) {
      if (!changelog.trim()) {
        addToast('error', '请填写版本更新说明')
        return
      }
      if (changelog.trim().length < 20) {
        addToast('error', '更新说明至少 20 个字符')
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
          return
        }
      } else {
        // 新增草稿版本，再提交审核
        let createdVersion
        try {
          createdVersion = await createVersionApi(editingWork.id, changelog.trim())
        } catch (err) {
          addToast('error', err instanceof Error ? err.message : '创建版本失败')
          return
        }
        targetVersion = createdVersion.version
        const ok = await updateWork(editingWork.id, {
          ...base,
          versions: [{ ...buildNewVersion(), version: createdVersion.version }, ...editingWork.versions],
        })
        if (!ok) {
          return
        }
      }
      // 调用版本级提交审核
      const submitted = await submitVersionForReview(workId, targetVersion)
      if (!submitted) return
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
      if (!submitted) return
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
                <span className="font-normal text-muted-foreground">（2-50 字）</span>
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
              <div className="text-right text-xs text-muted-foreground mt-1">{title.length}/50</div>
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
              <span className="font-normal text-muted-foreground">（1-5 个，单个不超过 30 字）</span>
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
                      onChange={(e) => setCustomTag(e.target.value.slice(0, 30))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag(customTag))}
                      placeholder="自定义标签"
                      maxLength={30}
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
                    <img src={assetUrl(coverFile.url)} alt="封面预览" className="w-full h-full bg-muted object-contain" />
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
                      if (file.size > 100 * 1024 * 1024) {
                        addToast('error', '附件不能超过 100MB（恰好 100MB 可以上传）')
                        if (attachmentInputRef.current) attachmentInputRef.current.value = ''
                        return
                      }
                      setUploadingAttachment(true)
                      try {
                        const result = await uploadAttachment(file)
                        pendingAttachmentNamesRef.current.add(result.storedName)
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
                        <span className="text-[10px] text-muted-foreground mt-0.5">支持 .zip / .json / .md / .skill 等 · ≤100MB</span>
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
              <span className="font-normal text-muted-foreground">（20-2000 字）</span>
            </label>
            <textarea
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
              maxLength={2000}
              placeholder="详细描述如何使用该作品，包括前置条件、操作步骤、注意事项"
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
            <div className="text-right text-xs text-muted-foreground mt-1">{usage.length}/2000</div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">
              业务价值
              <span className="font-normal text-muted-foreground">（可选，不超过 500 字）</span>
            </label>
            <textarea
              value={businessValue}
              onChange={(e) => setBusinessValue(e.target.value)}
              placeholder="描述该作品解决了什么业务问题，带来了哪些效率提升或成本节约"
              maxLength={500}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
            <div className="text-right text-xs text-muted-foreground mt-1">{businessValue.length}/500</div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">
              应用场景
              <span className="font-normal text-muted-foreground">（可选，不超过 200 字）</span>
            </label>
            <input
              type="text"
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              maxLength={200}
              placeholder="例如：财务部门月度报表生成、多部门数据汇总分析"
              className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
            <div className="text-right text-xs text-muted-foreground mt-1">{scene.length}/200</div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold mb-1.5">
              核心能力
              <span className="font-normal text-muted-foreground">（可选，分号分隔，最多 10 项且合计不超过 500 字）</span>
            </label>
            <input
              type="text"
              value={coreAbilities}
              onChange={(e) => setCoreAbilities(e.target.value)}
              maxLength={500}
              placeholder="例如：自动解析数据源；支持自定义模板；定时任务调度"
              className="h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--aic-border-solid)' }}
            />
            <div className="text-right text-xs text-muted-foreground mt-1">{coreAbilities.length}/500</div>
          </div>
        </div>

        <div className="h-px" style={{ background: 'var(--aic-border-solid)' }} />

        {/* v1.3：步骤 5：版本说明 */}
        <div>
          <label className="block text-sm font-semibold mb-3">
            步骤 5：版本说明
            {isChangelogRequired
              ? <><span style={{ color: 'var(--state-danger)' }}> *</span><span className="font-normal text-muted-foreground">（20-500 字）</span></>
              : <span className="font-normal text-muted-foreground">（可选，不超过 500 字）</span>}
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
            maxLength={500}
            placeholder={isChangelogRequired
              ? '请描述本次版本的主要更新内容（至少 20 个字符），便于审核员快速了解变更'
              : editingWork
                ? '描述本次版本的主要更新内容，便于审核员快速了解变更'
                : '初始版本说明，例如：首个版本，包含核心功能'}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 resize-y"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          />
          <div className="text-right text-xs text-muted-foreground mt-1">{changelog.length}/500</div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleSaveDraft}
            disabled={isLocked || !canSaveDraft}
            title={!canSaveDraft ? '当前角色无保存草稿权限' : undefined}
            className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--aic-border-solid)' }}
          >
            <Save size={16} /> 保存草稿
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLocked || !canSubmitCurrent}
            title={!canSubmitCurrent ? '当前角色无提交版本审核权限' : undefined}
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
