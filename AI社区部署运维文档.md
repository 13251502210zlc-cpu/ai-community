# AI 社区平台部署与运维文档

> 文档版本：v1.0  
> 更新时间：2026/8/20  
> 适用范围：AI 社区平台测试环境、生产环境  
> **敏感级别：内部机密。本文件包含数据库明文密码，禁止提交到公共代码仓库、发送到外部群组或存放在公开网盘。**

## 1. 环境总览

| 配置项 | 测试环境 | 生产环境 |
|---|---|---|
| JumpServer 资产 | `aicommunity-test1` | `aicommunity-01` |
| 应用服务器 IP | `10.196.202.25` | `10.196.102.105` |
| 对外域名 | `https://aicommunity-test.cdf-hn.com` | `https://aicommunity.cdf-hn.com` |
| 应用目录 | `/opt/ai-lingguang` | `/opt/xinghuo` |
| 上传包目录 | `/opt/ai-lingguang` | `/opt/xinghuo` |
| 后端端口 | `3002` | `3002` |
| PM2 进程名 | `ai-lingguang-api` | `ai-community-prod-api` |
| Nginx 配置 | `/etc/nginx/conf.d/ai-lingguang.conf` | `/etc/nginx/conf.d/ai-community-prod.conf` |
| 健康检查 | `/api/health` | `/api/health` |
| PostgreSQL 地址 | `10.196.202.20:5432` | `10.196.102.72:5432` |
| 数据库名 | `aicommunity` | `aicommunity` |
| 数据库用户 | `aicommunity` | `aicommunity` |
| 数据库 Schema | `ai_community` | `ai_community` |
| 数据库明文密码 | `Zkky$Z6yRr*2x2DF*&$B` | `qh1bf&FAj&Qiym` |
| DATABASE_URL 中的编码密码 | `Zkky%24Z6yRr*2x2DF*%26%24B` | `qh1bf%26FAj%26Qiym` |

数据库只能通过内网访问。个人电脑直接连接 `10.196.*.*` 超时属于正常现象，应先进入 JumpServer 资产，或使用经过授权的 SSH 隧道。

## 2. 部署原则

1. 所有部署必须先执行 `audit`，确认资产、端口、PM2 进程目录及 Nginx 路由正确后再执行 `deploy`。
2. 测试、生产使用独立的应用目录、PM2 进程、Nginx 配置和数据库，禁止混用。
3. 升级部署会保留服务器已有的 `apps/api/.env`，部署包中的 `.env` 只是安全模板。
4. 部署脚本会自动执行 PostgreSQL Prisma Client 生成和数据库迁移：

   ```bash
   npx prisma generate --schema prisma/postgresql/schema.prisma
   npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
   ```

5. 已有环境禁止执行 `node dist/seed.js`。种子初始化只允许在确认全新的空数据库时执行一次。
6. 部署脚本会在 `${APP_DIR}/backups/release-时间戳` 创建代码、配置及上传目录备份；部署包本身也应保留。
7. 不得停止或修改同机其他项目的 PM2 进程和 Nginx 配置。

## 3. 本地构建部署包

### 3.1 构建前检查

在 Windows 开发机执行：

```powershell
cd "C:\Users\Administrator\Desktop\中免项目\AI社区"

cd .\ai-community-app
npm run lint
npm run build

cd ..\ai-community-server
npm test
```

全部通过后再制作部署包。

### 3.2 制作 Linux 部署包

```powershell
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\Administrator\.codex\skills\deploy-ai-community-jumpserver\scripts\build-release.ps1" `
  -Workspace "C:\Users\Administrator\Desktop\中免项目\AI社区"
