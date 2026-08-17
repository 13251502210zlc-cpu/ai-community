import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { detectDeviceType, signToken } from '../lib/jwt.js'
import crypto from 'crypto'
import {
  getAuthorizeUrl,
  getUserIdByCode,
  getUserDetail,
  getDepartmentName,
  isWecomEnabled,
  wecomConfig,
} from '../lib/wecom.js'

const router = Router()
const oauthStates = new Map<string, { redirect: string; expiresAt: number }>()

// 企微登录 iframe 自定义样式：只保留标准 180×180 二维码和状态文字，移除 SDK 品牌标题。
router.get('/wecom/qr-style.css', (_req, res) => {
  res.type('text/css').send(`
    .impowerBox .title, .impowerBox .wrp_code_top { display: none !important; }
    .impowerBox .qrcode { width: 180px !important; height: 180px !important; margin-top: 10px !important; }
    .impowerBox .info { width: 180px !important; margin: 0 auto !important; }
    .impowerBox .status { text-align: center !important; }
  `)
})

function createOAuthState(redirect = '/') {
  const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
  const state = crypto.randomBytes(24).toString('base64url')
  oauthStates.set(state, { redirect: safeRedirect, expiresAt: Date.now() + 5 * 60 * 1000 })
  return state
}

/**
 * 公共：upsert 企业微信用户到数据库
 * 首次登录自动创建用户，后续登录更新信息
 */
async function upsertWecomUser(wecomUserId: string) {
  // 查找现有用户（按 wecomUserId）
  const existing = await prisma.user.findUnique({
    where: { wecomUserId },
  })

  // 用户身份已经由 OAuth code 换取成功，通讯录详情仅用于补全资料。
  // 企业微信自建应用可能没有通讯录读取权限，此时不能让整个登录流程失败。
  let detail: Awaited<ReturnType<typeof getUserDetail>> | null = null
  try {
    detail = await getUserDetail(wecomUserId)
  } catch (err) {
    console.warn(
      `[wecom login] userid=${wecomUserId} 已通过 OAuth 验证，但读取通讯录详情失败，将使用兜底资料：`,
      err,
    )
  }

  let deptName = existing?.department || '未分配部门'
  if (detail?.department?.length) {
    deptName = await getDepartmentName(detail.main_department || detail.department[0])
  }

  if (existing) {
    // 更新最后一次登录时间和企业微信信息
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: detail?.name || existing.name,
        department: deptName,
        position: detail?.position || existing.position,
        avatar: detail?.avatar || existing.avatar,
        lastLoginAt: new Date(),
        // 企业微信 status=2 表示已禁用
        accountStatus: detail?.status === 2 ? 'disabled' : existing.accountStatus,
      },
    })
    return updated
  }

  // 首次登录：自动创建用户（默认普通用户角色）
  const newUser = await prisma.user.create({
    data: {
      wecomUserId,
      name: detail?.name || `企微用户${wecomUserId.slice(-4)}`,
      department: deptName,
      position: detail?.position || '员工',
      avatar: detail?.avatar || null,
      employeeId: detail?.userid || wecomUserId, // 企业微信 userid 作为工号占位
      role: 'user',
      loginMethod: 'wecom',
      accountStatus: 'active',
      lastLoginAt: new Date(),
      // v1.7：同步写入 assignedRoles 关联表（默认普通用户角色）
      assignedRoles: {
        create: [{ role: 'user' }],
      },
    },
    include: { assignedRoles: true },
  })
  return newUser
}

/**
 * GET /api/auth/wecom/url
 * 返回企业微信 OAuth 授权 URL，前端跳过去扫码
 * 可选 query: silent=true（静默授权，默认 true）
 */
router.get('/wecom/url', (req, res) => {
  if (!isWecomEnabled()) {
    res.status(503).json({
      error: '企业微信登录未启用，请在服务端配置 WECOM_CORP_ID / WECOM_SECRET / WECOM_REDIRECT_URI',
      code: 'WECOM_NOT_CONFIGURED',
    })
    return
  }
  const silent = req.query.silent !== 'false'
  const state = createOAuthState((req.query.redirect as string) || '/')
  const url = getAuthorizeUrl(state, silent)
  res.json({ url, silent })
})

