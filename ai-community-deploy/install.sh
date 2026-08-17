#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/ai-community}"
APP_NAME="ai-community-api"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(readlink -m "$APP_DIR")"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${APP_DIR}.backup-${STAMP}"

log() { printf '\n[AI Community] %s\n' "$*"; }
fail() { printf '\n[AI Community] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(id -u)" -ne 0 ]]; then
  fail "请使用 root 运行：sudo bash install.sh"
fi

[[ "$APP_DIR" == /* ]] || fail "APP_DIR 必须是绝对路径"
[[ "$APP_DIR" != "/" ]] || fail "APP_DIR 不能是根目录"
if [[ "$SOURCE_DIR" == "$APP_DIR"/* || "$APP_DIR" == "$SOURCE_DIR"/* ]]; then
  fail "安装包目录和目标目录不能互相嵌套，请将压缩包解压到 /tmp 后重试"
fi

command -v node >/dev/null 2>&1 || fail "未找到 Node.js，请先安装 Node.js 18 或更高版本"
command -v npm >/dev/null 2>&1 || fail "未找到 npm"
command -v curl >/dev/null 2>&1 || fail "未找到 curl"

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 18 )); then
  fail "Node.js 版本过低（当前 $(node -v)），需要 18 或更高版本"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "未检测到 PM2，正在安装"
  npm install -g pm2
fi

if [[ "$SOURCE_DIR" == "$APP_DIR" ]]; then
  log "安装包已位于 $APP_DIR，跳过文件复制"
else
  if [[ -d "$APP_DIR" ]]; then
    log "备份现有运行数据到 $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR/apps/api/prisma"
    [[ -f "$APP_DIR/apps/api/.env" ]] && cp -a "$APP_DIR/apps/api/.env" "$BACKUP_DIR/apps/api/.env"
    [[ -f "$APP_DIR/apps/api/prisma/dev.db" ]] && cp -a "$APP_DIR/apps/api/prisma/dev.db" "$BACKUP_DIR/apps/api/prisma/dev.db"
    [[ -d "$APP_DIR/apps/api/uploads" ]] && cp -a "$APP_DIR/apps/api/uploads" "$BACKUP_DIR/apps/api/uploads"
  fi

  log "安装程序文件到 $APP_DIR"
  mkdir -p "$APP_DIR"
  cp -a "$SOURCE_DIR/." "$APP_DIR/"

  # 升级时保留已有数据库和上传文件；仅保留配置完整的旧 .env。
  if [[ -d "$BACKUP_DIR" ]]; then
    [[ -f "$BACKUP_DIR/apps/api/prisma/dev.db" ]] && cp -a "$BACKUP_DIR/apps/api/prisma/dev.db" "$APP_DIR/apps/api/prisma/dev.db"
    if [[ -d "$BACKUP_DIR/apps/api/uploads" ]]; then
      mkdir -p "$APP_DIR/apps/api/uploads"
      cp -a "$BACKUP_DIR/apps/api/uploads/." "$APP_DIR/apps/api/uploads/"
    fi
    OLD_ENV="$BACKUP_DIR/apps/api/.env"
    if [[ -f "$OLD_ENV" ]] && \
       grep -Eq '^WECOM_CORP_ID=.+$' "$OLD_ENV" && \
       grep -Eq '^WECOM_AGENT_ID=.+$' "$OLD_ENV" && \
       grep -Eq '^WECOM_SECRET=.+$' "$OLD_ENV" && \
       grep -Eq '^WECOM_REDIRECT_URI=.+$' "$OLD_ENV"; then
      cp -a "$OLD_ENV" "$APP_DIR/apps/api/.env"
      log "已保留原有完整生产环境配置"
    else
      log "原配置缺少企微参数，已使用安装包内的修复配置"
    fi
  fi
fi

cd "$APP_DIR/apps/api"

if ! grep -Eq '^AUTH_SECRET=.{32,}$' .env; then
  command -v openssl >/dev/null 2>&1 || fail "缺少 openssl，无法生成 AUTH_SECRET"
  printf '\nAUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
  log "已生成新的 JWT 签名密钥"
fi

for key in WECOM_CORP_ID WECOM_AGENT_ID WECOM_SECRET WECOM_REDIRECT_URI AUTH_SECRET; do
  grep -Eq "^${key}=.+$" .env || fail ".env 缺少必填项：${key}"
done

log "安装依赖并初始化数据库"
# Prisma CLI 位于开发依赖中，完成 Client 生成和数据库升级后再裁剪依赖。
npm ci
npx prisma generate --schema prisma/postgresql/schema.prisma
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npm prune --omit=dev
mkdir -p uploads/covers uploads/attachments logs

log "替换旧 PM2 进程并启动新版 API"
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
cd "$APP_DIR"
pm2 start ecosystem.config.cjs
if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || log "PM2 开机启动配置未自动完成，请稍后手动执行 pm2 startup"
fi
pm2 save

log "验证本机 API"
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    break
  fi
  sleep 1
done

HEALTH="$(curl -fsS http://127.0.0.1:3001/api/health)" || fail "API 健康检查失败，请运行 pm2 logs $APP_NAME"
WECOM="$(curl -fsS http://127.0.0.1:3001/api/auth/wecom/status)" || fail "企微状态接口不可用，请运行 pm2 logs $APP_NAME"

printf '%s' "$HEALTH" | grep -q '"wecom":true' || fail "健康检查显示企微未启用，请检查 apps/api/.env"
printf '%s' "$WECOM" | grep -q '"enabled":true' || fail "企微状态接口显示未启用，请检查 apps/api/.env"

log "安装成功"
printf '应用目录：%s\n' "$APP_DIR"
printf 'PM2 服务：%s\n' "$APP_NAME"
printf '企微状态：enabled=true\n'
if [[ -d "$BACKUP_DIR" ]]; then
  printf '旧数据备份：%s\n' "$BACKUP_DIR"
fi
printf '\n如需配置 Nginx，请参考：%s/nginx.conf.example\n' "$APP_DIR"
