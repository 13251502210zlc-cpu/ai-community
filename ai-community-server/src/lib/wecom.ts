// 企业微信 OAuth & 通讯录 API 封装
// 文档：https://developer.work.weixin.qq.com/document/path/91022
//
// 注意：环境变量通过函数式读取（非顶部 const），避免 ESM 模块加载顺序导致
// dotenv.config() 执行前读取到空值的问题。

// 配置读取函数（每次调用时读取最新的环境变量）
function getConfig() {
  return {
    CORP_ID: process.env.WECOM_CORP_ID || '',
    AGENT_ID: process.env.WECOM_AGENT_ID || '',
    CORP_SECRET: process.env.WECOM_SECRET || '',
    REDIRECT_URI: process.env.WECOM_REDIRECT_URI || '',
  }
}

// 导出配置对象（保持向后兼容，通过 getter 动态读取）
export const wecomConfig = {
  get CORP_ID() { return getConfig().CORP_ID },
  get AGENT_ID() { return getConfig().AGENT_ID },
  get REDIRECT_URI() { return getConfig().REDIRECT_URI },
}

// access_token 内存缓存（企业微信限制 2h 过期，且需限频）
let cachedAccessToken: { token: string; expiresAt: number } | null = null

/**
 * 获取企业微信 access_token
 * 文档：https://developer.work.weixin.qq.com/document/path/96039
 */
export async function getAccessToken(): Promise<string> {
  // 命中缓存（提前 5 分钟过期，避免边界问题）
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 5 * 60 * 1000) {
    return cachedAccessToken.token
  }

  const { CORP_ID, CORP_SECRET } = getConfig()
  if (!CORP_ID || !CORP_SECRET) {
    throw new Error('企业微信配置缺失：WECOM_CORP_ID 或 WECOM_SECRET 未设置')
  }

  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CORP_ID}&corpsecret=${encodeURIComponent(CORP_SECRET)}`
  const res = await fetch(url)
  const data = await res.json() as { errcode: number; errmsg: string; access_token?: string; expires_in?: number }

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`获取企业微信 access_token 失败：[${data.errcode}] ${data.errmsg}`)
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  }
  return cachedAccessToken.token
}

/**
 * 生成 OAuth 授权 URL（网页授权扫码登录）
 * scope=snsapi_base：静默授权，仅拿 userid（不弹确认页）
 * scope=snsapi_privateinfo：手动授权，可拿用户详情（需应用配置授权）
 * 文档：https://developer.work.weixin.qq.com/document/path/91022
 */
export function getAuthorizeUrl(state: string = 'ai-community', silent: boolean = true): string {
  const { CORP_ID, REDIRECT_URI } = getConfig()
  if (!CORP_ID || !REDIRECT_URI) {
    throw new Error('企业微信配置缺失：WECOM_CORP_ID 或 WECOM_REDIRECT_URI 未设置')
  }
  const scope = silent ? 'snsapi_base' : 'snsapi_privateinfo'
  const url = 'https://open.weixin.qq.com/connect/oauth2/authorize'
  return `${url}?appid=${CORP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`
}

/**
 * 用 OAuth code 换取企业微信 userid
 * 文档：https://developer.work.weixin.qq.com/document/path/91023
 */
export async function getUserIdByCode(code: string): Promise<string> {
  const accessToken = await getAccessToken()
  const url = `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${encodeURIComponent(code)}`
  const res = await fetch(url)
  const data = await res.json() as { errcode: number; errmsg: string; userid?: string; openid?: string }

  if (data.errcode !== 0) {
    throw new Error(`获取企业微信用户 userid 失败：[${data.errcode}] ${data.errmsg}`)
  }
  if (!data.userid) {
    throw new Error('当前用户非企业成员，无法登录（未返回 userid）')
  }
  return data.userid
}

/**
 * 读取成员详情（姓名、部门、头像）
 * 文档：https://developer.work.weixin.qq.com/document/path/90196
 */
export interface WecomUserInfo {
  userid: string
  name: string
  department: number[]
  main_department?: number
  position?: string
  avatar?: string
  email?: string
  status?: number // 1=已激活 2=已禁用 4=未激活 5=退出企业
}

export async function getUserDetail(userid: string): Promise<WecomUserInfo> {
  const accessToken = await getAccessToken()
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&userid=${encodeURIComponent(userid)}`
  const res = await fetch(url)
  const data = (await res.json()) as WecomUserInfo & { errcode: number; errmsg: string }

  if (data.errcode !== 0) {
    throw new Error(`获取企业微信用户详情失败：[${data.errcode}] ${data.errmsg}`)
  }
  return data
}

/**
 * 部门 id → 部门名称
 * 文档：https://developer.work.weixin.qq.com/document/path/90205
 */
const deptCache = new Map<number, string>()

export async function getDepartmentName(deptId: number): Promise<string> {
  if (deptCache.has(deptId)) return deptCache.get(deptId)!
  try {
    const accessToken = await getAccessToken()
    const url = `https://qyapi.weixin.qq.com/cgi-bin/department/get?access_token=${accessToken}&id=${deptId}`
    const res = await fetch(url)
    const data = await res.json() as { errcode: number; errmsg: string; department?: { name?: string } }
    if (data.errcode === 0 && data.department?.name) {
      deptCache.set(deptId, data.department.name)
      return data.department.name
    }
  } catch {
    // ignore
  }
  return `部门${deptId}`
}

// 是否启用企业微信（配置完整才视为启用）
export function isWecomEnabled(): boolean {
  const { CORP_ID, AGENT_ID, CORP_SECRET, REDIRECT_URI } = getConfig()
  return !!(CORP_ID && AGENT_ID && CORP_SECRET && REDIRECT_URI)
}
