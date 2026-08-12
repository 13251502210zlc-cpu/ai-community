# AI 社区平台接口文档（当前代码版）

> 文档日期：2026-08-11
> 后端包版本：`1.0.0`
> 接口基线：当前工作区 `ai-community-server/src` 代码，共 63 个路由（含 2 个兼容路径）
> 生产测试地址：`https://aicommunity-test.cdf-hn.com`

## 1. 接入约定

### 1.1 Base URL

| 环境 | API Base URL |
|---|---|
| 生产测试 | `https://aicommunity-test.cdf-hn.com/api` |
| 本地开发 | `http://localhost:3001/api` |

静态上传文件通过 `/uploads` 访问，例如：

```text
https://aicommunity-test.cdf-hn.com/uploads/covers/xxx.png
```

### 1.2 请求格式

- 普通接口：`Content-Type: application/json`
- 文件上传：`Content-Type: multipart/form-data`
- 时间字段：ISO 8601 字符串；操作日志列表中的 `time` 为 `YYYY-MM-DD HH:mm:ss`

### 1.3 身份认证

登录成功后取得 JWT，后续请求推荐使用：

```http
Authorization: Bearer <token>
```

后端同时兼容 `Authorization: <token>`。Token 默认有效期为 7 天，可由服务端 `JWT_EXPIRES_IN` 调整。

### 1.4 通用错误结构

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE",
  "details": []
}
```

| HTTP 状态 | 常见 code | 说明 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求参数校验失败 |
| 400 | `BUSINESS_ERROR` | 当前业务状态不允许操作 |
| 401 | `UNAUTHORIZED`、`INVALID_CREDENTIALS` | 未登录、Token 失效或凭据错误 |
| 403 | `FORBIDDEN`、`ACCOUNT_DISABLED`、`ACCOUNT_LOCKED` | 权限或账号状态异常 |
| 404 | `NOT_FOUND` | 资源或接口不存在 |
| 409 | `CANDIDATE_EXISTS` | 已存在未完成的候选版本 |
| 500 | `INTERNAL_ERROR` | 服务端内部错误 |
| 503 | `WECOM_NOT_CONFIGURED` | 企业微信登录未配置完整 |

## 2. 角色与权限

系统支持一个用户拥有多个角色，最终权限为各角色权限的并集。

| 角色 | 标识 | 权限 |
|---|---|---|
| 普通用户 | `user` | `work:read`, `work:create` |
| 创作者 | `creator` | `work:read`, `work:create`, `work:submit`, `work:editOwn`, `work:deleteOwn`, `work:offlineOwn` |
| 审核管理员 | `reviewer` | `work:read`, `review:view`, `review:approve`, `review:reject`, `review:forceOffline`, `admin:workRead`, `admin:workManage` |
| 运营管理员 | `operator` | `work:read`, `admin:domain`, `admin:tag`, `admin:user`, `admin:recommend`, `admin:stats`, `admin:workRead`, `admin:workManage` |
| 超级管理员 | `super_admin` | 全部权限（额外包含 `admin:role`） |

## 3. 核心数据结构

### 3.1 UserSummary

```ts
interface UserSummary {
  id: string
  name: string
  role: 'user' | 'creator' | 'reviewer' | 'operator' | 'super_admin'
  roles: string[]
  department: string
  position: string
  avatarColor: string
  avatar: string | null
  employeeId: string | null
}
```

### 3.2 Work

```ts
type WorkType = 'skill' | 'app' | 'agent' | 'prompt' | 'workflow' | 'case'
type WorkStatus = 'unpublished' | 'published' | 'offline' | 'deleted'