```

输出文件格式：

```text
ai-community-deploy-YYYYMMDD-HHMMSS.tar.gz
```

记录构建脚本输出的完整路径、文件大小、前端资源文件名和 SHA256。也可以再次校验：

```powershell
Get-FileHash -Algorithm SHA256 ".\ai-community-deploy-YYYYMMDD-HHMMSS.tar.gz"
```

### 3.3 通过 JumpServer 上传

- 测试环境：上传到 `aicommunity-test1` 的 `/opt/ai-lingguang/`。
- 生产环境：上传到 `aicommunity-01` 的 `/opt/xinghuo/`。
- 压缩包必须直接位于应用目录，不能放在子目录内。
- 上传完成后在服务器执行 `ls -lh` 和 `sha256sum`，与本地 SHA256 对比。

## 4. 环境变量配置

配置文件位置：

- 测试：`/opt/ai-lingguang/apps/api/.env`
- 生产：`/opt/xinghuo/apps/api/.env`

文件权限建议：

```bash
chmod 600 /opt/ai-lingguang/apps/api/.env
# 或生产环境：
chmod 600 /opt/xinghuo/apps/api/.env
```

### 4.1 测试环境 `.env`

```env
NODE_ENV=production
PORT=3002
FRONTEND_ORIGIN=https://aicommunity-test.cdf-hn.com
CORS_ORIGINS=https://aicommunity-test.cdf-hn.com

DATABASE_URL=postgresql://aicommunity:Zkky%24Z6yRr*2x2DF*%26%24B@10.196.202.20:5432/aicommunity?schema=ai_community

AUTH_SECRET=<保留测试服务器当前值；首次部署使用 openssl rand -hex 32 生成>
JWT_EXPIRES_IN=7d

WECOM_CORP_ID=<测试服务器当前值>
WECOM_AGENT_ID=<测试服务器当前值>
WECOM_SECRET=<测试服务器当前值>
WECOM_REDIRECT_URI=https://aicommunity-test.cdf-hn.com/api/auth/wecom/callback

FILE_STORAGE_DRIVER=cos
STORAGE_DRIVER=cos
COS_BUCKET=<测试服务器当前值>
COS_REGION=<测试服务器当前值>
COS_SECRET_ID=<测试服务器当前值>
COS_SECRET_KEY=<测试服务器当前值>
COS_DOMAIN=<测试服务器当前值>
SIGNED_URL_EXPIRE_SECONDS=300
```

### 4.2 生产环境 `.env`

生产环境沿用测试环境的企业微信及 COS 配置，但域名、数据库和 `AUTH_SECRET` 必须使用生产值。生产环境不要与测试环境共用 `AUTH_SECRET`，避免跨环境 Token 混用。

```env
NODE_ENV=production
PORT=3002
FRONTEND_ORIGIN=https://aicommunity.cdf-hn.com
CORS_ORIGINS=https://aicommunity.cdf-hn.com

DATABASE_URL=postgresql://aicommunity:qh1bf%26FAj%26Qiym@10.196.102.72:5432/aicommunity?schema=ai_community

AUTH_SECRET=<保留生产服务器当前值；首次部署使用 openssl rand -hex 32 生成>
JWT_EXPIRES_IN=7d

WECOM_CORP_ID=<沿用测试环境值>
WECOM_AGENT_ID=<沿用测试环境值>
WECOM_SECRET=<沿用测试环境值>
WECOM_REDIRECT_URI=https://aicommunity.cdf-hn.com/api/auth/wecom/callback

FILE_STORAGE_DRIVER=cos
STORAGE_DRIVER=cos
COS_BUCKET=<沿用测试环境值>
COS_REGION=<沿用测试环境值>
COS_SECRET_ID=<沿用测试环境值>
COS_SECRET_KEY=<沿用测试环境值>
COS_DOMAIN=<沿用测试环境值>
SIGNED_URL_EXPIRE_SECONDS=300
```

首次部署可生成签名密钥：

```bash
openssl rand -hex 32
```

生成后把结果填入 `AUTH_SECRET`，并妥善保管。日常升级不得更换，否则所有现有登录 Token 会立即失效。

## 5. 数据库连接与备份

### 5.1 测试数据库连接

在 `aicommunity-test1` 服务器中执行：

```bash
psql -h 10.196.202.20 -p 5432 -U aicommunity -d aicommunity -W
```

密码提示处输入明文密码：

```text
Zkky$Z6yRr*2x2DF*&$B
```

### 5.2 生产数据库连接

在 `aicommunity-01` 服务器中执行：

```bash
psql -h 10.196.102.72 -p 5432 -U aicommunity -d aicommunity -W
```

密码提示处输入明文密码：

```text
qh1bf&FAj&Qiym
```

### 5.3 连接及权限检查

连接后执行：

```sql
SELECT current_database(), current_user, current_schema();
SELECT has_database_privilege(current_user, current_database(), 'CONNECT');
SELECT has_schema_privilege(current_user, 'ai_community', 'USAGE');
SELECT has_schema_privilege(current_user, 'ai_community', 'CREATE');
```

### 5.4 发布前备份

测试环境：

```bash
mkdir -p /opt/ai-lingguang/backups/database
pg_dump -h 10.196.202.20 -p 5432 -U aicommunity -d aicommunity \
  -n ai_community -Fc -W \
  -f /opt/ai-lingguang/backups/database/aicommunity-test-$(date +%Y%m%d-%H%M%S).dump
