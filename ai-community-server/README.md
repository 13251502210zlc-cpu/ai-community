# AI 社区平台后端服务

基于 **Node.js + Express + TypeScript + Prisma + SQLite** 构建，实现 PRD v1.3 全部业务规则。

## 技术栈

- **运行时**: Node.js + Express + TypeScript
- **ORM**: Prisma（SQLite 开发 / PostgreSQL 生产）
- **校验**: Zod
- **日志**: Morgan

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 生成 Prisma Client
npm run prisma:generate

# 3. 创建数据库并执行迁移（首次）
npm run prisma:migrate

# 4. 填充种子数据
npm run seed

# 5. 启动开发服务（热重载）
npm run dev
```

服务默认运行在 http://localhost:3001

## 切换到 PostgreSQL

修改 `.env`：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ai_community?schema=public"
```

并将 `prisma/schema.prisma` 中 `provider = "sqlite"` 改为 `provider = "postgresql"`，重新执行迁移即可。

## 核心业务规则（PRD v1.3）

### 1. 版本号生成（服务端原子）
- 规则：v1, v2, v3 ... 递增，不复用已删除/已驳回版本号
- 实现：`src/lib/version-service.ts` `generateNextVersionNumber()` 在事务内查询最大版本号 +1

### 2. 单候选版本限制
- 规则：一个作品同一时间最多存在一个活动候选版本（草稿或待审核）
- 实现：`canCreateNewVersion()` 校验，前端创建新版本时返回 409 Conflict

### 3. base_version_id 校验
- 规则：编辑已发布作品生成的新版本，审核通过时校验创建时记录的线上版本号是否仍为当前版本
- 实现：`approveVersion()` 三重校验之一，不一致则标记为候选版本不执行替换

### 4. 已删除作品禁止审核
- 规则：作品软删除后，待审核版本自动从队列移除
- 实现：审核队列查询 `where: { status: { not: 'deleted' } }`，审核接口前置校验

### 5. 已下架作品不自动上架
- 规则：审核通过时若作品已下架，仅标记为候选版本，作品状态保持已下架
- 实现：作者可通过 `/works/:id/republish` 重新上架后手动上线候选版本

### 6. RBAC 平行可叠加模型
- 五角色（普通用户/创作者/审核管理员/运营管理员/超级管理员）彼此独立、互不继承
- 多角色权限取并集
- 实现：`src/lib/permissions.ts`

## API 概览

### 认证与用户
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/auth/me` | 当前登录用户 | 登录 |
| POST | `/api/auth/switch-role` | 切换角色（演示用） | 登录 |
| GET | `/api/users/:id/works` | 用户的作品列表（兼容 `/api/auth/users/:id/works`） | 登录 |
| GET | `/api/users/:id/favorites` | 用户收藏的作品（兼容 `/api/auth/users/:id/favorites`） | 登录 |

### 作品
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/works` | 作品大厅（三层筛选） | 公开 |
| GET | `/api/works/recommended` | 运营推荐 | 公开 |
| GET | `/api/works/:id` | 作品详情 | 公开 |
| POST | `/api/works` | 创建作品（首次创建自动获得创作者角色） | work:create |
| PUT | `/api/works/:id` | 更新作品基础信息 | work:editOwn |
| DELETE | `/api/works/:id` | 软删除作品 | work:deleteOwn |
| POST | `/api/works/:id/offline` | 下架作品 | work:offlineOwn |
| POST | `/api/works/:id/republish` | 重新上架 | 作者本人 |
| POST | `/api/works/:id/like` | 点赞/取消 | 登录 |
| POST | `/api/works/:id/favorite` | 收藏/取消 | 登录 |
| POST | `/api/works/:id/comments` | 发表评论 | 登录 |

### 版本管理
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/works/:workId/versions` | 版本列表 | 作者/审核员 |
| POST | `/api/works/:workId/versions` | 创建新版本（原子生成版本号） | work:submit |
| POST | `/api/works/:workId/versions/:version/submit` | 提交审核 | work:submit |
| POST | `/api/works/:workId/versions/:version/withdraw` | 撤回版本 | work:submit |
| POST | `/api/works/:workId/versions/:version/approve` | 审核通过（三重校验） | review:approve |
| POST | `/api/works/:workId/versions/:version/reject` | 驳回版本 | review:reject |
| POST | `/api/works/:workId/versions/:version/publish-candidate` | 手动上线候选版本 | work:offlineOwn |

### 后台管理
| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/admin/review/queue` | 审核队列 | review:view |
| GET | `/api/admin/review/events` | 审核事件日志 | review:view |
| GET | `/api/admin/review/stats` | 审核统计 | review:view |
| GET/POST/PUT/DELETE | `/api/admin/domains` | 业务领域管理 | admin:domain |
| GET/POST/DELETE | `/api/admin/tags` | 标签管理 | admin:tag |
| GET | `/api/admin/users` | 用户列表（带统计） | admin:user |
| PUT | `/api/admin/users/:id/role` | 分配用户角色 | admin:role |
| GET | `/api/admin/permission-matrix` | 权限矩阵 | admin:role |
| POST | `/api/admin/works/:id/recommend` | 切换推荐 | admin:recommend |

## 鉴权方式（演示）

当前简化版通过 HTTP Header 传递用户标识：

```
x-user-id: u1
x-user-role: creator
x-user-name: 李明
```

正式环境应替换为 JWT / Session。

## 默认账号（seed 后）

| ID | 姓名 | 部门 | 角色 |
|----|------|------|------|
| u1 | 李明 | 财务部 | 创作者 |
| u2 | 王芳 | 客服中心 | 创作者 |
| u3 | 张伟 | 研发中心 | 创作者 |
| u4 | 赵静 | 运营部 | 普通用户 |
| u5 | 陈强 | 审计部 | 审核管理员 |
| u6 | 林娜 | IT 部 | 超级管理员 |

## 项目结构

```
ai-community-server/
├── prisma/
│   └── schema.prisma          # 数据模型
├── src/
│   ├── lib/
│   │   ├── prisma.ts          # Prisma 客户端单例
│   │   ├── permissions.ts     # RBAC 权限矩阵
│   │   ├── auth.ts            # 认证与权限中间件
│   │   ├── error.ts           # 错误处理
│   │   └── version-service.ts # 版本号生成 + 三重校验
│   ├── routes/
│   │   ├── works.ts           # 作品 + 互动
│   │   ├── versions.ts        # 版本管理
│   │   ├── admin.ts           # 后台管理
│   │   └── users.ts           # 用户与认证
│   ├── app.ts                 # Express 应用
│   ├── server.ts              # 启动入口
│   ├── seed.ts                # 种子数据
│   └── types.ts               # 共享类型
├── .env
├── package.json
└── tsconfig.json
```
