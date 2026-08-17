import 'dotenv/config'
import { Prisma, PrismaClient as PostgreSqlClient } from './generated/postgresql-client/index.js'
import { PrismaClient as SqliteClient } from './generated/legacy-sqlite-client/index.js'

const sourceUrl = process.env.LEGACY_SQLITE_DATABASE_URL
const targetUrl = process.env.DATABASE_URL

if (!sourceUrl?.startsWith('file:')) {
  throw new Error('LEGACY_SQLITE_DATABASE_URL 必须指向 SQLite 文件，例如 file:./prisma/dev.db')
}
if (!targetUrl?.startsWith('postgresql://') && !targetUrl?.startsWith('postgres://')) {
  throw new Error('DATABASE_URL 必须是 PostgreSQL 连接串')
}

const source = new SqliteClient()
const target = new PostgreSqlClient()

type Delegate = {
  findMany(): Promise<unknown[]>
  createMany(args: { data: unknown[]; skipDuplicates?: boolean }): Promise<{ count: number }>
  count(): Promise<number>
}

async function copyTable(label: string, sourceDelegate: Delegate, targetDelegate: Delegate) {
  const rows = await sourceDelegate.findMany()
  if (rows.length === 0) {
    console.log(`- ${label}: 0`)
    return
  }
  const result = await targetDelegate.createMany({ data: rows })
  console.log(`- ${label}: ${result.count}`)
}

async function assertEmptyTarget(db: Prisma.TransactionClient) {
  const checks = await Promise.all([
    db.user.count(),
    db.userRole.count(),
    db.rolePermission.count(),
    db.work.count(),
    db.workVersion.count(),
    db.attachment.count(),
    db.pendingUpload.count(),
    db.comment.count(),
    db.reviewEvent.count(),
    db.businessDomain.count(),
    db.tag.count(),
    db.operationLog.count(),
    db.archivedOperationLog.count(),
    db.userLike.count(),
    db.userFavorite.count(),
  ])
  if (checks.some((count) => count > 0)) {
    throw new Error('目标 PostgreSQL 已包含业务数据。为防止覆盖或重复导入，迁移已停止。')
  }
}

async function main() {
  await Promise.all([source.$connect(), target.$connect()])
  await target.$transaction(async (db) => {
    await assertEmptyTarget(db)

    console.log('开始从 SQLite 迁移到 PostgreSQL：')
    await copyTable('用户', source.user, db.user)
    await copyTable('用户角色', source.userRole, db.userRole)
    await copyTable('角色权限', source.rolePermission, db.rolePermission)
    await copyTable('业务领域', source.businessDomain, db.businessDomain)
    await copyTable('标签', source.tag, db.tag)
    await copyTable('作品', source.work, db.work)
    await copyTable('作品版本', source.workVersion, db.workVersion)
    await copyTable('附件', source.attachment, db.attachment)
    await copyTable('待处理上传', source.pendingUpload, db.pendingUpload)
    await copyTable('评论', source.comment, db.comment)
    await copyTable('审核事件', source.reviewEvent, db.reviewEvent)
    await copyTable('操作日志', source.operationLog, db.operationLog)
    await copyTable('归档日志', source.archivedOperationLog, db.archivedOperationLog)
    await copyTable('点赞关系', source.userLike, db.userLike)
    await copyTable('收藏关系', source.userFavorite, db.userFavorite)

    const worksWithTags = await source.work.findMany({
      select: { id: true, tags: { select: { id: true } } },
    })
    let tagRelations = 0
    for (const work of worksWithTags) {
      if (work.tags.length === 0) continue
      await db.work.update({
        where: { id: work.id },
        data: { tags: { connect: work.tags.map(({ id }) => ({ id })) } },
      })
      tagRelations += work.tags.length
    }
    console.log(`- 作品标签关系: ${tagRelations}`)
  }, { maxWait: 30_000, timeout: 600_000 })
  console.log('迁移完成。SQLite 文件未被修改，可保留作为回滚备份。')
}

main()
  .catch((error) => {
    console.error('迁移失败：', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()])
  })
