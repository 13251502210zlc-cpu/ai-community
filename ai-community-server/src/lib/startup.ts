import bcrypt from 'bcryptjs'
import { prisma } from './prisma.js'

export async function migrateLegacySecurityData() {
  const users = await prisma.user.findMany({ select: { id: true, password: true } })
  for (const user of users) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: 'user' } },
      update: {},
      create: { userId: user.id, role: 'user' },
    })
    if (user.password && !/^\$2[aby]\$/.test(user.password)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await bcrypt.hash(user.password, 12) },
      })
    }
  }
}