interface Work {
  id: string
  title: string
  type: WorkType
  category: string
  tags: string[]
  intro: string
  authorId: string
  authorName: string
  department: string
  status: WorkStatus
  currentVersion: string | null
  coverUrl: string | null
  usage: string
  businessValue: string | null
  scene: string | null
  coreAbilities: string[] | string | null
  likes: number
  favorites: number
  downloads: number
  views: number
  recommended: boolean
  createdAt: string
  publishedAt: string | null
}
```

说明：详情接口会把 `coreAbilities` 解析为数组；部分列表接口当前仍直接返回数据库中的 JSON 字符串，客户端应做兼容解析。

### 3.3 WorkVersion

```ts
type VersionStatus = 'draft' | 'pending' | 'passed' | 'rejected'

interface WorkVersion {
  id: string
  workId: string
  version: string             // v1、v2、v3，由服务端生成
  changelog: string
  status: VersionStatus
  current: boolean
  candidate: boolean
  changelogAuthor: string | null
  submittedAt: string | null
  reviewedAt: string | null
  reviewerId: string | null
  rejectReason: string | null
  baseVersionId: string | null
  createdAt: string
}
```

### 3.4 分页结构

```ts
interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

## 4. 系统状态

### GET `/health`

无需登录。用于存活检查和认证方式状态检查。

```json
{
  "status": "ok",
  "timestamp": "2026-08-10T08:00:00.000Z",
  "auth": {
    "wecom": true,
    "password": true
  }
}
```

## 5. 登录与用户接口

### 5.1 账号密码登录

`POST /auth/login`，无需登录。

```json
{
  "account": "employee001",
  "password": "******"
}
```

账号可匹配 `loginAccount` 或 `employeeId`。连续失败 5 次会锁定 15 分钟。

成功响应：

```json
{
  "token": "eyJ...",
  "user": {
    "id": "user_id",
    "name": "张三",
    "role": "creator",
    "roles": ["creator"],
    "department": "技术部",
    "position": "工程师",
    "avatarColor": "#2563eb",
    "avatar": null,
    "employeeId": "employee001"
  }
}
```

### 5.2 退出登录

`POST /auth/logout`，需要登录。无请求体。

```json
{ "success": true, "message": "已退出登录" }
```

JWT 为无状态 Token，客户端仍需主动清除本地 Token。

### 5.3 当前用户

`GET /auth/me`，需要登录。返回 `UserSummary`，并附加：

```ts
{
  loginMethod: 'wecom' | 'password' | 'both'
  accountStatus: 'active' | 'disabled' | 'locked'
  lastLoginAt: string | null
}
```

### 5.4 切换角色（现有兼容接口）

`POST /auth/switch-role` 已禁用。系统角色只能由超级管理员通过后台用户管理接口分配。

```json
{
  "error": "用户不能自行切换或分配系统角色，请联系超级管理员",
  "code": "FORBIDDEN"
}
```

HTTP 状态为 `403`。请求体中的 `role` 或 `roles` 均不会生效。

### 5.5 用户作品与收藏

| 方法 | 路径 | 认证 | 响应 |
|---|---|---|---|
| GET | `/users/:id/works` | 本人；审核、运营或超管可查看其他用户 | 用户未删除的作品数组，含标签和版本 |
| GET | `/users/:id/favorites` | 仅本人 | 用户收藏的作品数组 |

> 标准完整地址示例：`GET https://aicommunity-test.cdf-hn.com/api/users/{id}/works`。为兼容已上线客户端，`/api/auth/users/{id}/works` 和 `/api/auth/users/{id}/favorites` 仍可使用；新接入请使用 `/api/users/...`。

## 6. 企业微信登录接口

### 6.1 获取 OAuth 地址

`GET /auth/wecom/url`，无需登录。

| Query | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `silent` | boolean 字符串 | `true` | 传 `false` 使用非静默授权 |
| `state` | string | `ai-community` | OAuth state |

```json
{
  "url": "https://open.weixin.qq.com/connect/oauth2/authorize?...",
  "silent": true
}
```

未配置企业微信时返回 503 `WECOM_NOT_CONFIGURED`。

### 6.2 企业微信回调

`GET /auth/wecom/callback`，无需登录，由企业微信调用。

