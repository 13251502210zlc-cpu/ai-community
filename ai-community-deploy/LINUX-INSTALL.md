# Linux 一键安装

## 系统要求

- Linux x86_64 或 ARM64
- Node.js 18 或更高版本
- npm、curl
- root 权限
- Nginx 和 HTTPS 证书由服务器现有环境提供

## 安装

```bash
tar -xzf ai-community-linux-installer.tar.gz
cd ai-community-deploy
sudo bash install.sh
```

默认安装到 `/opt/ai-community`。如需修改目录：

```bash
sudo APP_DIR=/data/ai-community bash install.sh
```

安装程序会自动：

1. 校验 Node.js 版本并安装 PM2（若未安装）。
2. 备份已有 `.env`、SQLite 数据库和上传文件。
3. 安装生产依赖并生成 Prisma Client。
4. 初始化或升级数据库结构。
5. 删除可能指向旧目录的 PM2 进程并启动新版 API。
6. 验证健康检查及企业微信状态接口。

Nginx 配置模板位于 `/opt/ai-community/nginx.conf.example`。安装完成后，确认 `/api/` 反向代理到 `127.0.0.1:3001`。