/**
 * GET /api/auth/wecom/callback
 * 企业微信 OAuth 回调，code 换 userid → 创建/更新用户 → 签发 JWT → 重定向到前端
 * 登录完成后统一回到前端 /login，由登录页消费 hash 中的 token，再跳转到目标页面。
 * 不能直接跳到 /#access_token=...：根路由的鉴权保护会先把页面送回 /login，
 * React Router 重定向过程中 hash 会丢失，最终表现为“扫码成功但没有登录”。
 */
router.get('/wecom/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query as {
      code?: string
      state?: string
    }

    if (!code) {
      res.status(400).json({ error: '缺少 code 参数', code: 'VALIDATION_ERROR' })
      return
    }
    const stateRecord = state ? oauthStates.get(state) : undefined
    if (!stateRecord || stateRecord.expiresAt < Date.now()) {
      res.status(400).json({ error: 'OAuth state 无效或已过期', code: 'INVALID_OAUTH_STATE' })
      return
    }
    oauthStates.delete(state!)

    // code 换 userid
    const wecomUserId = await getUserIdByCode(code)

    // upsert 用户
    const user = await upsertWecomUser(wecomUserId)

    // 校验账号状态
    if (user.accountStatus === 'disabled') {
      const frontendUrl = process.env.FRONTEND_ORIGIN || '/'
      res.redirect(`${frontendUrl}/login?error=account_disabled`)
      return
    }

    // 签发 JWT（v1.7：roles 数组）
    const userWithRoles = await prisma.user.findUnique({
      where: { id: user.id },
      include: { assignedRoles: true },
    })
    const roles = userWithRoles?.assignedRoles?.map((r) => r.role) || [user.role]
    const deviceType = detectDeviceType(req.get('user-agent') || '')
    const sessionId = crypto.randomUUID()
    await prisma.user.update({
      where: { id: user.id },
      data: deviceType === 'mobile' ? { mobileSessionId: sessionId } : { pcSessionId: sessionId },
    })
    await prisma.operationLog.create({
      data: {
        time: new Date(),
        operatorId: user.id,
        operatorName: user.name,
        department: user.department,
        role: roles.join('、'),
        module: '登录认证',
        action: '登录',
        content: '企业微信登录成功',
        target: user.employeeId || user.wecomUserId || user.id,
        ip: req.ip || req.socket.remoteAddress || '',
        result: 'success',
      },
    })
    const token = signToken({
      userId: user.id,
      roles,
      name: user.name,
      loginType: 'wecom',
      sessionId,
      deviceType,
    })

    // 统一由 /login 消费 token；redirect 仅允许站内绝对路径，避免开放重定向。
    // token 放在 URL hash 中，不会进入服务器日志或 Referer。
    const frontendBase = (process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '')
    const targetPath = stateRecord.redirect
    const safePath = targetPath.startsWith('/') && !targetPath.startsWith('//')
      ? targetPath
      : '/'
    const loginUrl = `${frontendBase}/login?redirect=${encodeURIComponent(safePath)}`
    res.redirect(`${loginUrl}#access_token=${encodeURIComponent(token)}`)
  } catch (err) {
    console.error('[wecom callback] error:', err)
    const frontendUrl = process.env.FRONTEND_ORIGIN || '/'
    const message = err instanceof Error ? err.message : ''
    const errorCode = message.includes('配置缺失')
      ? 'wecom_config'
      : message.includes('access_token')
        ? 'wecom_credential'
        : message.includes('userid') && message.includes('失败')
          ? 'wecom_code'
          : message.includes('非企业成员')
            ? 'wecom_non_member'
            : message.includes('企业微信')
              ? 'wecom_api'
              : 'wecom_failed'
    res.redirect(`${frontendUrl}/login?error=${errorCode}`)
  }
})

/**
 * GET /api/auth/wecom/status
 * 返回企业微信登录是否启用，以及内嵌扫码登录所需的配置（corpId/agentId/redirectUri）
 * 前端用此配置初始化企业微信网页扫码登录 SDK（wwLogin）
 */
router.get('/wecom/status', (_req, res) => {
  const enabled = isWecomEnabled()
  const state = enabled ? createOAuthState('/') : undefined
  res.json({
    enabled,
    // 启用时返回扫码登录配置，供前端 wwLogin SDK 使用
    scan: enabled
      ? {
          corpId: wecomConfig.CORP_ID,
          agentId: wecomConfig.AGENT_ID,
          redirectUri: wecomConfig.REDIRECT_URI,
          state,
        }
      : null,
  })
})

export default router