| Query | 必填 | 说明 |
|---|---|---|
| `code` | 是 | 企业微信 OAuth 临时授权码 |
| `state` | 否 | OAuth state |
| `redirect` | 否 | 登录后站内路径，只接受 `/` 开头的相对路径 |

成功后重定向至：

```text
{FRONTEND_ORIGIN}{redirect}#access_token={JWT}
```

失败后重定向至 `/login?error=wecom_failed`；账号禁用时为 `/login?error=account_disabled`。

### 6.3 获取扫码配置状态

`GET /auth/wecom/status`，无需登录。

```json
{
  "enabled": true,
  "scan": {
    "corpId": "wwxxxxxxxx",
    "agentId": "1000002",
    "redirectUri": "https://example.com/api/auth/wecom/callback"
  }
}
```

未启用时 `scan` 为 `null`。前端使用该响应初始化企业微信网页扫码组件。

## 7. 文件上传接口

所有上传接口均需要登录，表单文件字段名固定为 `file`。

| 方法 | 路径 | 限制 | 响应 |
|---|---|---|---|
| POST | `/upload/cover` | 图片 MIME，最大 5 MB | `{ url, name, size }` |
| POST | `/upload/attachment` | 最大 100 MB；拒绝 exe/bat/cmd/sh/js/ts | `{ id, url, name, size, storedName }` |
| GET | `/upload/attachment/:filename` | 作者/审核/运营/超管，或已发布作品的当前版本附件 | 返回附件文件流；`Content-Disposition: attachment` |
| DELETE | `/upload/attachment/:filename` | `filename` 使用上传响应的 `storedName` | `{ success: true }` |

上传示例：

```bash
curl -X POST "https://aicommunity-test.cdf-hn.com/api/upload/cover" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cover.png"
```

注意：附件删除接口只删除物理文件，不处理已关联的数据库记录。

## 8. 作品接口

### 8.1 作品大厅

`GET /works`，需要登录。

| Query | 默认值 | 说明 |
|---|---|---|
| `type` | 全部 | `skill/app/agent/prompt/workflow/case/all` |
| `domain` | 全部 | 业务领域，`all` 表示全部 |
| `tag` | - | 标签；可重复传递多个同名参数 |
| `sort` | `latest` | `latest/likes/favorites/downloads` |
| `q` | - | 搜索标题、简介、作者名 |
| `page` | `1` | 页码，最小 1 |
| `pageSize` | `12` | 每页条数，1～50 |

响应：`PageResult<Work>`，仅返回 `status=published` 的作品。

### 8.2 作品查询

以下接口均需要登录。

| 方法 | 路径 | 响应 |
|---|---|---|
| GET | `/works/recommended` | 最近发布的推荐作品，最多 5 条 |
| GET | `/works/domains` | 业务领域名称数组 `string[]` |
| GET | `/works/tags` | 标签名称数组 `string[]` |
| GET | `/works/:id` | 作品详情，含版本、附件、评论、标签和互动状态；已发布作品浏览量 +1。未发布作品仅作者、审核、运营或超管可见 |

### 8.3 创建作品

`POST /works`，需要登录和 `work:create` 权限。