```

生产环境：

```bash
mkdir -p /opt/xinghuo/backups/database
pg_dump -h 10.196.102.72 -p 5432 -U aicommunity -d aicommunity \
  -n ai_community -Fc -W \
  -f /opt/xinghuo/backups/database/aicommunity-prod-$(date +%Y%m%d-%H%M%S).dump
```

命令会提示输入上表中的明文数据库密码。备份完成后执行 `ls -lh`，确认文件存在且大小不为 0。

## 6. 测试环境部署

### 6.1 首次部署准备

已有测试环境升级时跳过本节。首次部署且 `/opt/ai-lingguang/apps/api/.env` 不存在时，先创建配置文件：

```bash
install -d -m 700 /opt/ai-lingguang/apps/api
umask 077
vi /opt/ai-lingguang/apps/api/.env
chmod 600 /opt/ai-lingguang/apps/api/.env
```

内容按“4.1 测试环境 `.env`”填写。日常升级不得删除或重建 `.env`。

### 6.2 设置并校验部署包

把文件名、SHA256 替换为本次构建结果：

```bash
set -e

PKG=/opt/ai-lingguang/ai-community-deploy-YYYYMMDD-HHMMSS.tar.gz
EXPECTED_SHA256=<本地构建输出的SHA256>

echo "$EXPECTED_SHA256  $PKG" | sha256sum -c -
tar -xOf "$PKG" ai-community-deploy/deploy-safe.sh > /tmp/deploy-ai-community.sh
chmod 700 /tmp/deploy-ai-community.sh
```

### 6.3 只读审计

```bash
bash /tmp/deploy-ai-community.sh audit \
  --package "$PKG" \
  --app-dir /opt/ai-lingguang \
  --port 3002 \
  --pm2-name ai-lingguang-api \
  --domain aicommunity-test.cdf-hn.com \
  --nginx-conf /etc/nginx/conf.d/ai-lingguang.conf
```

必须看到 `AUDIT_OK`，并确认：

- 当前资产为 `aicommunity-test1` / `10.196.202.25`；
- PM2 同名进程的 cwd 为 `/opt/ai-lingguang/apps/api`，或首次部署时不存在；
- `3002` 端口为空，或由 `ai-lingguang-api` 占用；
- 没有命中其他项目的 Nginx 配置。

### 6.4 执行部署

```bash
bash /tmp/deploy-ai-community.sh deploy \
  --package "$PKG" \
  --app-dir /opt/ai-lingguang \
  --port 3002 \
  --pm2-name ai-lingguang-api \
  --domain aicommunity-test.cdf-hn.com \
  --nginx-conf /etc/nginx/conf.d/ai-lingguang.conf
```

部署完成必须看到 `DEPLOY_OK`，并记录输出中的 `backup=` 路径。

## 7. 生产环境部署

### 7.1 首次部署前置检查

进入 JumpServer 的 `aicommunity-01`，确认：

```bash
hostname -I
node -v
npm -v
pm2 -v
nginx -v
systemctl is-active nginx
timeout 5 bash -c '</dev/tcp/10.196.102.72/5432' && echo DB_TCP_OK || echo DB_TCP_FAILED
```

要求：Node.js 18 或更高版本、npm、PM2、Nginx 可用，数据库端口输出 `DB_TCP_OK`。

首次部署且 `/opt/xinghuo/apps/api/.env` 不存在时，先创建该文件：

```bash
install -d -m 700 /opt/xinghuo/apps/api
umask 077
vi /opt/xinghuo/apps/api/.env
chmod 600 /opt/xinghuo/apps/api/.env
```

内容按“4.2 生产环境 `.env`”填写。日常升级不要重建 `.env`。

### 7.2 设置并校验部署包

```bash
set -e

