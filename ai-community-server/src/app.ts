import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path'
import dotenv from 'dotenv'
import { errorHandler } from './lib/error.js'
import worksRouter from './routes/works.js'
import versionsRouter from './routes/versions.js'
import adminRouter from './routes/admin.js'
import usersRouter, { userContentRouter } from './routes/users.js'
import wecomAuthRouter from './routes/wecom-auth.js'
import uploadRouter from './routes/upload.js'
import operationLogsRouter from './routes/operation-logs.js'
import { isWecomEnabled } from './lib/wecom.js'
import { auditMutations } from './lib/audit.js'

dotenv.config()

const app = express()

// CORS：允许前端跨域访问（v1.4：支持多个来源）
const configuredOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGIN
const allowedOrigins = new Set(
  configuredOrigins
    ? configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173']
)
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:5173')
  allowedOrigins.add('http://127.0.0.1:5173')
}
app.use(
  cors({
    origin: (origin, callback) => {
      // 允许无 origin 的请求（如 curl、同源请求、服务器健康检查）
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`CORS 不允许的来源: ${origin}`))
      }
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))
app.use('/api', auditMutations)

// 静态文件服务：上传的封面和附件
app.use('/uploads/covers', express.static(path.resolve(process.cwd(), 'uploads', 'covers'), {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}))

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // v1.4：返回登录方式可用性，供前端判断显示哪些登录标签
    auth: {
      // 与 /api/auth/wecom/status 使用同一套完整配置校验，避免健康检查误报可用
      wecom: isWecomEnabled(),
      password: true, // 账号密码登录始终启用
    },
  })
})

// 路由挂载
// v1.4：企业微信 OAuth 路由（/api/auth/wecom/url、/api/auth/wecom/callback、/api/auth/wecom/status）
app.use('/api/auth', wecomAuthRouter)
// 账号密码登录、退出、me、switch-role，以及旧版用户作品/收藏兼容路由
app.use('/api/auth', usersRouter)
// 用户内容标准路由：/api/users/:id/works、/api/users/:id/favorites
app.use('/api/users', userContentRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/works', worksRouter)
app.use('/api/works', versionsRouter) // /api/works/:workId/versions/*
app.use('/api/admin', adminRouter)
// v2.0：操作日志（记录/查询/导出）
app.use('/api/operation-logs', operationLogsRouter)

// 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' })
})

// 错误处理（必须最后挂载）
app.use(errorHandler)

export default app