```json
{
  "title": "智能问答助手",
  "type": "agent",
  "category": "客户服务",
  "tags": ["问答", "智能体"],
  "intro": "面向内部知识库的智能问答助手",
  "usage": "进入应用后输入问题",
  "businessValue": "降低重复咨询成本",
  "scene": "内部员工咨询",
  "coreAbilities": ["知识检索", "多轮问答"],
  "coverUrl": "/uploads/covers/xxx.png",
  "changelog": "初始版本",
  "attachments": [
    {
      "name": "使用手册.pdf",
      "size": "1.20 MB",
      "url": "/api/upload/attachment/xxx.pdf",
      "storedName": "xxx.pdf"
    }
  ]
}
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `title` | 是 | 2～50 字符；不能与未删除作品重名 |
| `type` | 是 | `WorkType` 枚举 |
| `category` | 是 | 必须是后台已存在的业务领域 |
| `tags` | 是 | 1～5 个非空字符串 |
| `intro` | 是 | 10～100 字符 |
| `usage` | 是 | 至少 20 字符 |
| `businessValue` | 否 | 最多 500 字符 |
| `scene` | 否 | 字符串 |
| `coreAbilities` | 否 | 字符串数组 |
| `coverUrl` | 否 | 字符串 |
| `changelog` | 否 | 首版更新说明 |
| `attachments` | 否 | 附件数组；每项需包含上传响应中的 `name/size/url/storedName`。`skill`、`workflow` 类型至少上传 1 个附件 |

成功返回 201 和完整 `Work`。系统自动创建 `v1` 草稿；普通用户首次创建后自动增加 `creator` 角色。

### 8.4 编辑和状态操作

| 方法 | 路径 | 权限/限制 | 请求体 | 响应 |
|---|---|---|---|---|
| PUT | `/works/:id` | 作者需 `work:editOwn`；具有 `admin:workManage` 的审核/运营/超管可管理其他作品 | 创建字段的任意子集；必须存在 `draft` 或 `rejected` 版本 | 更新后的作品 |
| DELETE | `/works/:id` | `work:deleteOwn`，作者或超管 | 无 | `{ success: true }` |
| POST | `/works/:id/offline` | 需 `work:offlineOwn`，并且是作者或审核/超管 | 无 | `{ success: true }` |
| POST | `/works/:id/republish` | 登录，仅作者且作品已下架 | 无 | `{ success: true }` |

删除为软删除：作品状态改为 `deleted`。

### 8.5 互动接口

| 方法 | 路径 | 认证 | 请求体 | 响应 |
|---|---|---|---|---|
| POST | `/works/:id/like` | 登录 | 无 | `{ liked: boolean }` |
| POST | `/works/:id/favorite` | 登录 | 无 | `{ favorited: boolean }` |
| POST | `/works/:id/comments` | 登录 | `{ "content": "至少 5 个字符" }` | 201，评论对象 |
| POST | `/works/:id/download` | 登录 | 无 | `{ downloads: number }` |

点赞和收藏接口均为切换操作，再次调用会取消。

## 9. 版本与审核接口

### 9.1 版本列表

`GET /works/:workId/versions`，需要登录。仅作品作者、审核管理员、运营管理员或超级管理员可查看。

返回 `WorkVersion[]`，按创建时间倒序。

### 9.2 创建版本

`POST /works/:workId/versions`，作者需要 `work:submit`；具有 `admin:workManage` 的审核、运营或超管也可操作。

```json
{ "changelog": "新增批量导入能力" }
```

`changelog` 至少 10 个字符。服务端自动生成下一个版本号；同一作品已有草稿或待审核版本时返回 400，存在候选版本时返回 409 `CANDIDATE_EXISTS`。

### 9.3 版本流转

| 方法 | 路径 | 权限 | 前置状态 | 请求体/响应 |
|---|---|---|---|---|
| POST | `/works/:workId/versions/:version/submit` | 作者需 `work:submit`；管理员可凭 `admin:workManage` 操作 | `draft` | 返回更新后的版本 |
| POST | `/works/:workId/versions/:version/withdraw` | `work:submit`，作者 | `pending` | 状态退回 `draft` |
| POST | `/works/:workId/versions/:version/approve` | `review:approve` | `pending` | 审核结果对象 |
| POST | `/works/:workId/versions/:version/reject` | `review:reject` | `pending` | `{ "reason": "至少 5 个字符" }` |
| POST | `/works/:workId/versions/:version/modify` | `work:submit`，作者 | `rejected` | 状态退回 `draft` |
| POST | `/works/:workId/versions/:version/publish-candidate` | `work:offlineOwn`，作者 | `candidate=true` | `{ success: true }` |

审核通过响应：

```json
{
  "success": true,
  "type": "published",
  "version": { "version": "v2", "status": "passed" },
  "message": "审核通过，版本已上线"
}
```

`type` 可能为：

- `published`：直接成为线上版本；
- `candidate_base_outdated`：审核期间线上基线已变化，转候选版本；
- `candidate_work_offline`：作品已下架，转候选版本。

## 10. 管理后台接口

`/admin` 下的接口全部需要登录，并继续按接口校验权限。

### 10.1 审核管理

#### GET `/admin/review/queue`

需要 `review:view`。返回待审核项数组，当前最新版结构为嵌套结构：

```ts
interface ReviewQueueItem {
  work: Work & {
    versions: ReviewVersion[]
    attachments: Array<{
      id: string
      name: string
      size: string
      downloads: number
    }>
    comments: []
  }
  version: ReviewVersion
  onlineVersion?: string
  isFirstVersion: boolean
}

