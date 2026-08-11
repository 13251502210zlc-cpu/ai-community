import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, User as UserIcon, Eye, EyeOff, Loader2, RefreshCw, Smartphone, AlertCircle } from 'lucide-react'
import { useApp } from '../store/AppStore'
import {
  loginWithPassword,
  getWecomAuthUrl,
  getWecomStatus,
  setToken,
  extractTokenFromHash,
  getCurrentUser,
} from '../lib/api'
import type { User } from '../types'

type LoginTab = 'wecom' | 'password'

// ============ 企业微信扫码登录 SDK（wwLogin 1.2.7） ============
// 企微官方 1.2.7 SDK 导出的是 window.WwLogin（驼峰），需通过 new WwLogin({...}) 调用
declare global {
  interface Window {
    WwLogin?: new (config: {
      id: string
      appid: string
      agentid: string
      redirect_uri: string
      state?: string
      href?: string
      lang?: string
    }) => void
  }
}

// 动态加载企业微信网页扫码登录 SDK（按需加载，缓存 Promise 避免重复）
let wwLoginScriptPromise: Promise<void> | null = null
function loadWwLoginScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('非浏览器环境'))
  if (window.WwLogin) return Promise.resolve()
  if (wwLoginScriptPromise) return wwLoginScriptPromise
  wwLoginScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://wwcdn.weixin.qq.com/node/wework/wwopen/js/wwLogin-1.2.7.js'
    script.onload = () => resolve()
    script.onerror = () => {
      wwLoginScriptPromise = null
      reject(new Error('加载企业微信扫码 SDK 失败'))
    }
    document.head.appendChild(script)
  })
  return wwLoginScriptPromise
}