PKG=/opt/xinghuo/ai-community-deploy-YYYYMMDD-HHMMSS.tar.gz
EXPECTED_SHA256=<本地构建输出的SHA256>

echo "$EXPECTED_SHA256  $PKG" | sha256sum -c -
tar -xOf "$PKG" ai-community-deploy/deploy-safe.sh > /tmp/deploy-ai-community.sh
chmod 700 /tmp/deploy-ai-community.sh
```

### 7.3 只读审计

生产目录不是脚本的测试环境默认目录，因此必须显式加入 `--allow-nonstandard-target`：

```bash
bash /tmp/deploy-ai-community.sh audit \
  --package "$PKG" \
  --app-dir /opt/xinghuo \
  --port 3002 \
  --pm2-name ai-community-prod-api \
  --domain aicommunity.cdf-hn.com \
  --nginx-conf /etc/nginx/conf.d/ai-community-prod.conf \
  --allow-nonstandard-target
```

必须看到 `AUDIT_OK`，并确认：

- 当前资产为 `aicommunity-01` / `10.196.102.105`；
- PM2 同名进程的 cwd 为 `/opt/xinghuo/apps/api`，或首次部署时不存在；
- `3002` 端口为空，或由 `ai-community-prod-api` 占用；
- 域名为 `aicommunity.cdf-hn.com`；
- Nginx 文件为 `/etc/nginx/conf.d/ai-community-prod.conf`。

### 7.4 执行部署

```bash
bash /tmp/deploy-ai-community.sh deploy \
  --package "$PKG" \
  --app-dir /opt/xinghuo \
  --port 3002 \
  --pm2-name ai-community-prod-api \
  --domain aicommunity.cdf-hn.com \
  --nginx-conf /etc/nginx/conf.d/ai-community-prod.conf \
  --allow-nonstandard-target
```

部署完成必须看到 `DEPLOY_OK`，并记录输出中的 `backup=` 路径。

## 8. 首次数据库初始化

部署脚本会先执行全部 Prisma migrations，因此不需要手工执行 `prisma db push`。

### 8.1 全新空数据库

仅当数据库管理员确认目标 Schema 是新建空库，且从未执行过初始化时，部署完成后执行一次：

```bash
# 测试环境
cd /opt/ai-lingguang/apps/api
node dist/seed.js

