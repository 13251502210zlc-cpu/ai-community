// PM2 进程管理配置
const path = require('path')
// 启动：pm2 start ecosystem.config.cjs
// 重启：pm2 restart ai-community-api
// 停止：pm2 stop ai-community-api
// 日志：pm2 logs ai-community-api
// 开机自启：pm2 startup && pm2 save

module.exports = {
  apps: [
    {
      name: 'ai-community-api',
      // 使用配置文件所在目录解析绝对路径，避免从其他目录执行 pm2 时启动旧版 API
      cwd: path.join(__dirname, 'apps', 'api'),
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
