# AI 社区平台 API 文档

> 版本：v2.4 ｜ 更新日期：2026-08-19 ｜ Base URL：`/api`

## 版本记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v2.4 | 2026-08-19 | 移除冗余权限 `review:forceOffline`；管理员对任意作品的上架、下架和删除统一由 `admin:workManage` 控制 |
| v2.3 | 2026-08-18 | 明确权限矩阵只有保存后才生效；同一用户拥有多个角色时有效权限取各角色权限并集；前端操作入口同步采用服务端有效权限 |
| v2.2 | 2026-08-18 | 超级管理员固定拥有系统全部权限且不可配置；拥有 `admin:workManage` 权限的角色可查看并下载他人作品已有附件 |
| v2.1 | 2026-08-18 | 附件上限调整为 100MB（含边界值）；更新说明至少 20 个字符；审核驳回理由最多 200 个字符；标签名称最多 30 个字符；删除态作品禁止继续操作；上下架纳入服务端操作日志 |
| v2.0 | 2026-08-10 | 形成当前接口文档基线 |

## 目录

- [通用说明](#通用说明)
  - [认证机制](#认证机制)
  - [统一响应格式](#统一响应格式)
  - [错误码](#错误码)
  - [角色与权限](#角色与权限)
- [1. 系统与健康检查](#1-系统与健康检查)
- [2. 认证模块](#2-认证模块)
- [3. 用户内容查询](#3-用户内容查询)
- [4. 文件上传](#4-文件上传)
- [5. 作品模块](#5-作品模块)
- [6. 版本模块](#6-版本模块)
- [7. 后台管理模块](#7-后台管理模块)
- [8. 操作日志模块](#8-操作日志模块)

---

## 通用说明

### 认证机制

除 `GET /api/health`、`GET /api/works`、`GET /api/works/recommended`、`GET /api/works/:id`、企业微信登录相关接口外，所有接口均需登录。

**方式 1（推荐）：JWT Bearer Token**

```
Authorization: Bearer <token>
```

Token 通过 `POST /api/auth/login` 或企业微信扫码登录获取，payload 包含：

```json
{
  "userId": "u9",
  "roles": ["super_admin"],
  "name": "周涛",
  "loginType": "password"
}
```

**方式 2（演示模式，兼容旧前端）：自定义 Header**

```
x-user-id: u9
x-user-roles: super_admin,operator      # 多角色逗号分隔（优先）
x-user-role: super_admin                # 单角色（兼容旧版）
x-user-name: 周涛
```

### 统一响应格式

- **成功**：直接返回业务数据（JSON 对象或数组）
- **失败**：返回统一错误结构

```json
{
  "error": "错误描述信息",
  "code": "ERROR_CODE"
}
```

### 错误码

| code              | HTTP 状态 | 含义                       |
| ----------------- | -------- | ------------------------- |
| `VALIDATION_ERROR`| 400      | 参数校验失败                |
| `BAD_REQUEST`     | 400      | 缺少必要字段 / 请求格式错误  |
| `BUSINESS_ERROR`  | 400      | 业务规则校验失败             |
| `UNAUTHORIZED`    | 401      | 未登录或 token 过期          |
| `FORBIDDEN`       | 403      | 权限不足 / 账号禁用 / 锁定   |
| `NOT_FOUND`       | 404      | 资源不存在                  |
| `CANDIDATE_EXISTS`| 409      | 已存在候选版本，无法新建版本  |

### 角色与权限

**5 个系统角色**（平行可叠加模型，彼此独立、互不继承）：

| 角色           | 标识           | 说明                       |
| ------------- | ------------- | ------------------------- |
| 普通用户        | `user`        | 浏览、互动、创建作品          |
| 创作者          | `creator`     | 管理自己的作品及版本          |
| 审核管理员       | `reviewer`    | 审核版本、查看审核相关统计     |
| 运营管理员       | `operator`    | 业务领域/标签/用户/推荐/统计  |
| 超级管理员       | `super_admin` | 全部权限 + 权限配置 + 角色分配 |

**权限矩阵**（一个用户可拥有多个角色，权限取并集）：

| 权限标识              | user | creator | reviewer | operator | super_admin |
| -------------------- | ---- | ------- | -------- | -------- | ----------- |
| `work:read`          | ✓    | ✓       | ✓        | ✓        | ✓           |
| `work:create`        | ✓    | ✓       |          |          | ✓           |
| `work:submit`        |      | ✓       |          |          | ✓           |
| `work:editOwn`       |      | ✓       |          |          | ✓           |
| `work:deleteOwn`     |      | ✓       |          |          | ✓           |
| `work:offlineOwn`    |      | ✓       |          |          | ✓           |
| `review:view`        |      |         | ✓        |          | ✓           |
| `review:approve`     |      |         | ✓        |          | ✓           |
| `review:reject`      |      |         | ✓        |          | ✓           |
| `admin:domain`       |      |         |          | ✓        | ✓           |
| `admin:tag`          |      |         |          | ✓        | ✓           |
| `admin:user`         |      |         |          | ✓        | ✓           |
| `admin:recommend`    |      |         |          | ✓        | ✓           |
| `admin:stats`        |      |         |          | ✓        | ✓           |
| `admin:role`         |      |         |          |          | ✓           |

---

## 1. 系统与健康检查

### `GET /api/health`

健康检查，返回服务状态和登录方式可用性。**无需登录**。

**响应示例**

```json
{
  "status": "ok",
  "timestamp": "2026-08-07T10:00:00.000Z",
  "auth": {
    "wecom": true,
    "password": true
  }
}
```

---

## 2. 认证模块

### 2.1 `POST /api/auth/login`

账号密码登录。

**请求体**

```json
{
  "account": "admin",        // 登录账号或工号
  "password": "Admin@2026"
}
```

**成功响应（200）**

```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "u9",
    "name": "周涛",
    "role": "super_admin",
    "roles": ["super_admin"],
    "department": "IT部",
    "position": "系统管理员",
    "avatarColor": "#dc2626",
    "avatar": null,
    "employeeId": "EMP089"
  }
}
```

**错误**：账号不存在/未开通密码登录 → 401 `INVALID_CREDENTIALS`；账号禁用 → 403 `ACCOUNT_DISABLED`；账号锁定 → 403 `ACCOUNT_LOCKED`。

**登录失败锁定策略**：连续失败 5 次锁定 15 分钟。

---

### 2.2 `POST /api/auth/logout`

退出登录。**需登录**。JWT 无状态，前端丢弃 token 即可，此接口用于记录登出事件。

**响应**：`{ "success": true, "message": "已退出登录" }`

---

### 2.3 `GET /api/auth/me`

获取当前登录用户信息。**需登录**。

**响应示例**

```json
{
  "id": "u9",
  "name": "周涛",
  "role": "super_admin",
  "roles": ["super_admin"],
  "department": "IT部",
  "position": "系统管理员",
  "avatarColor": "#dc2626",
  "avatar": null,
  "employeeId": "EMP089",
  "loginMethod": "both",
  "accountStatus": "active",
  "lastLoginAt": "2026-08-07T09:30:00.000Z"
}
```

---

### 2.4 `POST /api/auth/switch-role`

切换/设置当前用户的角色。**需登录**。v1.7 支持多角色。

**请求体**

```json
{
  "roles": ["reviewer", "operator"]   // 多角色
}
```

或兼容旧版单角色：

```json
{
  "role": "reviewer"
}
```

**响应**：返回更新后的用户对象（含 `roles` 数组）和重新签发的 `token`。

**有效角色**：`user` / `creator` / `reviewer` / `operator` / `super_admin`

---

### 2.5 `GET /api/auth/wecom/status`

获取企业微信登录是否启用及扫码配置。**无需登录**。

**响应示例（已启用）**

```json
{
  "enabled": true,
  "scan": {
    "corpId": "ww1234567890",
    "agentId": "1000002",
    "redirectUri": "https://aicommunity-test.cdf-hn.com/api/auth/wecom/callback"
  }
}
```

**响应示例（未启用）**

```json
{
  "enabled": false,
  "scan": null
}
```

启用条件：环境变量 `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_SECRET`、`WECOM_REDIRECT_URI` 四项全部配置。

---

### 2.6 `GET /api/auth/wecom/url`

获取企业微信 OAuth 授权 URL，前端跳转过去扫码。

**查询参数**

| 参数     | 类型    | 默认     | 说明                          |
| ------- | ------ | ------- | ----------------------------- |
| silent  | string | `true`  | 是否静默授权（snsapi_base）    |
| state   | string | `ai-community` | OAuth state 参数         |

**响应**：`{ "url": "https://open.weixin.qq.com/...", "silent": true }`

---

### 2.7 `GET /api/auth/wecom/callback`

企业微信 OAuth 回调。code 换 userid → 创建/更新用户 → 签发 JWT → 302 重定向到前端。

**查询参数**：`code`（必填）、`state`、`redirect`（前端目标路径，默认 `/`）

**重定向**：`{FRONTEND_ORIGIN}{redirect}#access_token={token}`，token 放在 URL hash 中避免被日志记录。

**错误重定向**：`/login?error=account_disabled` 或 `/login?error=wecom_failed`

**首次登录自动创建用户**：默认角色 `user`，登录方式 `wecom`，同步写入 `UserRole` 关联表。

---

## 3. 用户内容查询

### 3.1 `GET /api/users/:id/works`

兼容路径：`GET /api/auth/users/:id/works`。

获取指定用户的作品列表。**需登录**。仅返回未删除作品。

**响应**：作品数组（含 `tags`、`versions`，按创建时间倒序）。

---

### 3.2 `GET /api/users/:id/favorites`

兼容路径：`GET /api/auth/users/:id/favorites`。

获取指定用户的收藏作品列表。**需登录**。

**响应**：作品数组（含 `tags`）。

---

## 4. 文件上传

所有上传接口**需登录**。文件存储在 `uploads/` 目录下，通过 `/uploads/...` 静态访问。

### 4.1 `POST /api/upload/cover`

上传封面图片。**multipart/form-data**，字段名 `file`。

**限制**：仅图片格式（jpg/png/webp/gif），最大 5MB。

**响应（200）**

```json
{
  "url": "/uploads/covers/abc123.jpg",
  "name": "cover.jpg",
  "size": "245.3 KB"
}
```

---

### 4.2 `POST /api/upload/attachment`

上传附件。**multipart/form-data**，字段名 `file`。

**限制**：最大 100MB（包含 100MB 边界值），禁止 `.exe/.bat/.cmd/.sh/.js/.ts` 等可执行脚本。

**响应（200）**

```json
{
  "id": "abc123",
  "url": "/uploads/attachments/abc123.zip",
  "name": "源码.zip",
  "size": "2.4 MB",
  "storedName": "abc123.zip"
}
```

---

### 4.3 `GET /api/upload/attachment/:filename`

下载已有附件。作者、拥有 `admin:workManage` 权限的角色，以及已发布作品当前版本的访问者可以下载。

---

### 4.4 `DELETE /api/upload/attachment/:filename`

生产网关兼容调用：`POST /api/upload/attachment/:filename/delete`，权限、参数和响应完全相同。前端默认使用该 POST 路径。

删除未关联到作品的附件。

**路径参数**：`filename`（存储文件名）

**响应**：`{ "success": true }` 或 404 `NOT_FOUND`

---

## 5. 作品模块

### 5.1 `GET /api/works`

作品大厅列表。**无需登录**。仅返回已发布作品。

**查询参数**

| 参数       | 类型   | 默认       | 说明                                      |
| --------- | ------ | ---------- | ----------------------------------------- |
| type      | string | `all`      | 作品类型：skill/app/agent/prompt/workflow/case |
| domain    | string | `all`      | 业务领域                                   |
| tag       | string | -          | 标签（支持单个或数组）                      |
| sort      | string | `latest`   | 排序：latest/likes/favorites/downloads     |
| q         | string | -          | 关键词（标题/简介/作者）                    |
| page      | number | 1          | 页码                                       |
| pageSize  | number | 9          | 每页数量（最大 50）                         |

**响应示例**

```json
{
  "items": [{ "id": "w1", "title": "...", "tags": ["自动化"] }],
  "total": 50,
  "page": 1,
  "pageSize": 9,
  "totalPages": 6
}
```

---

### 5.2 `GET /api/works/recommended`

获取运营推荐作品（最多 3 个）。**无需登录**。

---

### 5.3 `GET /api/works/:id`

获取作品详情。**无需登录**。每次访问浏览量 +1。

**响应**：完整作品对象（含 `versions`、`attachments`、`comments`、`tags`、`likedByMe`、`favoritedByMe`）。`coreAbilities` 已 parse 为数组。

**错误**：作品不存在 → 404 `NOT_FOUND`

---

### 5.4 `POST /api/works`

创建作品。**需登录**，需 `work:create` 权限。

**请求体**

```json
{
  "title": "自动报表生成 Skill",
  "type": "skill",
  "category": "财务",
  "tags": ["自动化", "报表生成"],
  "intro": "作品简介",
  "usage": "使用方法",
  "businessValue": "可选",
  "scene": "可选",
  "coreAbilities": ["多数据源接入"],
  "coverUrl": "/uploads/covers/xxx.jpg",
  "changelog": "初始版本"
}
```

**业务规则**：
- 首次创建自动生成 `v1` 版本（draft 状态）
- 普通用户首次创建作品自动获得 `creator` 角色

**响应（201）**：作品详情对象

---

### 5.5 `PUT /api/works/:id`

更新作品基础信息。**需登录**，需 `work:editOwn` 权限。仅作者本人可编辑，已删除作品不可编辑。

**请求体**：所有字段可选（`createWorkSchema.partial()`）

**响应**：更新后的作品对象

---

### 5.6 `DELETE /api/works/:id`

软删除作品（状态 → `deleted`）。**需登录**，需 `work:deleteOwn` 权限。作者本人或超级管理员可删除。

**响应**：`{ "success": true }`

---

### 5.7 `POST /api/works/:id/offline`

下架作品。**需登录**，需 `work:offlineOwn` 权限。作者本人或审核管理员/超级管理员可下架。

**响应**：`{ "success": true }`

---

### 5.8 `POST /api/works/:id/republish`

重新上架已下架作品。**需登录**。仅作者本人，且作品状态为 `offline`。

**业务规则**：若有候选版本（审核通过但因作品下架未自动上线），手动上线该候选版本。

**响应**：`{ "success": true }`

---

### 5.9 `POST /api/works/:id/like`

点赞/取消点赞（toggle）。**需登录**。

**响应**：`{ "liked": true }` 或 `{ "liked": false }`

---

### 5.10 `POST /api/works/:id/favorite`

收藏/取消收藏（toggle）。**需登录**。

**响应**：`{ "favorited": true }` 或 `{ "favorited": false }`

---

### 5.11 `POST /api/works/:id/comments`

发表评论。**需登录**。

**请求体**：`{ "content": "评论内容（至少 5 个字符）" }`

**响应（201）**：评论对象

---

## 6. 版本模块

所有版本接口**需登录**，路径前缀 `/api/works/:workId/versions`。

### 6.1 `GET /api/works/:workId/versions`

获取作品版本列表。仅作者本人或审核管理员/超级管理员可查看。

**响应**：版本数组（按创建时间倒序）

---

### 6.2 `POST /api/works/:workId/versions`

创建新版本。需 `work:submit` 权限。仅作者本人。

**请求体**：`{ "changelog": "更新说明（必填）" }`

**业务规则**：
- 服务端原子生成版本号（v1 → v2 → v3...）
- 单候选版本限制：若已存在 draft 或 pending 版本则拒绝创建（409 `CANDIDATE_EXISTS`）
- 记录 `baseVersionId`（创建时的线上版本号，用于审核通过时并发校验）

**响应（201）**：版本对象

---

### 6.3 `POST /api/works/:workId/versions/:version/submit`

提交版本审核（draft → pending）。需 `work:submit` 权限。仅作者本人。

**响应**：更新后的版本对象，同时创建 `ReviewEvent` 记录。

---

### 6.4 `POST /api/works/:workId/versions/:version/withdraw`

撤回版本（pending → draft）。需 `work:submit` 权限。仅作者本人。

**响应**：更新后的版本对象

---

### 6.5 `POST /api/works/:workId/versions/:version/approve`

审核通过。需 `review:approve` 权限。

**业务规则（三重校验）**：
1. 作品未删除
2. `baseVersionId` 与当前线上版本一致
3. 作品未下架

**审核结果类型**：

| type                     | 含义                                                     |
| ------------------------ | ------------------------------------------------------- |
| `published`              | 审核通过，版本已上线                                       |
| `candidate_base_outdated`| 审核通过，但期间已有其他版本先上线，本版本标记为候选版本     |
| `candidate_work_offline` | 审核通过，但作品已下架，本版本标记为候选版本，作者可重新上架后手动上线 |

**响应示例**

```json
{
  "success": true,
  "type": "published",
  "version": "v3",
  "message": "审核通过，版本已上线"
}
```

---

### 6.6 `POST /api/works/:workId/versions/:version/reject`

驳回版本。需 `review:reject` 权限。已删除作品禁止审核。

**请求体**：`{ "reason": "驳回理由（至少 5 个字符）" }`

**响应**：更新后的版本对象（含 `rejectReason`、`reviewedAt`、`reviewerId`）

---

### 6.7 `POST /api/works/:workId/versions/:version/publish-candidate`

手动上线候选版本。需 `work:offlineOwn` 权限。仅作者本人。

**业务规则**：将候选版本设为当前线上版本，作品状态改为 `published`。

**响应**：`{ "success": true }`

---

## 7. 后台管理模块

所有后台接口**需登录**，路径前缀 `/api/admin`。

### 7.1 审核管理

#### `GET /api/admin/review/queue`

获取审核队列。需 `review:view` 权限。已删除作品的待审核版本自动排除。

**响应示例**

```json
[
  {
    "workId": "w4",
    "workTitle": "数据治理工作流",
    "workType": "workflow",
    "authorName": "张伟",
    "department": "研发中心",
    "version": "v3",
    "changelog": "新增质量监控面板",
    "submittedAt": "2026-08-07T08:00:00.000Z",
    "baseVersionId": "v2",
    "onlineVersion": "v2",
    "isFirstVersion": false
  }
]
```

---

#### `GET /api/admin/review/events`

获取审核事件日志。需 `review:view` 权限。

**查询参数**：`limit`（默认 20，最大 50）

**响应**：审核事件数组（含 reviewer 关联），按时间倒序。

---

#### `GET /api/admin/review/stats`

获取审核相关数据统计。需 `review:view` 权限。

**响应示例**

```json
{
  "pending": 3,
  "approvedToday": 5,
  "rejectedToday": 1,
  "totalWorks": 42
}
```

---

### 7.2 业务领域管理

需 `admin:domain` 权限。

| 方法       | 路径                  | 说明                | 请求体                          |
| ---------- | -------------------- | ------------------- | ------------------------------ |
| `GET`      | `/api/admin/domains` | 业务领域列表         | -                              |
| `POST`     | `/api/admin/domains` | 创建业务领域         | `{ "name": "财务" }`           |
| `PUT`      | `/api/admin/domains/:id` | 更新业务领域     | `{ "name": "财务新名称" }`     |
| `DELETE`   | `/api/admin/domains/:id` | 删除业务领域     | -                              |

---

### 7.3 标签管理

需 `admin:tag` 权限。

| 方法       | 路径                  | 说明          | 请求体                |
| ---------- | -------------------- | ------------- | -------------------- |
| `GET`      | `/api/admin/tags`    | 标签列表       | -                    |
| `POST`     | `/api/admin/tags`    | 创建标签       | `{ "name": "自动化" }` |
| `DELETE`   | `/api/admin/tags/:id`| 删除标签       | -                    |

---

### 7.4 用户管理

#### `GET /api/admin/users`

获取用户列表（带多角色信息）。需 `admin:user` 权限。

**查询参数**

| 参数  | 类型   | 说明                              |
| ----- | ------ | --------------------------------- |
| role  | string | 按角色筛选（匹配 assignedRoles 任一）|
| q     | string | 关键词（姓名/部门/岗位）            |

**响应示例**

```json
{
  "items": [
    {
      "id": "u9",
      "name": "周涛",
      "department": "IT部",
      "position": "系统管理员",
      "role": "super_admin",
      "roles": ["super_admin"],
      "assignedRoles": [{ "id": "...", "userId": "u9", "role": "super_admin" }],
      "_count": { "worksAuthored": 3 }
    }
  ],
  "stats": {
    "total": 18,
    "byRole": {
      "user": 7,
      "creator": 7,
      "reviewer": 2,
      "operator": 1,
      "super_admin": 1
    }
  }
}
```

---

#### `PUT /api/admin/users/:id/roles`

分配用户角色（多角色）。需 `admin:role` 权限（仅超级管理员）。

**请求体**

```json
{
  "roles": ["reviewer", "operator"]
}
```

**业务规则**：先删后建 `UserRole` 关联表，同时更新 `User.role` 为主角色（roles[0]）。至少分配一个角色。

**响应**：更新后的用户对象（含 `roles` 数组）

---

#### `PUT /api/admin/users/:id/role`

分配用户角色（单角色，兼容旧版）。需 `admin:role` 权限。

**请求体**：`{ "role": "reviewer" }`

**响应**：更新后的用户对象（`roles` 为单元素数组）

---

#### `GET /api/admin/permission-matrix`

获取权限矩阵。需 `admin:role` 权限。

**响应**：`ROLE_PERMISSIONS` 对象（角色 → 权限列表映射）。`super_admin` 始终返回系统全部权限，不读取数据库配置，也不允许通过更新接口修改。

---

### 7.5 运营推荐

#### `POST /api/admin/works/:id/recommend`

切换作品推荐状态。需 `admin:recommend` 权限。

**响应**：`{ "recommended": true }` 或 `{ "recommended": false }`

---

### 7.6 管理员作品管理（v1.8）

允许管理员管理平台任意作品，绕过 `work:deleteOwn`/`work:offlineOwn` 的"仅自己"限制。需 `admin:workManage` 权限。

| 方法       | 路径                                | 说明                          | 业务规则                          |
| ---------- | ----------------------------------- | ----------------------------- | --------------------------------- |
| `POST`     | `/api/admin/works/:id/offline`      | 管理员下架作品                 | 仅 published 作品可下架            |
| `POST`     | `/api/admin/works/:id/republish`    | 管理员上架作品                 | 仅 offline 作品可上架；有候选版本则手动上线 |
| `DELETE`   | `/api/admin/works/:id`              | 管理员软删除作品               | 任意状态可删除；已删除不可重复操作   |

**响应示例**

```json
{ "success": true, "status": "offline" }
```

---

## 8. 操作日志模块

> **v2.0 新增**：操作日志后端持久化。前端 14 处埋点改为调用后端 API，替代原 localStorage 写入方案。
>
> **数据模型**：`OperationLog`（id / time / operatorId / operatorName / department / role / module / action / content / target / ip / result / createdAt），不建立外键关联，避免用户删除影响日志留存。日志保留 180 天后归档。
>
> **权限规则**：
> - 记录日志：任意已登录用户（系统自动调用，前端不可手动新增/修改/删除）
> - 查询日志：审核管理员 / 运营管理员可查看**自身**记录；超级管理员可查看**全部**
> - 导出日志：仅超级管理员
>
> **安全设计**：操作人信息（id / 姓名 / 部门 / 角色 / IP / 时间）由后端从 JWT + 数据库自动获取，前端不可伪造；权限隔离在后端强制 `WHERE operatorId = req.userId`。

### 8.1 `POST /api/operation-logs` —— 记录操作日志

**权限**：已登录（任意角色）

**说明**：系统自动调用，前端埋点 fire-and-forget。操作人 id/姓名/部门/角色/IP 由后端自动填充，前端仅需传 module/action/content/target。

**请求体**

| 字段       | 类型     | 必填 | 说明                                          |
| ---------- | -------- | ---- | --------------------------------------------- |
| `module`   | string   | 是   | 模块：作品大厅/作品发布/审核管理/作品详情/个人中心/后台管理/登录认证 |
| `action`   | string   | 是   | 操作类型：创建/更新/删除/审核/上架下架/登录登出/角色分配 |
| `content`  | string   | 是   | 操作内容描述                                  |
| `target`   | string   | 否   | 操作对象（如作品标题、用户姓名），默认空字符串 |
| `result`   | string   | 否   | `success`（默认）/ `failed`                   |
| `time`     | string   | 否   | 操作时间（ISO），默认当前时间                  |

**响应示例**

```json
{
  "success": true,
  "id": "clk1a2b3c4d5e6f7g8h9j0"
}
```

**错误码**

| 场景                 | HTTP | code           |
| -------------------- | ---- | -------------- |
| 未登录               | 401  | `UNAUTHORIZED` |
| 缺少必要字段         | 400  | `BAD_REQUEST`  |

---

### 8.2 `GET /api/operation-logs` —— 查询操作日志（分页 + 筛选）

**权限**：审核管理员 / 运营管理员（仅自身记录）/ 超级管理员（全部记录）

**查询参数**

| 参数         | 类型   | 默认 | 说明                                       |
| ------------ | ------ | ---- | ------------------------------------------ |
| `page`       | int    | 1    | 页码（从 1 开始）                          |
| `pageSize`   | int    | 20   | 每页条数（最大 100）                       |
| `module`     | string | -    | 按模块精确过滤                              |
| `action`     | string | -    | 按操作类型精确过滤                          |
| `startDate`  | string | -    | 起始日期（YYYY-MM-DD，含当天）              |
| `endDate`    | string | -    | 截止日期（YYYY-MM-DD，含当天 23:59:59）     |
| `keyword`    | string | -    | 关键词搜索（匹配操作人/操作内容/操作对象/日志ID） |
| `operatorId` | string | -    | 按操作人 ID 过滤（仅超管可用）              |

**响应示例**

```json
{
  "items": [
    {
      "id": "clk1a2b3c4d5e6f7g8h9j0",
      "time": "2026-08-10 10:15:32",
      "operatorId": "u7",
      "operatorName": "王强",
      "department": "运营部",
      "role": "审核管理员",
      "module": "审核管理",
      "action": "审核",
      "content": "通过版本审核",
      "target": "自动报表生成 Skill v4",
      "ip": "10.12.3.45",
      "result": "success"
    }
  ],
  "total": 128,
  "page": 1,
  "pageSize": 20,
  "totalPages": 7
}
```

**业务规则**

- 非超级管理员请求时，后端强制追加 `operatorId = 当前用户ID` 过滤条件，前端无法绕过
- 时间按 `time` 字段（操作时间）过滤，非 `createdAt`
- 结果按 `time DESC` 排序

**错误码**

| 场景                 | HTTP | code           |
| -------------------- | ---- | -------------- |
| 未登录               | 401  | `UNAUTHORIZED` |
| 权限不足（普通用户/创作者） | 403  | `FORBIDDEN`    |

---

### 8.3 `GET /api/operation-logs/export` —— 导出操作日志 CSV

**权限**：仅超级管理员

**说明**：导出当前筛选条件下的日志为 CSV 文件（最多 5000 条），带 BOM 头防止 Excel 中文乱码。

**查询参数**：同 8.2（不含分页参数）

**响应**

- **Content-Type**：`text/csv; charset=utf-8`
- **Content-Disposition**：`attachment; filename="operation-logs-2026-08-10.csv"`
- **Body**：CSV 文本（首字节为 `\ufeff` BOM）

**CSV 列顺序**：日志ID / 操作时间 / 操作人 / 部门 / 角色 / 模块 / 操作类型 / 操作内容 / 操作对象 / IP地址 / 结果

**错误码**

| 场景                 | HTTP | code           |
| -------------------- | ---- | -------------- |
| 未登录               | 401  | `UNAUTHORIZED` |
| 非超级管理员         | 403  | `FORBIDDEN`    |

**前端调用示例**（需带 JWT 鉴权头）

```typescript
const blob = await exportOperationLogs({ module: '审核管理' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `操作日志_${new Date().toISOString().slice(0, 10)}.csv`
a.click()
```

---

## 附录：环境变量配置

| 变量名             | 说明                                       | 示例                                              |
| ------------------ | ------------------------------------------ | ------------------------------------------------- |
| `DATABASE_URL`     | 数据库连接字符串                            | `file:./prisma/dev.db`（SQLite）/ PostgreSQL 连接串 |
| `JWT_SECRET`       | JWT 签名密钥                                | `your-secret-key`                                 |
| `JWT_EXPIRES_IN`   | Token 过期时间                              | `7d`                                              |
| `PORT`             | 后端服务端口                                | `3001`                                            |
| `FRONTEND_ORIGIN`  | 前端地址（CORS + 企微回调重定向）            | `https://aicommunity-test.cdf-hn.com`             |
| `CORS_ORIGINS`     | CORS 允许来源（逗号分隔，优先于 FRONTEND_ORIGIN）| `http://localhost:5173,https://xxx.com`          |
| `WECOM_CORP_ID`    | 企业微信企业 ID                              | `ww1234567890`                                    |
| `WECOM_AGENT_ID`   | 企业微信应用 ID                              | `1000002`                                         |
| `WECOM_SECRET`     | 企业微信应用 Secret                          | `xxx`                                             |
| `WECOM_REDIRECT_URI`| 企业微信 OAuth 回调地址                     | `https://aicommunity-test.cdf-hn.com/api/auth/wecom/callback` |

> **注意**：`WECOM_*` 四项环境变量必须全部配置，企业微信登录才会启用。环境变量在运行时动态读取（`wecom.ts` 的 `getConfig()`），确保 `dotenv.config()` 在 `server.ts` 入口最先执行。