# 生产环境使用：
# cd /opt/xinghuo/apps/api
# node dist/seed.js
```

执行后检查用户、业务领域、标签等基础数据是否生成。

### 8.2 已有数据库

已有数据库只执行 `prisma migrate deploy`，该操作已包含在安全部署脚本中。**不得再执行 seed、db push、clean-db、DROP SCHEMA 或手工删除迁移记录。**

## 9. 部署后验证

### 9.1 测试环境

```bash
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS -H "Host: aicommunity-test.cdf-hn.com" http://127.0.0.1/api/health
curl -I -H "Host: aicommunity-test.cdf-hn.com" http://127.0.0.1/
pm2 show ai-lingguang-api | grep -E "status|exec cwd"
nginx -t
```

外部访问：

```text
https://aicommunity-test.cdf-hn.com/
```

### 9.2 生产环境

```bash
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS -H "Host: aicommunity.cdf-hn.com" http://127.0.0.1/api/health
curl -I -H "Host: aicommunity.cdf-hn.com" http://127.0.0.1/
pm2 show ai-community-prod-api | grep -E "status|exec cwd"
nginx -t
```

外部访问：

```text
https://aicommunity.cdf-hn.com/
```

验收要求：

1. `/api/health` 返回 `status: ok`，且 `auth.wecom` 为 `true`。
2. 前端返回 HTTP 200。
3. PM2 状态为 `online`，cwd 与目标应用目录一致。
4. 企业微信二维码正常显示，扫码或工作台登录后能跳转首页。
5. 作品列表、详情、附件、封面、点赞、收藏、评论、审核和后台权限功能正常。
6. 上传接近 100 MiB 的附件时，Nginx 不返回 413/504；Nginx 应保留 `client_max_body_size 110M` 及 300 秒超时配置。

## 10. 日常升级流程

测试和生产的日常升级都遵循以下顺序：

1. 本地 lint、build、test 全部通过。
2. 制作新部署包并记录 SHA256。
3. 生产发布前执行 PostgreSQL 备份。
4. 上传部署包到对应应用目录。
5. 校验 SHA256。
6. 执行 `audit` 并核对输出。
7. 执行 `deploy`。
8. 记录自动生成的备份目录。
9. 完成后端、Nginx、PM2 和公网验证。
10. 检查业务关键流程和企业微信登录。

## 11. 回滚

### 11.1 代码回滚

优先使用仍保留在应用目录中的上一个部署包，按对应环境的 `audit`、`deploy` 命令重新部署旧包。安全部署脚本会继续保留当前 `.env` 和运行数据，并生成新的备份目录。

### 11.2 数据库回滚

Prisma migration 不会随着旧代码包自动回退。需要数据库回滚时：

1. 立即停止写入或进入维护窗口；
2. 保留当前数据库快照；
3. 由数据库管理员使用发布前的 `.dump` 恢复；
4. 恢复后重新部署对应版本代码；
5. 完成健康检查和业务回归后再开放流量。

不要在未备份的情况下手工删除 `_prisma_migrations` 记录或回退表结构。

## 12. 常用运维命令

测试环境：

```bash
pm2 status
pm2 logs ai-lingguang-api --lines 200
pm2 restart ai-lingguang-api --update-env
pm2 show ai-lingguang-api
ss -lntp | grep ':3002'
```

生产环境：

```bash
pm2 status
pm2 logs ai-community-prod-api --lines 200
pm2 restart ai-community-prod-api --update-env
pm2 show ai-community-prod-api
ss -lntp | grep ':3002'
```

Nginx：

```bash
nginx -t
systemctl reload nginx
tail -n 200 /var/log/nginx/error.log
```

数据库迁移状态建议直接查询 PostgreSQL，避免在已裁剪开发依赖的生产目录中运行 `npx` 并触发临时下载。

测试环境：

```bash
psql -h 10.196.202.20 -p 5432 -U aicommunity -d aicommunity -W \
  -c 'SELECT migration_name, started_at, finished_at, rolled_back_at FROM ai_community."_prisma_migrations" ORDER BY started_at DESC LIMIT 20;'
```

生产环境：

```bash
psql -h 10.196.102.72 -p 5432 -U aicommunity -d aicommunity -W \
  -c 'SELECT migration_name, started_at, finished_at, rolled_back_at FROM ai_community."_prisma_migrations" ORDER BY started_at DESC LIMIT 20;'
```

## 13. 常见故障

### 13.1 数据库连接超时

- 确认命令是在对应 JumpServer 资产内部执行，而不是个人电脑直连。
- 使用 `/dev/tcp/数据库IP/5432` 检查端口。
- 检查数据库白名单、安全组及 `pg_hba.conf`。
- 超时通常是网络问题；`password authentication failed` 才是用户名或密码问题。

### 13.2 Prisma P3018

- 先读取完整数据库错误，不要直接标记迁移成功。
- 修正迁移 SQL 后，按 Prisma 官方流程处理失败迁移。
- 处理前必须备份数据库，并确认 `_prisma_migrations` 中的失败记录。

### 13.3 后端健康检查失败

```bash
pm2 status
pm2 logs <对应PM2进程名> --lines 200
ss -lntp | grep ':3002'
```

重点检查 `.env`、DATABASE_URL、AUTH_SECRET、数据库迁移状态和端口占用。

### 13.4 域名能打开但 API 失败

- 检查 Nginx `/api/` 是否代理到 `127.0.0.1:3002`。
- 执行 `nginx -t`。
- 使用带 `Host` 请求头的本机 curl 区分应用问题与前置代理问题。
- 外部 HTTPS 当前可由前置负载均衡或代理终止，源站 Nginx 使用 HTTP 监听是正常部署方式。

## 14. 文档变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.0 | 2026/8/20 | 首版；分别整理测试与生产部署、PostgreSQL 明文凭据、首次初始化、升级、验证、备份与回滚流程。 |