interface ReviewVersion {
  version: string
  changelog: string
  date: string
  status: string
  current: boolean
  changelogAuthor?: string
  submittedAt?: string
  reviewedAt?: string
  reviewer?: string
  rejectReason?: string
  baseVersionId?: string
  candidate: boolean
}
```

队列按 `version.submittedAt` 倒序，已删除作品不会进入队列。

#### 其他审核接口

| 方法 | 路径 | 权限 | 参数 | 响应 |
|---|---|---|---|---|
| GET | `/admin/review/events` | `review:view` | `limit`，默认 20、最大 50 | 审核事件数组，含 reviewer |
| GET | `/admin/review/stats` | `review:view` | 无 | `{ pending, approvedToday, rejectedToday, totalWorks }` |

### 10.2 业务领域管理

均需 `admin:domain`。

| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/admin/domains` | 无 | 领域对象数组 |
| POST | `/admin/domains` | `{ "name": "客户服务" }` | 201，领域对象 |
| PUT | `/admin/domains/:id` | `{ "name": "新名称" }` | 更新后的领域对象 |
| DELETE | `/admin/domains/:id` | 无 | `{ success: true }` |

领域对象：`{ id, name, sortOrder, createdAt }`。

### 10.3 标签管理

均需 `admin:tag`。

| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/admin/tags` | 无 | 标签对象数组 |
| POST | `/admin/tags` | `{ "name": "智能体" }` | 201，标签对象 |
| DELETE | `/admin/tags/:id` | 无 | `{ success: true }` |

标签对象：`{ id, name, sortOrder, createdAt }`。

### 10.4 用户与角色管理

| 方法 | 路径 | 权限 | 参数/请求体 | 响应 |
|---|---|---|---|---|
| GET | `/admin/users` | `admin:user` | Query: `role`, `q` | `{ items, stats: { total, byRole } }` |
| PUT | `/admin/users/:id/roles` | `admin:role` | `{ "roles": ["creator", "reviewer"] }` | 更新后的用户和 roles |
| PUT | `/admin/users/:id/role` | `admin:role` | `{ "role": "creator" }` | 旧版单角色兼容接口 |
| GET | `/admin/permission-matrix` | `admin:role` | 无 | 完整角色权限矩阵 |
| PUT | `/admin/permission-matrix/:role` | `admin:role` | `{ "permissions": ["work:read"] }` | `{ role, permissions }`；不能修改 `super_admin` |
| PUT | `/admin/users/:id/account` | `admin:user` | `loginMethod`, `loginAccount`, `password`, `accountStatus` 的任意子集 | 更新后的后台用户对象 |
| POST | `/admin/users/:id/reset-password` | `admin:user` | 无 | `{ success: true, temporaryPassword }` |

`GET /admin/users` 的 `role=all` 表示全部；`q` 搜索姓名、部门和岗位。

### 10.5 作品运营管理

| 方法 | 路径 | 权限 | 参数/前置条件 | 响应 |
|---|---|---|---|---|
| GET | `/admin/works` | `admin:workRead` | Query: `page`, `pageSize`, `status`, `type`, `q` | `{ items, total, page, pageSize, totalPages }` |
| POST | `/admin/works/:id/recommend` | `admin:recommend` | 作品存在 | `{ recommended: boolean }` |
| POST | `/admin/works/:id/offline` | `admin:workManage` | `published` | `{ success: true, status: "offline" }` |
| POST | `/admin/works/:id/republish` | `admin:workManage` | `offline` | `{ success: true, status: "published" }` |
| DELETE | `/admin/works/:id` | `admin:workManage` | 尚未删除 | `{ success: true, status: "deleted" }` |

## 11. 操作日志接口

### 11.1 写入日志

`POST /operation-logs` 已禁用并返回 405。所有关键操作由服务端审计中间件自动记录，客户端不能新增、修改或删除日志。

```json
{
  "module": "审核管理",
  "action": "审核",
  "content": "通过作品 v2",
  "target": "智能问答助手",
  "result": "success",
  "time": "2026-08-10T08:00:00.000Z"
}
```

`module`、`action`、`content` 必填；`result` 只有传 `failed` 时记为失败，其余值均记为成功。

```json
{ "success": true, "id": "log_id" }
```

### 11.2 查询日志

`GET /operation-logs`。审核管理员、运营管理员、超级管理员可访问；非超级管理员只能查看自己的记录。

| Query | 默认值 | 说明 |
|---|---|---|
| `page` | `1` | 页码 |
| `pageSize` | `20` | 1～100 |
| `module` | - | 模块精确匹配 |
| `action` | - | 操作类型精确匹配 |
| `startDate` | - | 开始日期/时间 |
| `endDate` | - | 结束日期，服务端包含当天 23:59:59.999 |
| `keyword` | - | 搜索操作人、内容、对象、日志 ID |
| `operatorId` | - | 仅超级管理员有效 |

响应：`PageResult<OperationLog>`。

### 11.3 导出日志

`GET /operation-logs/export`，仅超级管理员。支持 `module/action/startDate/endDate/keyword` 筛选，返回带 UTF-8 BOM 的 CSV，最多 5000 条。

## 12. 联调示例

```bash
# 1. 登录
curl -X POST "https://aicommunity-test.cdf-hn.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"account":"employee001","password":"******"}'

# 2. 查询作品大厅
curl "https://aicommunity-test.cdf-hn.com/api/works?page=1&pageSize=9&sort=latest"

# 3. 查询当前用户
curl "https://aicommunity-test.cdf-hn.com/api/auth/me" \
  -H "Authorization: Bearer <token>"

# 4. 查询审核队列
curl "https://aicommunity-test.cdf-hn.com/api/admin/review/queue" \
  -H "Authorization: Bearer <token>"
```

## 13. 当前代码注意事项

以下内容是当前实现行为，联调和上线前应特别注意：

1. 生产环境必须配置不少于 32 字符的 `AUTH_SECRET`，缺失时服务会拒绝启动。
2. 所有作品、筛选、附件及后台接口均要求 JWT；演示请求头仅在非生产环境显式设置 `ALLOW_DEMO_AUTH_HEADERS=true` 时可用。
3. 作品编辑写入版本快照，只有审核通过后才会切换线上内容；附件按版本保存并通过鉴权下载接口读取。
4. 用户列表采用字段白名单，密码及密码哈希不会通过任何查询接口返回。
5. 企业微信的 `redirectUri` 必须与企业微信管理后台配置的可信域名/回调地址一致，并且生产环境应使用 HTTPS。

## 14. 接口总表

| 模块 | 数量 |
|---|---:|
| 系统状态 | 1 |
| 登录与用户（含企微及兼容路径） | 11 |
| 文件上传 | 4 |
| 作品 | 14 |
| 版本与审核流转 | 8 |
| 管理后台 | 22 |
| 操作日志 | 3 |
| **合计** | **63** |