// 检测是否在企业微信客户端内打开（User-Agent 含 wxwork）
function isInWeComClient(): boolean {
  if (typeof navigator === 'undefined') return false
  return /wxwork/i.test(navigator.userAgent)
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, addToast } = useApp()
  const [activeTab, setActiveTab] = useState<LoginTab>('wecom')

  // 后端可用性与登录方式
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null) // null=检测中
  const [wecomEnabled, setWecomEnabled] = useState(false)
  // 企业微信扫码登录配置（corpId/agentId/redirectUri），仅 wecom 启用时存在
  const [scanConfig, setScanConfig] = useState<{ corpId: string; agentId: string; redirectUri: string; state: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // 是否在企业微信客户端内
  const isInWeCom = isInWeComClient()
  // 企微客户端自动登录中
  const [autoLoggingIn, setAutoLoggingIn] = useState(false)
  const [autoLoginError, setAutoLoginError] = useState('')

  // 内嵌二维码加载状态
  const [qrSdkLoading, setQrSdkLoading] = useState(false)
  const [qrSdkError, setQrSdkError] = useState('')
  // 二维码渲染 key（刷新时递增，强制重新初始化）
  const [qrKey, setQrKey] = useState(0)
  const qrContainerRef = useRef<HTMLDivElement>(null)

  // 账号密码表单
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // URL query 错误参数（企业微信回调失败时带 error=xxx）
  const urlError = new URLSearchParams(location.search).get('error')

  // 获取登录前页面路径。企微 OAuth 是整页跳转，React Router 的 location.state 会丢失，
  // 因此回调由后端通过 redirect query 把目标页带回。
  const redirectParam = new URLSearchParams(location.search).get('redirect')
  const safeRedirectPath = redirectParam?.startsWith('/') && !redirectParam.startsWith('//')
    ? redirectParam
    : null
  const fromPath = safeRedirectPath || (location.state as { from?: string })?.from || '/'

  useEffect(() => {
    // v1.4：检查 URL hash 中是否有 OAuth 回调的 token（真实企业微信登录后带回来）
    const token = extractTokenFromHash()
    if (token) {
      setToken(token)
      getCurrentUser()
        .then((user: any) => {
          const fullUser: User = {
            id: user.id,
            name: user.name,
            department: user.department,
            position: user.position,
            roles: user.roles,
            avatarColor: user.avatarColor || 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            loginMethod: user.loginMethod || 'wecom',
            accountStatus: user.accountStatus || 'active',
          }
          login(fullUser, true)
          addToast('success', `欢迎回来，${user.name}！`)
          navigate(fromPath, { replace: true })
        })
        .catch(() => {
          setErrorMsg('登录失败，请重试')
        })
      return
    }

    // 检测后端可用性 + 获取企业微信扫码登录配置
    getWecomStatus()
      .then((data) => {
        setBackendOnline(true)
        setWecomEnabled(data.enabled)
        setScanConfig(data.scan)
      })
      .catch(() => {
        // 后端不可用
        setBackendOnline(false)
        setWecomEnabled(false)
        setScanConfig(null)
      })
  }, [])

  // v1.5：企业微信客户端内自动静默登录（无需扫码）
  // 企微工作台打开应用时，用户已登录企业微信，OAuth snsapi_base 会静默授权直接回调
  useEffect(() => {
    if (!isInWeCom || !wecomEnabled || !scanConfig) return
    // 排除回调失败重定向回来的情况（带 error 参数时不自动跳，避免死循环）
    if (urlError) return

    setAutoLoggingIn(true)
    setAutoLoginError('')
    getWecomAuthUrl(true)
      .then(({ url }) => {
        // 跳转到企业微信 OAuth，snsapi_base 在企微客户端内静默授权，无需扫码
        window.location.href = url
      })
      .catch((err: any) => {
        setAutoLoggingIn(false)
        setAutoLoginError(err.message || '自动登录失败，请手动选择登录方式')
      })
  }, [isInWeCom, wecomEnabled, scanConfig, urlError])

  // v1.5：浏览器内嵌企业微信扫码二维码（wwLogin 1.2.7 SDK）
  // 注意：1.2.7 版本导出 window.WwLogin（驼峰），需用 new WwLogin({...}) 构造函数方式调用
  useEffect(() => {
    if (activeTab !== 'wecom') return
    if (!wecomEnabled || !scanConfig) return
    // 企微客户端不渲染二维码（走自动登录）
    if (isInWeCom) return

    setQrSdkLoading(true)
    setQrSdkError('')
    loadWwLoginScript()
      .then(() => {
        if (!window.WwLogin || !qrContainerRef.current) return
        // 清空容器后初始化（刷新时重新渲染二维码）
        qrContainerRef.current.innerHTML = ''
        // 1.2.7 SDK：构造函数调用方式
        new window.WwLogin({
          id: 'wecom-qr-container',
          appid: scanConfig.corpId,
          agentid: scanConfig.agentId,
          redirect_uri: encodeURIComponent(scanConfig.redirectUri),
          state: scanConfig.state,
          lang: 'zh',
        })
        setQrSdkLoading(false)
      })
      .catch((err: any) => {
        setQrSdkLoading(false)
        setQrSdkError(err.message || '二维码加载失败')
      })
  }, [activeTab, wecomEnabled, scanConfig, isInWeCom, qrKey])

  // v1.4：账号密码登录（调用真实后端 API）
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!account.trim() || !password.trim()) {
      setErrorMsg('请输入账号和密码')
      return
    }

    if (!backendOnline) {
      setErrorMsg('后端服务未启动，无法登录')
      return
    }

    setLoading(true)

    try {
      const data = await loginWithPassword(account.trim(), password, rememberMe)
      const fullUser: User = {
        id: data.user.id,
        name: data.user.name,
        department: data.user.department,
        position: data.user.position,
        roles: data.user.roles as User['roles'],
        avatarColor: data.user.avatarColor || 'linear-gradient(135deg,#6366f1,#8b5cf6)',
        loginMethod: 'password',
        accountStatus: 'active',
      }
      login(fullUser, rememberMe)
      addToast('success', `欢迎回来，${data.user.name}！`)
      navigate(fromPath, { replace: true })
    } catch (err: any) {
      setErrorMsg(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  // ============ 企业微信客户端内：自动静默登录中 ============
  if (isInWeCom && wecomEnabled && !urlError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 py-8"
        style={{ background: 'linear-gradient(135deg, #f0f4ff, #e8eeff)' }}
      >
        <div
          className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-2xl text-center"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
        >
          <div
            className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center text-white text-xl font-bold"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            AI
          </div>
          {autoLoggingIn ? (
            <>
              <Loader2 size={36} className="mx-auto mb-3 animate-spin" style={{ color: 'var(--aic-primary)' }} />
              <div className="text-base font-bold mb-1" style={{ color: 'var(--aic-foreground)' }}>正在自动登录</div>
              <div className="text-xs" style={{ color: 'var(--aic-muted-foreground)' }}>
                检测到企业微信环境，正在通过企业微信免登...
              </div>
            </>
          ) : autoLoginError ? (
            <>
              <AlertCircle size={36} className="mx-auto mb-3" style={{ color: 'var(--state-danger)' }} />
              <div className="text-base font-bold mb-1" style={{ color: 'var(--aic-foreground)' }}>自动登录失败</div>
              <div className="text-xs mb-4" style={{ color: 'var(--aic-muted-foreground)' }}>{autoLoginError}</div>
              <button
                onClick={() => { setAutoLoggingIn(true); window.location.reload() }}
                className="w-full py-2.5 rounded-md text-sm font-medium text-white"
                style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
              >
                重试
              </button>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'linear-gradient(135deg, #f0f4ff, #e8eeff)' }}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-2xl"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
      >
        {/* 品牌区域 */}
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center text-white text-xl font-bold"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            AI
          </div>
          <div className="text-lg font-bold" style={{ color: 'var(--aic-foreground)' }}>AI 社区平台</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--aic-muted-foreground)' }}>企业内部 AI 作品展示与交流社区</div>
        </div>

        {/* URL 错误参数提示（企业微信回调失败） */}
        {urlError && (
          <div
            className="mb-4 rounded-md p-2 text-xs text-center"
            style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
          >
            {urlError === 'account_disabled'
              ? '账号已被禁用，请联系管理员'
              : urlError === 'wecom_failed'
              ? '企业微信登录失败，请重试或使用账号密码登录'
              : `登录失败：${urlError}`}
          </div>
        )}

        {/* 企微客户端自动登录失败提示 */}
        {isInWeCom && autoLoginError && (
          <div
            className="mb-4 rounded-md p-2 text-xs text-center"
            style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning)' }}
          >
            企微免登失败，请使用下方扫码或账号密码登录
          </div>
        )}

        {/* 后端服务未启动提示 */}
        {backendOnline === false && (
          <div
            className="mb-4 rounded-md p-2 text-xs text-center"
            style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
          >
            后端服务未启动
          </div>
        )}

        {/* 登录方式切换（始终显示两个标签） */}
        <div className="flex border-b mb-5" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <button
            onClick={() => { setActiveTab('wecom'); setErrorMsg('') }}
            className="flex-1 py-2.5 text-sm font-medium transition border-b-2 -mb-px"
            style={
              activeTab === 'wecom'
                ? { borderColor: 'var(--aic-primary)', color: 'var(--aic-primary)' }
                : { borderColor: 'transparent', color: 'var(--aic-muted-foreground)' }
            }
          >
            企业微信扫码
          </button>
          <button
            onClick={() => { setActiveTab('password'); setErrorMsg('') }}
            className="flex-1 py-2.5 text-sm font-medium transition border-b-2 -mb-px"
            style={
              activeTab === 'password'
                ? { borderColor: 'var(--aic-primary)', color: 'var(--aic-primary)' }
                : { borderColor: 'transparent', color: 'var(--aic-muted-foreground)' }
            }
          >
            账号密码
          </button>
        </div>

        {/* ============ 企业微信扫码面板 ============ */}
        {activeTab === 'wecom' && (
          <div className="text-center animate-fade-in">
            {wecomEnabled && scanConfig && !isInWeCom ? (
              /* ===== 浏览器 + 企微已配置：内嵌二维码（wwLogin SDK） ===== */
              <>
                <div
                  className="mx-auto mb-4 rounded-xl border relative"
                  style={{
                    borderColor: 'var(--aic-border-solid)',
                    backgroundColor: '#fff',
                    width: '300px',
                    // wwLogin 1.2.7 固定生成 300×400 iframe，容器必须保留完整高度。
                    // 旧版 300px 高度配合 overflow-hidden 会裁掉二维码下半部分。
                    height: '400px',
                  }}
                >
                  {qrSdkLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 size={32} className="animate-spin" style={{ color: 'var(--aic-primary)' }} />
                    </div>
                  )}
                  {qrSdkError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
                      <AlertCircle size={28} className="mb-2" style={{ color: 'var(--state-danger)' }} />
                      <div className="text-xs mb-3" style={{ color: 'var(--aic-muted-foreground)' }}>{qrSdkError}</div>
                      <button
                        onClick={() => setQrKey((k) => k + 1)}
                        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-white"
                        style={{ background: 'var(--aic-primary)' }}
                      >
                        <RefreshCw size={12} /> 重新加载
                      </button>
                    </div>
                  )}
                  {/* wwLogin SDK 渲染二维码的容器 */}
                  <div
                    id="wecom-qr-container"
                    ref={qrContainerRef}
                    style={{ width: '300px', height: '400px' }}
                  />
                </div>

                <p className="text-sm mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>
                  请使用 <strong style={{ color: 'var(--aic-foreground)' }}>企业微信</strong> 扫描二维码登录
                </p>
                <p className="text-xs mb-3" style={{ color: 'var(--aic-muted-foreground)' }}>
                  扫码后在手机端确认即可登录
                </p>
                <button
                  onClick={() => setQrKey((k) => k + 1)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition hover:bg-muted"
                  style={{ borderColor: 'var(--aic-border-solid)', color: 'var(--aic-muted-foreground)' }}
                >
                  <RefreshCw size={12} /> 刷新二维码
                </button>
              </>
            ) : wecomEnabled && scanConfig && isInWeCom ? (
              /* ===== 企微客户端但自动登录失败：提示手动操作 ===== */
              <div className="py-8">
                <Smartphone size={40} className="mx-auto mb-3" style={{ color: 'var(--aic-muted-foreground)', opacity: 0.4 }} />
                <p className="text-sm mb-4" style={{ color: 'var(--aic-muted-foreground)' }}>
                  企微免登未成功，请切换到账号密码登录
                </p>
                <button
                  onClick={() => setActiveTab('password')}
                  className="w-full py-2.5 rounded-md text-sm font-medium text-white"
                  style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
                >
                  使用账号密码登录
                </button>
              </div>
            ) : (
              /* ===== 企业微信未配置：提示使用账号密码登录 ===== */
              <div className="py-8">
                <Smartphone size={40} className="mx-auto mb-3" style={{ color: 'var(--aic-muted-foreground)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--aic-muted-foreground)' }}>
                  企业微信登录未配置，请使用账号密码登录
                </p>
              </div>
            )}
          </div>
        )}

        {/* ============ 账号密码面板 ============ */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordLogin} className="animate-fade-in">
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>
                账号 <span style={{ color: 'var(--state-danger)' }}>*</span>
              </label>
              <div className="relative">
                <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--aic-muted-foreground)' }} />
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="工号或登录账号"
                  className="w-full h-10 rounded-md border pl-9 pr-3 text-sm outline-none focus:ring-2"
                  style={{ borderColor: 'var(--aic-border-solid)' }}
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--aic-muted-foreground)' }}>
                密码 <span style={{ color: 'var(--state-danger)' }}>*</span>
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--aic-muted-foreground)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full h-10 rounded-md border pl-9 pr-9 text-sm outline-none focus:ring-2"
                  style={{ borderColor: 'var(--aic-border-solid)' }}
                  autoComplete="current-password"
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
            </div>
            <div className="flex items-center justify-between mb-4">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--aic-muted-foreground)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded"
                  style={{ width: 'auto' }}
                />
                记住我（7天免登录）
              </label>
              <button
                type="button"
                onClick={() => addToast('info', '请联系管理员重置密码')}
                className="text-xs transition hover:underline"
                style={{ color: 'var(--aic-primary)' }}
              >
                忘记密码？
              </button>
            </div>

            {errorMsg && (
              <div
                className="mb-3 rounded-md p-2 text-xs text-center"
                style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }}
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> 登录中...
                </>
              ) : (
                '登录'
              )}
            </button>
            <p className="text-xs text-center mt-3" style={{ color: 'var(--aic-muted-foreground)' }}>
              账号密码由管理员统一分配，如需账号或重置密码请联系管理员
            </p>
          </form>
        )}

        {/* 底部提示 */}
        <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: 'var(--aic-border-solid)' }}>
          <p className="text-xs" style={{ color: 'var(--aic-muted-foreground)' }}>登录即代表同意《AI 社区平台使用规范》</p>
        </div>
      </div>
    </div>
  )
}
