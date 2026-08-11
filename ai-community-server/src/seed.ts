// 初始化种子数据（与前端 mockData 保持一致，方便联调）
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// 种子数据中的版本对象类型（统一形状，避免联合类型推断导致属性缺失）
interface SeedVersion {
  version: string
  changelog: string
  status: string
  current?: boolean
  changelogAuthor: string
  submittedAt?: Date
  baseVersionId?: string
}

interface SeedWork {
  id: string
  title: string
  type: string
  category: string
  tags: string[]
  authorId: string
  authorName: string
  department: string
  intro: string
  usage: string
  businessValue: string
  scene: string
  coreAbilities: string[]
  currentVersion: string
  versions: SeedVersion[]
  likes: number
  favorites: number
  downloads: number
  views: number
  recommended?: boolean
}

async function main() {
  console.log('🌱 开始填充种子数据...')

  // 清空旧数据
  await prisma.reviewEvent.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.workVersion.deleteMany()
  await prisma.userLike.deleteMany()
  await prisma.userFavorite.deleteMany()
  await prisma.work.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.businessDomain.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.user.deleteMany()

  // ============ 用户 ============
  // v1.7：与前端 mockData.ts 的 18 个用户完全一致，确保前后端数据同步
  // loginMethod='wecom' 的用户无 loginAccount/password（仅企业微信登录）
  // loginMethod='password'/'both' 的用户有 loginAccount/password（可账号密码登录）
  const standardPassword = await bcrypt.hash('Ai@2026community', 12)
  const adminPassword = await bcrypt.hash('Admin@2026', 12)
  const users = await prisma.$transaction([
    prisma.user.create({ data: { id: 'u1', name: '张明', department: '财务部', position: '数据分析师', role: 'creator', avatarColor: 'linear-gradient(135deg,#6366f1,#8b5cf6)', loginMethod: 'wecom', employeeId: 'EMP001', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u2', name: '李芳', department: '市场部', position: '内容运营', role: 'creator', avatarColor: '#06b6d4', loginMethod: 'wecom', employeeId: 'EMP012', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u3', name: '王伟', department: '客服部', position: '客服主管', role: 'creator', avatarColor: '#f59e0b', loginMethod: 'wecom', employeeId: 'EMP023', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u4', name: '陈静', department: '法务部', position: '法务专员', role: 'creator', avatarColor: '#8b5cf6', loginMethod: 'wecom', employeeId: 'EMP034', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u5', name: '刘洋', department: 'HR部', position: '招聘经理', role: 'creator', avatarColor: '#ec4899', loginMethod: 'wecom', employeeId: 'EMP045', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u6', name: '赵强', department: '研发部', position: '前端工程师', role: 'creator', avatarColor: '#3b82f6', loginMethod: 'both', employeeId: 'EMP056', loginAccount: 'EMP056', password: standardPassword, accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u7', name: '王强', department: '运营部', position: '审核管理员', role: 'reviewer', avatarColor: '#ef4444', loginMethod: 'wecom', employeeId: 'EMP067', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u8', name: '赵琳', department: '运营部', position: '运营负责人', role: 'operator', avatarColor: '#10b981', loginMethod: 'wecom', employeeId: 'EMP078', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u9', name: '周涛', department: 'IT部', position: '系统管理员', role: 'super_admin', avatarColor: '#dc2626', loginMethod: 'both', employeeId: 'EMP089', loginAccount: 'admin', password: adminPassword, accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u10', name: '孙杰', department: '研发部', position: '后端工程师', role: 'creator', avatarColor: '#0ea5e9', loginMethod: 'wecom', employeeId: 'EMP100', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u11', name: '吴敏', department: '财务部', position: '会计', role: 'user', avatarColor: '#14b8a6', loginMethod: 'password', employeeId: 'EMP103', loginAccount: 'EMP103', password: standardPassword, accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u12', name: '郑宇', department: '市场部', position: '品牌经理', role: 'user', avatarColor: '#f97316', loginMethod: 'wecom', employeeId: 'EMP112', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u13', name: '黄玲', department: '客服部', position: '客服专员', role: 'user', avatarColor: '#a855f7', loginMethod: 'wecom', employeeId: 'EMP125', accountStatus: 'disabled' } }),
    prisma.user.create({ data: { id: 'u14', name: '马超', department: '研发部', position: '产品经理', role: 'creator', avatarColor: '#22c55e', loginMethod: 'both', employeeId: 'EMP134', loginAccount: 'EMP134', password: standardPassword, accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u15', name: '冯雪', department: 'HR部', position: 'HRBP', role: 'user', avatarColor: '#eab308', loginMethod: 'wecom', employeeId: 'EMP145', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u16', name: '陈刚', department: '法务部', position: '法务总监', role: 'user', avatarColor: '#64748b', loginMethod: 'wecom', employeeId: 'EMP156', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u17', name: '李娜', department: '运营部', position: '内容审核', role: 'reviewer', avatarColor: '#ef4444', loginMethod: 'wecom', employeeId: 'EMP167', accountStatus: 'active' } }),
    prisma.user.create({ data: { id: 'u18', name: '杨帆', department: 'IT部', position: '运维工程师', role: 'user', avatarColor: '#0284c7', loginMethod: 'password', employeeId: 'EMP178', loginAccount: 'EMP178', password: standardPassword, accountStatus: 'active' } }),
  ])

  // v1.7：多角色关系（assignedRoles 关联表，与 mockData 的 roles 数组一致）
  await prisma.userRole.createMany({
    data: [
      { userId: 'u1', role: 'creator' },
      { userId: 'u2', role: 'creator' },
      { userId: 'u3', role: 'creator' },
      { userId: 'u4', role: 'creator' },
      { userId: 'u5', role: 'creator' },
      { userId: 'u6', role: 'creator' },
      { userId: 'u7', role: 'reviewer' },
      { userId: 'u8', role: 'operator' },
      { userId: 'u9', role: 'super_admin' },
      { userId: 'u10', role: 'creator' },
      { userId: 'u11', role: 'user' },
      { userId: 'u12', role: 'user' },
      { userId: 'u13', role: 'user' },
      { userId: 'u14', role: 'creator' },
      { userId: 'u15', role: 'user' },
      { userId: 'u16', role: 'user' },
      { userId: 'u17', role: 'reviewer' },
      { userId: 'u18', role: 'user' },
    ],
  })
  await Promise.all(users.map((user) => prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'user' } },
    update: {},
    create: { userId: user.id, role: 'user' },
  })))

  // ============ 业务领域 ============
  const domains = ['财务', '客服', '研发', '市场', 'HR', '法务', '数据治理']
  await prisma.businessDomain.createMany({
    data: domains.map((name, i) => ({ name, sortOrder: i })),
  })

  // ============ 标签 ============
  const tags = ['自动化', '知识库', '数据分析', '数据治理', '报表生成', '文案', '招聘', '可视化', '合同', '客服']
  await prisma.tag.createMany({
    data: tags.map((name, i) => ({ name, sortOrder: i })),
  })

  // ============ 作品（v1.3：版本号 v1/v2/v3 格式）============
  const works: SeedWork[] = [
    {
      id: 'w1',
      title: '自动报表生成 Skill',
      type: 'skill',
      category: '财务',
      tags: ['自动化', '报表生成', '数据分析'],
      authorId: 'u1',
      authorName: '李明',
      department: '财务部',
      intro: '自动从 ERP 抽数并生成月度财务报表的 Skill，支持多维度交叉分析。',
      usage: '1. 配置 ERP 数据源连接\n2. 选择报表模板\n3. 设置定时任务\n4. 自动生成并推送',
      businessValue: '月度报表生成时间从 2 天缩短至 30 分钟',
      scene: '月度财务结算 / 季度汇报',
      coreAbilities: ['多数据源接入', '模板化生成', '定时任务', '邮件推送'],
      currentVersion: 'v3',
      versions: [
        { version: 'v4', changelog: '新增定时任务功能', status: 'draft', changelogAuthor: '李明' },
        { version: 'v3', changelog: '修复数据解析 bug', status: 'passed', current: true, changelogAuthor: '李明' },
        { version: 'v2', changelog: '支持多数据源接入', status: 'passed', changelogAuthor: '李明' },
        { version: 'v1', changelog: '初始版本', status: 'passed', changelogAuthor: '李明' },
      ],
      likes: 32,
      favorites: 18,
      downloads: 45,
      views: 256,
    },
    {
      id: 'w2',
      title: '智能客服知识库 Agent',
      type: 'agent',
      category: '客服',
      tags: ['知识库', '客服', '自动化'],
      authorId: 'u2',
      authorName: '王芳',
      department: '客服中心',
      intro: '基于企业知识库的智能客服 Agent，自动匹配问答并支持人工接管。',
      usage: '1. 导入知识库\n2. 配置问答策略\n3. 部署到客服渠道\n4. 监控转人工率',
      businessValue: '客服首次响应时间从 3 分钟降至 30 秒',
      scene: '在线客服 / 工单分流',
      coreAbilities: ['语义检索', '多轮对话', '人工接管', '质检分析'],
      currentVersion: 'v2',
      versions: [
        { version: 'v2', changelog: '新增人工接管功能', status: 'passed', current: true, changelogAuthor: '王芳' },
        { version: 'v1', changelog: '初始版本', status: 'passed', changelogAuthor: '王芳' },
      ],
      likes: 28,
      favorites: 22,
      downloads: 38,
      views: 198,
    },
    {
      id: 'w3',
      title: '代码审查提示词',
      type: 'prompt',
      category: '研发',
      tags: ['数据分析'],
      authorId: 'u3',
      authorName: '张伟',
      department: '研发中心',
      intro: '针对代码审查场景优化的提示词，支持多语言代码的安全与质量检查。',
      usage: '1. 复制提示词\n2. 粘贴到对话窗口\n3. 提交代码片段\n4. 获取审查建议',
      businessValue: '代码审查效率提升 50%',
      scene: 'Pull Request 审查 / 安全扫描',
      coreAbilities: ['多语言支持', '安全漏洞识别', '最佳实践建议'],
      currentVersion: 'v1',
      versions: [
        { version: 'v1', changelog: '初始版本', status: 'passed', current: true, changelogAuthor: '张伟' },
      ],
      likes: 56,
      favorites: 41,
      downloads: 89,
      views: 412,
      recommended: true,
    },
    {
      id: 'w4',
      title: '数据治理工作流',
      type: 'workflow',
      category: '数据治理',
      tags: ['数据治理', '可视化'],
      authorId: 'u3',
      authorName: '张伟',
      department: '研发中心',
      intro: '覆盖数据采集、清洗、治理全流程的自动化工作流模板。',
      usage: '1. 导入工作流模板\n2. 配置数据源\n3. 设置治理规则\n4. 启动定时执行',
      businessValue: '数据治理周期从 2 周缩短至 2 天',
      scene: '数据中台建设 / 数据资产管理',
      coreAbilities: ['流程编排', '规则引擎', '质量监控'],
      currentVersion: 'v2',
      versions: [
        { version: 'v3', changelog: '新增质量监控面板', status: 'pending', submittedAt: new Date(Date.now() - 3600_000), changelogAuthor: '张伟', baseVersionId: 'v2' },
        { version: 'v2', changelog: '新增规则引擎', status: 'passed', current: true, changelogAuthor: '张伟' },
        { version: 'v1', changelog: '初始版本', status: 'passed', changelogAuthor: '张伟' },
      ],
      likes: 19,
      favorites: 12,
      downloads: 24,
      views: 134,
      recommended: true,
    },
    {
      id: 'w5',
      title: '招聘自动化案例方案',
      type: 'case',
      category: 'HR',
      tags: ['招聘', '自动化'],
      authorId: 'u4',
      authorName: '赵静',
      department: '运营部',
      intro: '基于 AI Agent 的招聘全流程自动化案例，含实施步骤与效果数据。',
      usage: '1. 下载案例模板\n2. 参考实施步骤\n3. 按需调整流程\n4. 复用附件资源',
      businessValue: '招聘周期缩短 40%',
      scene: '校招批量筛选 / 简历初筛',
      coreAbilities: ['简历解析', '智能评分', '面试安排'],
      currentVersion: 'v1',
      versions: [
        { version: 'v1', changelog: '初始版本', status: 'passed', current: true, changelogAuthor: '赵静' },
      ],
      likes: 15,
      favorites: 9,
      downloads: 18,
      views: 87,
    },
  ]

  for (const w of works) {
    await prisma.work.create({
      data: {
        id: w.id,
        title: w.title,
        type: w.type,
        category: w.category,
        intro: w.intro,
        usage: w.usage,
        businessValue: w.businessValue,
        scene: w.scene,
        coreAbilities: JSON.stringify(w.coreAbilities),
        authorId: w.authorId,
        authorName: w.authorName,
        department: w.department,
        status: 'published',
        currentVersion: w.currentVersion,
        likes: w.likes,
        favorites: w.favorites,
        downloads: w.downloads,
        views: w.views,
        recommended: w.recommended || false,
        publishedAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600_000),
        tags: { connect: w.tags.map((name) => ({ name })) },
        versions: {
          create: w.versions.map((v) => ({
            version: v.version,
            changelog: v.changelog,
            status: v.status,
            current: v.current || false,
            changelogAuthor: v.changelogAuthor,
            submittedAt: v.submittedAt,
            baseVersionId: v.baseVersionId,
            title: w.title,
            type: w.type,
            category: w.category,
            tagsJson: JSON.stringify(w.tags),
            intro: w.intro,
            usage: w.usage,
            businessValue: w.businessValue,
            scene: w.scene,
            coreAbilities: JSON.stringify(w.coreAbilities),
          })),
        },
        attachments: {
          create: [
            { name: `${w.title}.zip`, size: '2.4 MB', downloads: Math.floor(w.downloads / 2) },
          ],
        },
        comments: {
          create: [
            {
              userId: 'u4',
              userName: '赵静',
              department: '运营部',
              avatarColor: '#f59e0b',
              content: '这个作品非常实用，已经在工作中用上了！',
            },
          ],
        },
      },
    })
  }

  // 审核事件
  await prisma.reviewEvent.createMany({
    data: [
      { workId: 'w1', workTitle: '自动报表生成 Skill', version: 'v1', status: 'approved', isFirstVersion: true },
      { workId: 'w1', workTitle: '自动报表生成 Skill', version: 'v2', status: 'approved' },
      { workId: 'w1', workTitle: '自动报表生成 Skill', version: 'v3', status: 'approved' },
      { workId: 'w2', workTitle: '智能客服知识库 Agent', version: 'v1', status: 'approved', isFirstVersion: true },
      { workId: 'w2', workTitle: '智能客服知识库 Agent', version: 'v2', status: 'approved' },
      { workId: 'w3', workTitle: '代码审查提示词', version: 'v1', status: 'approved', isFirstVersion: true },
      { workId: 'w4', workTitle: '数据治理工作流', version: 'v1', status: 'approved', isFirstVersion: true },
      { workId: 'w4', workTitle: '数据治理工作流', version: 'v2', status: 'approved' },
      { workId: 'w4', workTitle: '数据治理工作流', version: 'v3', status: 'submitted' },
      { workId: 'w5', workTitle: '招聘自动化案例方案', version: 'v1', status: 'approved', isFirstVersion: true },
    ],
  })

  console.log(`✅ 种子数据填充完成`)
  console.log(`   用户: ${users.length} 个`)
  console.log(`   业务领域: ${domains.length} 个`)
  console.log(`   标签: ${tags.length} 个`)
  console.log(`   作品: ${works.length} 个`)
  console.log(`\n   默认用户 ID（前端联调用）:`)
  console.log(`     u6  = 赵强（创作者）    账号 EMP056  / Ai@2026community`)
  console.log(`     u9  = 周涛（超级管理员） 账号 admin   / Admin@2026`)
  console.log(`     u11 = 吴敏（普通用户）  账号 EMP103  / Ai@2026community`)
  console.log(`     u14 = 马超（创作者）    账号 EMP134  / Ai@2026community`)
  console.log(`     u18 = 杨帆（普通用户）  账号 EMP178  / Ai@2026community`)
}

main()
  .catch((e) => {
    console.error('❌ 种子数据填充失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
