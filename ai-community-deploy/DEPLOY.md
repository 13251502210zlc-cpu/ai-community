# AI 社区平台 - 部署说明

## 环境要求

- Node.js >= 18
- npm 或 pnpm
- Nginx（反向代理 + 静态资源）
- PM2（进程管理，可选但推荐）
- SQLite（默认，零配置）或 PostgreSQL

## 目录结构

```
ai-community-deploy/
├── apps/
│   ├── api/                 # 后端
│   │   ├── dist/            # 编译后的 JS（已构建）
│   │   ├── prisma/          # 数据库 schema + migrations
│   │   ├── uploads/         # 上传文件目录（运行时生成）
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .env             # 环境变量（已配置企微）
│   └── web/                 # 前端
│       ├── dist/            # 构建产物（已构建）
│       └── package.json
├── ecosystem.config.cjs     # PM2 配置
├── nginx.conf.example       # Nginx 配置示例
└── DEPLOY.md                # 本文件
```

## 部署步骤

### 1. 上传代码包到服务器

```bash
# 假设部署到 /opt/ai-community
scp ai-community-deploy.zip user@server:/opt/
ssh user@server
cd /opt && unzip ai-community-deploy.zip && mv ai-community-deploy ai-community
cd /opt/ai-community
```

### 2. 安装后端依赖 + 初始化数据库

```bash
cd apps/api

# 安装依赖
npm install --production

# 生成 Prisma Client
npx prisma generate

# 初始化数据库 + 种子数据（首次部署执行）
npx prisma db push
npx prisma db seed
# 或直接：node dist/seed.js
```

### 3. 配置环境变量

编辑 `apps/api/.env`，确认以下配置：

```bash
DATABASE_URL="file:./dev.db"
PORT=3001
FRONTEND_ORIGIN=https://aicommunity-test.cdf-hn.com

# 企业微信登录
WECOM_CORP_ID=wxe7a4948b61e13768
WECOM_AGENT_ID=1000351
WECOM_SECRET=5q2F0Oud4sVrcSHMTk5bcExRVAG7K58pRrnJnRDVt1A
WECOM_REDIRECT_URI=https://aicommunity-test.cdf-hn.com/api/auth/wecom/callback

# JWT 密钥（生产环境请改为随机串：openssl rand -base64 32）
AUTH_SECRET=ai-community-dev-secret-change-in-production
```

### 4. 启动后端服务

```bash
cd /opt/ai-community

# 方式 A：PM2 启动（推荐）
# 先删除可能仍指向旧目录的同名进程，再从当前部署包启动
pm2 delete ai-community-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # 开机自启

# 方式 B：直接启动
cd apps/api && node dist/server.js
```

验证后端：

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/auth/wecom/status
```

第一个接口的 `auth.wecom` 和第二个接口的 `enabled` 都应为 `true`。如果企微状态接口返回 404，说明仍在运行旧版后端，请执行 `pm2 describe ai-community-api` 核对 script path。

### 5. 配置 Nginx

```bash
# 复制配置
sudo cp nginx.conf.example /etc/nginx/conf.d/ai-community.conf

# 修改 SSL 证书路径（如需要）
sudo vim /etc/nginx/conf.d/ai-community.conf

# 测试配置
sudo nginx -t

# 重载
sudo nginx -s reload
```

### 6. 企业微信后台配置

登录 [企业微信管理后台](https://work.weixin.qq.com/)：

1. **应用管理 → 自建应用** → 确认 AgentId = `1000351`
2. **自建应用 → 网页授权及 JS-SDK → 可信域名** → 填 `aicommunity-test.cdf-hn.com`
3. **上传可信域名校验文件** → 下载 `WW_verify_xxxx.txt`，放到 `apps/web/dist/` 目录
4. **自建应用 → 工作台 → 应用主页** → 填 `https://aicommunity-test.cdf-hn.com`（企微工作台免登入口）

### 7. 验证部署

浏览器访问 `https://aicommunity-test.cdf-hn.com/login`：

- ✅ 企业微信扫码标签下应显示真实二维码（由企业微信 SDK 渲染）
- ✅ 用企业微信 App 扫码 → 手机确认 → 自动登录
- ✅ 企业微信工作台点击应用 → 自动静默登录（无需扫码）
- ✅ 账号密码标签可用（admin / Admin@2026）

## 默认账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 超级管理员 | admin | Admin@2026 |
| 审核管理员 | EMP067 | Ai@2026community |
| 创作者 | EMP001 | Ai@2026community |
| 普通用户 | EMP045 | Ai@2026community |

## 常见问题

### Q: 企业微信扫码二维码不显示？
- 检查 `apps/api/.env` 中 `WECOM_CORP_ID`/`WECOM_AGENT_ID`/`WECOM_SECRET`/`WECOM_REDIRECT_URI` 是否配置完整
- 检查后端 `/api/health` 返回 `auth.wecom` 是否为 `true`
- 浏览器 F12 控制台查看 `wwLogin` SDK 是否加载成功
- 确认企业微信后台「可信域名」已配置且校验文件可访问

### Q: 扫码后回调失败？
- 确认 `WECOM_REDIRECT_URI` 与企业微信后台配置完全一致（含 https://）
- 确认 Nginx `/api/` 反代到后端 3001 端口
- 查看后端日志：`pm2 logs ai-community-api`

### Q: 企微工作台无法免登？
- 确认企业微信后台「应用主页」已配置为 `https://aicommunity-test.cdf-hn.com`
- 确认用户已在企业微信 App 内登录
- UA 检测：企微客户端 User-Agent 包含 `wxwork`

### Q: 上传文件失败？
- 确认 `apps/api/uploads/` 目录有写权限：`chmod -R 755 apps/api/uploads`
- Nginx `client_max_body_size` 设置为 110M，为 multipart 请求开销预留空间；API 仍严格限制单附件不超过 100MB

## 运维命令

```bash
# 重启后端
pm2 restart ai-community-api

# 查看日志
pm2 logs ai-community-api --lines 100

# 重置数据库（慎用，会清空数据）
cd apps/api && rm -f dev.db && npx prisma db push && node dist/seed.js
```
