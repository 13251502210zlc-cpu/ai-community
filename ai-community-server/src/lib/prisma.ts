import 'dotenv/config'
import { createRequire } from 'node:module'
import { PrismaClient as PostgreSqlClient } from '../../prisma/generated/postgresql-client/index.js'

// 生产统一使用 PostgreSQL。保留 SQLite 客户端仅用于迁移回滚和本地回归。
// 使用条件加载，避免 PostgreSQL 生产环境必须携带旧 SQLite Client。
const databaseUrl = process.env.DATABASE_URL || ''
const isLegacySqlite = databaseUrl.startsWith('file:')
if (isLegacySqlite && !process.env.LEGACY_SQLITE_DATABASE_URL) {
  process.env.LEGACY_SQLITE_DATABASE_URL = databaseUrl
}
const require = createRequire(import.meta.url)
const PrismaClient = (isLegacySqlite
  ? require('../../prisma/generated/legacy-sqlite-client/index.js').PrismaClient
  : PostgreSqlClient) as typeof PostgreSqlClient

// 全局单例 Prisma 客户端（避免开发热重载时连接泄漏）
const globalForPrisma = globalThis as unknown as { prisma?: InstanceType<typeof PostgreSqlClient> }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
