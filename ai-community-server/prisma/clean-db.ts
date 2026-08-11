// 清空数据库所有业务数据（保留表结构）
// 用法：npx tsx prisma/clean-db.ts
//
// 清空范围：
//   - 用户及角色关联（User、UserRole）
//   - 作品及版本、附件、评论（Work、WorkVersion、Attachment、Comment）
//   - 审核事件（ReviewEvent）
//   - 业务领域、标签（BusinessDomain、Tag）
//   - 用户互动（UserLike、UserFavorite）
//
// 可选：通过 --keep-admin 参数保留超级管理员账号
//   npx tsx prisma/clean-db.ts --keep-admin
//
// 清空后数据库为纯净状态，新用户通过企业微信扫码首次登录自动创建。

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const keepAdmin = process.argv.includes('--keep-admin')

async function main() {
  console.log('🧹 开始清空数据库业务数据...\n')

  // 按外键依赖顺序删除
  const steps = [
    { name: '审核事件', fn: () => prisma.reviewEvent.deleteMany() },
    { name: '评论', fn: () => prisma.comment.deleteMany() },
    { name: '附件', fn: () => prisma.attachment.deleteMany() },
    { name: '作品版本', fn: () => prisma.workVersion.deleteMany() },
    { name: '用户点赞', fn: () => prisma.userLike.deleteMany() },
    { name: '用户收藏', fn: () => prisma.userFavorite.deleteMany() },
    { name: '作品', fn: () => prisma.work.deleteMany() },
    { name: '标签', fn: () => prisma.tag.deleteMany() },
    { name: '业务领域', fn: () => prisma.businessDomain.deleteMany() },
    { name: '用户角色关联', fn: () => prisma.userRole.deleteMany() },
  ]

  // 用户表：根据参数决定是否保留超级管理员
  if (keepAdmin) {
    const admins = await prisma.user.findMany({ where: { role: 'super_admin' } })
    console.log(`  ℹ️  检测到 --keep-admin，保留 ${admins.length} 个超级管理员账号`)
    if (admins.length > 0) {
      const adminIds = admins.map((a) => a.id)
      await prisma.user.deleteMany({ where: { id: { notIn: adminIds } } })
      console.log(`  ✓ 用户表：保留 ${admins.length} 个管理员，其余已删除`)
    } else {
      console.log('  ⚠️  未找到超级管理员账号，将清空全部用户')
      await prisma.user.deleteMany()
    }
  } else {
    steps.push({ name: '用户', fn: () => prisma.user.deleteMany() })
  }

  for (const step of steps) {
    const result = await step.fn()
    console.log(`  ✓ ${step.name}：已删除 ${result.count} 条`)
  }

  // 重置 SQLite 自增序列（如果使用 SQLite）
  try {
    await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name IN ('User','UserRole','Work','WorkVersion','Attachment','Comment','ReviewEvent','BusinessDomain','Tag','UserLike','UserFavorite')")
    console.log('  ✓ 自增序列已重置')
  } catch {
    // 非 SQLite 数据库忽略
  }

  console.log('\n✅ 数据库已清空，现在是纯净的真实数据环境')
  if (keepAdmin) {
    console.log('   超级管理员账号已保留，可继续使用账号密码登录')
  } else {
    console.log('   所有用户已清除，新用户通过企业微信扫码首次登录自动创建')
  }
}

main()
  .catch((e) => {
    console.error('❌ 清空失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
