// 入口文件第一行加载 .env，确保所有后续 import 的模块都能读到环境变量
import dotenv from 'dotenv'
dotenv.config()

import app from './app.js'
import { archiveExpiredOperationLogs } from './lib/audit.js'
import { migrateLegacySecurityData } from './lib/startup.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

async function start() {
  await migrateLegacySecurityData()
  await archiveExpiredOperationLogs()
  app.listen(PORT, () => {
    console.log(`\n🚀 AI 社区后端服务已启动`)
    console.log(`   本地地址: http://localhost:${PORT}`)
    console.log(`   健康检查: http://localhost:${PORT}/api/health`)
    console.log(`   前端 CORS: ${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}\n`)
  })
  const archiveTimer = setInterval(() => {
    void archiveExpiredOperationLogs().catch((error) => console.error('[operation-log-archive]', error))
  }, 24 * 60 * 60 * 1000)
  archiveTimer.unref()
}

start().catch((error) => {
  console.error('[startup]', error)
  process.exitCode = 1
})
