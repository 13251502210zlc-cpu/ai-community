import type { Work, User, ReviewEvent } from '../types'

// 当前登录用户（v1.2：默认创作者角色，可切换以体验完整流程）
// v1.4：补充登录方式和账号状态字段
export const CURRENT_USER: User = {
  id: 'u1',
  name: '张明',
  department: '财务部',
  position: '数据分析师',
  roles: ['creator'],
  avatarColor: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
  employeeId: 'EMP001',
  loginMethod: 'wecom',
  accountStatus: 'active',
}

// 用户列表
export const USERS: User[] = [
  CURRENT_USER,
  { id: 'u2', name: '李芳', department: '市场部', position: '内容运营', roles: ['creator'], avatarColor: '#06b6d4', employeeId: 'EMP012', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u3', name: '王伟', department: '客服部', position: '客服主管', roles: ['creator'], avatarColor: '#f59e0b', employeeId: 'EMP023', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u4', name: '陈静', department: '法务部', position: '法务专员', roles: ['creator'], avatarColor: '#8b5cf6', employeeId: 'EMP034', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u5', name: '刘洋', department: 'HR部', position: '招聘经理', roles: ['creator'], avatarColor: '#ec4899', employeeId: 'EMP045', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u6', name: '赵强', department: '研发部', position: '前端工程师', roles: ['creator'], avatarColor: '#3b82f6', employeeId: 'EMP056', loginMethod: 'both', accountStatus: 'active', loginAccount: 'EMP056', password: 'Ai@2026community' },
  { id: 'u7', name: '王强', department: '运营部', position: '审核管理员', roles: ['reviewer'], avatarColor: '#ef4444', employeeId: 'EMP067', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u8', name: '赵琳', department: '运营部', position: '运营负责人', roles: ['operator'], avatarColor: '#10b981', employeeId: 'EMP078', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u9', name: '周涛', department: 'IT部', position: '系统管理员', roles: ['super_admin'], avatarColor: '#dc2626', employeeId: 'EMP089', loginMethod: 'both', accountStatus: 'active', loginAccount: 'admin', password: 'Admin@2026' },
  { id: 'u10', name: '孙杰', department: '研发部', position: '后端工程师', roles: ['creator'], avatarColor: '#0ea5e9', employeeId: 'EMP100', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u11', name: '吴敏', department: '财务部', position: '会计', roles: ['user'], avatarColor: '#14b8a6', employeeId: 'EMP103', loginMethod: 'password', accountStatus: 'active', loginAccount: 'EMP103', password: 'Ai@2026community' },
  { id: 'u12', name: '郑宇', department: '市场部', position: '品牌经理', roles: ['user'], avatarColor: '#f97316', employeeId: 'EMP112', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u13', name: '黄玲', department: '客服部', position: '客服专员', roles: ['user'], avatarColor: '#a855f7', employeeId: 'EMP125', loginMethod: 'wecom', accountStatus: 'disabled' },
  { id: 'u14', name: '马超', department: '研发部', position: '产品经理', roles: ['creator'], avatarColor: '#22c55e', employeeId: 'EMP134', loginMethod: 'both', accountStatus: 'active', loginAccount: 'EMP134', password: 'Ai@2026community' },
  { id: 'u15', name: '冯雪', department: 'HR部', position: 'HRBP', roles: ['user'], avatarColor: '#eab308', employeeId: 'EMP145', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u16', name: '陈刚', department: '法务部', position: '法务总监', roles: ['user'], avatarColor: '#64748b', employeeId: 'EMP156', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u17', name: '李娜', department: '运营部', position: '内容审核', roles: ['reviewer'], avatarColor: '#ef4444', employeeId: 'EMP167', loginMethod: 'wecom', accountStatus: 'active' },
  { id: 'u18', name: '杨帆', department: 'IT部', position: '运维工程师', roles: ['user'], avatarColor: '#0284c7', employeeId: 'EMP178', loginMethod: 'password', accountStatus: 'active', loginAccount: 'EMP178', password: 'Ai@2026community' },
]

// 用户活跃度模拟数据（id → { lastActive, worksCount, totalLikes, totalDownloads, status }）
export const USER_ACTIVITY: Record<string, { lastActive: string; worksCount: number; totalLikes: number; totalDownloads: number; status: 'active' | 'inactive' | 'blocked' }> = {
  u1: { lastActive: '2026-08-03 09:12', worksCount: 2, totalLikes: 105, totalDownloads: 163, status: 'active' },
  u2: { lastActive: '2026-08-03 08:45', worksCount: 1, totalLikes: 63, totalDownloads: 128, status: 'active' },
  u3: { lastActive: '2026-08-02 17:30', worksCount: 1, totalLikes: 55, totalDownloads: 47, status: 'active' },
  u4: { lastActive: '2026-08-02 14:20', worksCount: 1, totalLikes: 39, totalDownloads: 31, status: 'active' },
  u5: { lastActive: '2026-08-01 11:05', worksCount: 1, totalLikes: 28, totalDownloads: 19, status: 'active' },
  u6: { lastActive: '2026-07-30 16:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'inactive' },
  u7: { lastActive: '2026-08-03 10:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u8: { lastActive: '2026-08-03 09:30', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u9: { lastActive: '2026-08-03 08:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u10: { lastActive: '2026-07-25 10:30', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'inactive' },
  u11: { lastActive: '2026-08-03 09:15', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u12: { lastActive: '2026-08-02 15:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u13: { lastActive: '2026-07-15 14:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'inactive' },
  u14: { lastActive: '2026-08-01 16:30', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u15: { lastActive: '2026-08-03 08:50', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u16: { lastActive: '2026-07-20 11:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'inactive' },
  u17: { lastActive: '2026-08-03 09:45', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
  u18: { lastActive: '2026-08-02 09:00', worksCount: 0, totalLikes: 0, totalDownloads: 0, status: 'active' },
}

// 业务领域列表
export const BUSINESS_DOMAINS = ['财务', '客服', '研发', '市场', 'HR', '法务', '数据治理']
export const CATEGORIES = BUSINESS_DOMAINS

// 标签列表
export const TAGS = ['自动化', '知识库', '数据分析', '数据治理', '报表生成', '文案', '招聘', '可视化', '合同', '客服']

// 作品类型列表
export const WORK_TYPES = [
  { type: 'skill', label: 'Skill', icon: '🔧' },
  { type: 'app', label: '应用程序', icon: '📱' },
  { type: 'agent', label: '智能体', icon: '🤖' },
  { type: 'prompt', label: '提示词', icon: '💬' },
  { type: 'workflow', label: '工作流', icon: '⚡' },
  { type: 'case', label: '案例方案', icon: '📋' },
] as const

// 初始作品数据（v1.1：双层状态模型）
export const INITIAL_WORKS: Work[] = [
  {
    id: 'w1',
    title: '自动报表生成 Skill',
    type: 'skill',
    category: '财务',
    tags: ['财务', '自动化', '报表'],
    intro: '基于大语言模型自动解析数据源并生成标准财务报表，支持自定义模板和定时任务。',
    authorId: 'u1',
    authorName: '张明',
    department: '财务部',
    status: 'published',
    currentVersion: 'v3',
    usage: '1. 下载 .skill 文件并导入到 TRAE IDE；2. 在项目中配置数据源连接；3. 执行 Skill 并选择报表模板；4. 等待生成完成后查看或导出报表。',
    businessValue: '将月度报表生成时间从 4 小时缩短至 15 分钟，减少人工录入错误率 90%。',
    scene: '财务部门月度/季度报表生成、多部门数据汇总分析、财务数据可视化展示。',
    coreAbilities: [
      '自动解析 Excel / CSV / 数据库数据源',
      '支持自定义报表模板（利润表、资产负债表、现金流量表等）',
      '定时任务调度，支持按月 / 周 / 日自动生成',
      '生成结果可导出为 Excel / PDF',
    ],
    attachments: [
      { id: 'a1', name: 'report-skill-v3.skill', size: '2.3MB', downloads: 35 },
      { id: 'a2', name: '使用文档.md', size: '12KB', downloads: 28 },
    ],
    versions: [
      { version: 'v4', changelog: '新增定时任务功能；修复多数据源兼容性问题', date: '2026-07-28', status: 'draft', changelogAuthor: '张明' },
      { version: 'v3', changelog: '新增定时任务功能；修复多数据源兼容性问题', date: '2026-07-28', status: 'passed', current: true, submittedAt: '2026-07-28 09:15', reviewedAt: '2026-07-28 10:00', reviewer: '王强' },
      { version: 'v2', changelog: '支持 PDF 导出；优化生成速度', date: '2026-07-15', status: 'passed', submittedAt: '2026-07-15', reviewedAt: '2026-07-15', reviewer: '王强' },
      { version: 'v1', changelog: '初始版本', date: '2026-06-30', status: 'passed', submittedAt: '2026-06-30', reviewedAt: '2026-06-30', reviewer: '王强' },
    ],
    comments: [
      { id: 'c1', userId: 'u2', userName: '李芳', department: '市场部', avatarColor: '#06b6d4', content: '很好用！配置数据源后一键生成报表，省了大量手动整理的时间。期待支持更多报表模板。', date: '2026-07-30' },
      { id: 'c2', userId: 'u3', userName: '王伟', department: '客服部', avatarColor: '#f59e0b', content: '我们部门也参考这个思路做了一个客服数据周报的 Skill，感谢分享！', date: '2026-07-29' },
    ],
    likes: 42,
    favorites: 18,
    downloads: 35,
    views: 312,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-06-30',
    publishedAt: '2026-06-30',
    recommended: false,
  },
  {
    id: 'w2',
    title: '智能财务问答 Bot',
    type: 'agent',
    category: '财务',
    tags: ['财务', '自动化'],
    intro: '基于知识库的财务政策智能问答 Bot，自动回答报销、预算、税务等常见问题。',
    authorId: 'u1',
    authorName: '张明',
    department: '财务部',
    status: 'published',
    currentVersion: 'v1',
    usage: '1. 导入 Bot 配置到扣子平台；2. 上传财务政策知识库文档；3. 发布到企业内部渠道；4. 员工通过对话获取答案。',
    businessValue: '减少财务部 60% 的重复咨询工作量，员工问题平均响应时间从 4 小时降至即时。',
    scene: '财务政策咨询、报销流程指导、预算使用规则查询。',
    coreAbilities: [
      '基于 RAG 的知识库问答',
      '多轮对话上下文理解',
      '支持文档、Excel、PDF 知识源',
      '答案附带原文引用',
    ],
    attachments: [{ id: 'a3', name: 'finance-bot-v1.zip', size: '5.1MB', downloads: 72 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-07-20', status: 'passed', current: true, submittedAt: '2026-07-20', reviewedAt: '2026-07-20', reviewer: '王强' }],
    comments: [],
    likes: 87,
    favorites: 56,
    downloads: 72,
    views: 524,
    likedByMe: false,
    favoritedByMe: true,
    createdAt: '2026-07-20',
    publishedAt: '2026-07-20',
    recommended: true,
  },
  {
    id: 'w3',
    title: '营销文案生成 Prompt v2',
    type: 'prompt',
    category: '市场',
    tags: ['市场', '文案'],
    intro: '针对电商营销场景优化的 Prompt 模板，支持生成商品描述、广告语、社交媒体文案。',
    authorId: 'u2',
    authorName: '李芳',
    department: '市场部',
    status: 'published',
    currentVersion: 'v2',
    usage: '1. 下载 Prompt 文本文件；2. 复制到 LLM 对话框；3. 替换占位符为实际商品信息；4. 获取生成文案。',
    businessValue: '文案创作效率提升 5 倍，单条商品文案生成成本从 30 元降至 0 元。',
    scene: '电商商品描述生成、社交媒体广告文案、营销活动口号创作。',
    coreAbilities: [
      '支持多种文案风格（专业、活泼、文艺）',
      '自动适配不同平台字数限制',
      '内置 A/B 测试变体生成',
      'SEO 关键词自动融入',
    ],
    attachments: [{ id: 'a4', name: 'marketing-prompt-v2.md', size: '8KB', downloads: 128 }],
    versions: [
      { version: 'v2', changelog: '新增多风格支持；优化生成质量', date: '2026-07-25', status: 'passed', current: true, submittedAt: '2026-07-25', reviewedAt: '2026-07-25', reviewer: '王强' },
      { version: 'v1', changelog: '初始版本', date: '2026-07-10', status: 'passed', submittedAt: '2026-07-10', reviewedAt: '2026-07-10', reviewer: '王强' },
    ],
    comments: [],
    likes: 63,
    favorites: 41,
    downloads: 128,
    views: 689,
    likedByMe: true,
    favoritedByMe: true,
    createdAt: '2026-07-10',
    publishedAt: '2026-07-10',
    recommended: true,
  },
  {
    id: 'w4',
    title: '客服工单自动分发流程',
    type: 'workflow',
    category: '客服',
    tags: ['客服', '自动化'],
    intro: '基于工单内容智能分类并自动分发到对应客服组的工作流，支持优先级排序和超时升级。',
    authorId: 'u3',
    authorName: '王伟',
    department: '客服部',
    status: 'published',
    currentVersion: 'v1',
    usage: '1. 导入工作流配置到 Dify；2. 连接工单系统 API；3. 配置客服组路由规则；4. 启用自动分发。',
    businessValue: '工单首次响应时间缩短 70%，分发准确率 95%，客服组负载均衡。',
    scene: '客服工单智能路由、优先级自动排序、超时工单升级处理。',
    coreAbilities: [
      '基于 NLP 的工单意图识别',
      '多级优先级队列',
      '客服组负载均衡分发',
      '超时自动升级机制',
    ],
    attachments: [{ id: 'a5', name: 'ticket-workflow.json', size: '15KB', downloads: 47 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-07-18', status: 'passed', current: true, submittedAt: '2026-07-18', reviewedAt: '2026-07-18', reviewer: '王强' }],
    comments: [],
    likes: 55,
    favorites: 33,
    downloads: 47,
    views: 298,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-07-18',
    publishedAt: '2026-07-18',
    recommended: true,
  },
  {
    id: 'w5',
    title: '合同智能审查工具',
    type: 'app',
    category: '法务',
    tags: ['法务', '合同'],
    intro: '基于大模型自动识别合同风险条款并标注修改建议的 Web 应用，支持多种合同模板。',
    authorId: 'u4',
    authorName: '陈静',
    department: '法务部',
    status: 'published',
    currentVersion: 'v1',
    usage: '1. 访问应用 URL；2. 上传合同文档（Word/PDF）；3. 等待智能分析；4. 查看风险报告并下载修改建议。',
    businessValue: '合同审查时间从 2 小时降至 10 分钟，风险条款识别覆盖率 92%。',
    scene: '采购合同审查、销售合同审查、劳动合同合规检查。',
    coreAbilities: [
      '自动识别 30+ 类风险条款',
      '条款对比与差异标注',
      '修改建议自动生成',
      '审查报告一键导出',
    ],
    attachments: [{ id: 'a6', name: 'contract-review-app.zip', size: '12.5MB', downloads: 31 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-07-12', status: 'passed', current: true, submittedAt: '2026-07-12', reviewedAt: '2026-07-12', reviewer: '王强' }],
    comments: [],
    likes: 39,
    favorites: 22,
    downloads: 31,
    views: 187,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-07-12',
    publishedAt: '2026-07-12',
    recommended: false,
  },
  {
    id: 'w6',
    title: 'AI 辅助招聘面试方案',
    type: 'case',
    category: 'HR',
    tags: ['HR', '招聘'],
    intro: '完整的企业内部 AI 辅助招聘面试落地方案，包含面试问题生成、回答评估、能力建模。',
    authorId: 'u5',
    authorName: '刘洋',
    department: 'HR部',
    status: 'published',
    currentVersion: 'v1',
    usage: '1. 下载方案文档；2. 按章节了解实施步骤；3. 复用面试 Prompt 模板；4. 结合 ATS 系统落地。',
    businessValue: '面试评估一致性提升 40%，面试官培训周期从 2 周缩短至 3 天。',
    scene: '结构化面试问题生成、候选人回答智能评估、面试官能力培训。',
    coreAbilities: [
      '岗位胜任力模型构建',
      '面试问题智能生成',
      '回答质量多维评估',
      '面试报告自动输出',
    ],
    attachments: [{ id: 'a7', name: 'ai-recruitment-plan.pdf', size: '3.8MB', downloads: 19 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-07-08', status: 'passed', current: true, submittedAt: '2026-07-08', reviewedAt: '2026-07-08', reviewer: '王强' }],
    comments: [],
    likes: 28,
    favorites: 15,
    downloads: 19,
    views: 156,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-07-08',
    publishedAt: '2026-07-08',
    recommended: false,
  },
  // 未发布 - 待审核首版本（v1.1：作品状态=未发布，版本状态=待审核）
  {
    id: 'w7',
    title: '预算分析自动化工作流',
    type: 'workflow',
    category: '财务',
    tags: ['财务', '自动化'],
    intro: '自动拉取各部门预算数据并生成差异分析报告的工作流，支持预算超支预警。',
    authorId: 'u1',
    authorName: '张明',
    department: '财务部',
    status: 'unpublished',
    usage: '1. 导入工作流配置；2. 配置预算数据源；3. 设置预警阈值；4. 启用定时执行。',
    businessValue: '预算分析周期从 3 天缩短至 2 小时。',
    scene: '部门预算执行监控、预算差异分析、超支预警。',
    coreAbilities: ['多部门预算数据聚合', '预算差异自动分析', '超支阈值预警'],
    attachments: [{ id: 'a8', name: 'budget-workflow.json', size: '18KB', downloads: 0 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-08-03', status: 'pending', submittedAt: '2026-08-03 09:15' }],
    comments: [],
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-08-03',
    recommended: false,
  },
  // 未发布 - 待审核（其他用户首次发布）
  {
    id: 'w8',
    title: '智能客服话术推荐器',
    type: 'agent',
    category: '客服',
    tags: ['客服'],
    intro: '根据客户问题实时推荐最佳客服话术的智能体，支持多场景话术库。',
    authorId: 'u3',
    authorName: '王伟',
    department: '客服部',
    status: 'unpublished',
    usage: '1. 导入 Bot 配置；2. 配置话术知识库；3. 接入客服工作台。',
    businessValue: '客服响应速度提升 50%，话术规范度 95%。',
    scene: '在线客服实时辅助、新员工话术培训。',
    coreAbilities: ['实时话术匹配', '多场景话术库', '话术效果反馈'],
    attachments: [{ id: 'a9', name: 'talk-recommend.zip', size: '4.2MB', downloads: 0 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-08-03', status: 'pending', submittedAt: '2026-08-03 08:42' }],
    comments: [],
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-08-03',
    recommended: false,
  },
  // 未发布 - 已驳回（v1.1：查看驳回意见不改变状态，版本保持已驳回）
  {
    id: 'w9',
    title: '发票识别 Prompt',
    type: 'prompt',
    category: '财务',
    tags: ['财务'],
    intro: '用于识别发票信息的 Prompt。',
    authorId: 'u1',
    authorName: '张明',
    department: '财务部',
    status: 'unpublished',
    usage: '使用该 Prompt 识别发票。',
    businessValue: '',
    scene: '发票识别',
    coreAbilities: ['发票信息提取'],
    attachments: [{ id: 'a10', name: 'invoice-prompt.md', size: '4KB', downloads: 0 }],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-08-02', status: 'rejected', submittedAt: '2026-08-02 15:00', reviewedAt: '2026-08-02 16:30', reviewer: '王强', rejectReason: '请补充使用说明中的具体操作步骤，当前描述过于简略，其他同事难以复现。同时建议增加业务价值中的量化数据（如节省时间、提升效率的具体百分比）。' }],
    comments: [],
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-08-02',
    recommended: false,
  },
  // 未发布 - 草稿
  {
    id: 'w10',
    title: '财务数据看板模板',
    type: 'case',
    category: '财务',
    tags: ['财务', '可视化'],
    intro: '财务数据可视化看板模板方案。',
    authorId: 'u1',
    authorName: '张明',
    department: '财务部',
    status: 'unpublished',
    usage: '',
    businessValue: '',
    scene: '',
    coreAbilities: [],
    attachments: [],
    versions: [{ version: 'v1', changelog: '初始版本', date: '2026-08-01', status: 'draft' }],
    comments: [],
    likes: 0,
    favorites: 0,
    downloads: 0,
    views: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-08-01',
    recommended: false,
  },
]

// 审核进度 timeline 事件（v1.1：标注版本号）
export const INITIAL_REVIEW_EVENTS: ReviewEvent[] = [
  { id: 'r1', workId: 'w7', workTitle: '预算分析自动化工作流', version: 'v1', status: 'submitted', date: '2026-08-03 09:15', isFirstVersion: true },
  { id: 'r2', workId: 'w9', workTitle: '发票识别 Prompt', version: 'v1', status: 'rejected', date: '2026-08-02 16:30', reviewer: '王强', reason: '请补充使用说明中的具体操作步骤，当前描述过于简略，其他同事难以复现。同时建议增加业务价值中的量化数据。' },
  { id: 'r3', workId: 'w1', workTitle: '自动报表生成 Skill', version: 'v3', status: 'approved', date: '2026-07-28 10:00', reviewer: '王强' },
  { id: 'r4', workId: 'w2', workTitle: '智能财务问答 Bot', version: 'v1', status: 'approved', date: '2026-07-20 14:30', reviewer: '王强', isFirstVersion: true },
]

// v1.2 权限矩阵数据（功能操作 × 5 角色）
export interface PermRow {
  group: string
  op: string
  cells: { user: PermCellVal; creator: PermCellVal; reviewer: PermCellVal; operator: PermCellVal; super_admin: PermCellVal }
  desc?: string
}
type PermCellVal = 'yes' | 'own' | 'no'

export const PERMISSION_MATRIX: PermRow[] = [
  // 作品大厅
  { group: '作品大厅', op: '浏览已发布作品', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色默认拥有' },
  { group: '作品大厅', op: '搜索 / 筛选 / 排序', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色默认拥有' },
  { group: '作品大厅', op: '点赞 / 收藏 / 下载', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色默认拥有' },
  { group: '作品大厅', op: '发表评论 / 评价', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色默认拥有' },
  // 作品发布
  { group: '作品发布', op: '创建作品 / 保存草稿版本', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '创作者及以上角色可用' },
  { group: '作品发布', op: '提交版本审核', cells: { user: 'no', creator: 'yes', reviewer: 'no', operator: 'no', super_admin: 'yes' }, desc: '创作者及以上角色可用' },
  { group: '作品发布', op: '编辑已发布作品（生成新版本）', cells: { user: 'no', creator: 'own', reviewer: 'own', operator: 'own', super_admin: 'yes' }, desc: '仅编辑自己创建的作品' },
  { group: '作品发布', op: '撤回待审核版本', cells: { user: 'no', creator: 'own', reviewer: 'own', operator: 'own', super_admin: 'yes' }, desc: '仅撤回自己的版本' },
  { group: '作品发布', op: '查看驳回意见 / 去修改', cells: { user: 'no', creator: 'own', reviewer: 'own', operator: 'own', super_admin: 'yes' }, desc: '仅查看自己的版本' },
  { group: '作品发布', op: '删除自己的作品', cells: { user: 'no', creator: 'own', reviewer: 'own', operator: 'own', super_admin: 'yes' }, desc: '仅删除自己的作品' },
  // 审核管理
  { group: '审核管理', op: '查看审核队列', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'no', super_admin: 'yes' }, desc: '审核管理员核心权限' },
  { group: '审核管理', op: '审核通过版本', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'no', super_admin: 'yes' }, desc: '通过后版本状态变为已通过' },
  { group: '审核管理', op: '驳回版本（须填意见）', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'no', super_admin: 'yes' }, desc: '驳回只影响被审核版本' },
  { group: '审核管理', op: '下载待审核附件', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'no', super_admin: 'yes' }, desc: '仅用于审核目的' },
  // 作品详情
  { group: '作品详情', op: '查看作品详情（已发布）', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色可查看已发布作品' },
  { group: '作品详情', op: '查看作品详情（未发布/已下架）', cells: { user: 'no', creator: 'own', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '作者可查看自己的未发布作品' },
  { group: '作品详情', op: '查看版本历史', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色可查看版本历史' },
  { group: '作品详情', op: '删除评论（违规）', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '审核管理员及以上可用' },
  { group: '作品详情', op: '下架作品', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'no', super_admin: 'yes' }, desc: '审核管理员及以上可用' },
  // 个人中心
  { group: '个人中心', op: '查看自己的作品 / 收藏 / 点赞', cells: { user: 'yes', creator: 'yes', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '所有角色可查看个人中心' },
  { group: '个人中心', op: '查看审核进度', cells: { user: 'no', creator: 'own', reviewer: 'own', operator: 'own', super_admin: 'yes' }, desc: '仅查看自己的审核进度' },
  // 后台管理
  // v1.5：新增作品管理四项权限——审核管理员和运营管理员均可用
  { group: '后台管理', op: '作品管理 — 查看全部作品列表', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '审核管理员及以上可用' },
  { group: '后台管理', op: '作品管理 — 上架/下架作品', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '审核管理员及以上可用' },
  { group: '后台管理', op: '作品管理 — 编辑作品（生成新版本）', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '修改后走审核流程' },
  { group: '后台管理', op: '作品管理 — 删除作品', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '软删除，数据归档保留' },
  { group: '后台管理', op: '业务领域 / 标签管理', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'yes', super_admin: 'yes' }, desc: '运营管理员及以上可用' },
  { group: '后台管理', op: '用户管理 / 角色查看', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'yes', super_admin: 'yes' }, desc: '运营管理员及以上可用' },
  { group: '后台管理', op: '运营推荐管理', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'yes', super_admin: 'yes' }, desc: '运营管理员及以上可用' },
  { group: '后台管理', op: '数据统计查看', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '审核管理员及以上可用' },
  { group: '后台管理', op: '权限配置 / 角色分配', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'no', super_admin: 'yes' }, desc: '仅超级管理员可用' },
  { group: '后台管理', op: '强制删除作品（违规）', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'no', super_admin: 'yes' }, desc: '运营管理员及以上可用' },
  // v1.5：操作日志三项权限
  { group: '后台管理', op: '操作日志 — 查看自身记录', cells: { user: 'no', creator: 'no', reviewer: 'yes', operator: 'yes', super_admin: 'yes' }, desc: '审核管理员及以上可查看自身操作' },
  { group: '后台管理', op: '操作日志 — 查看全部记录', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'no', super_admin: 'yes' }, desc: '仅超级管理员可用' },
  { group: '后台管理', op: '操作日志 — 导出', cells: { user: 'no', creator: 'no', reviewer: 'no', operator: 'no', super_admin: 'yes' }, desc: '仅超级管理员可用' },
]

// 基础不可取消的权限（v1.2：对所有角色永久开放）
export const BASIC_PERMS = ['浏览已发布作品', '搜索 / 筛选 / 排序', '点赞 / 收藏 / 下载', '发表评论 / 评价']

// ============ 操作日志（v1.5） ============
// 日志模块枚举（与 PRD 原型筛选项对齐）
export const LOG_MODULES = ['作品大厅', '作品发布', '审核管理', '作品详情', '个人中心', '后台管理', '登录认证'] as const
export type LogModule = typeof LOG_MODULES[number]

// 日志操作类型枚举
export const LOG_ACTIONS = ['创建', '更新', '删除', '审核', '上架/下架', '登录/登出', '角色分配'] as const
export type LogAction = typeof LOG_ACTIONS[number]

// 操作日志条目
export interface OperationLog {
  id: string              // 日志ID（如 #10286）
  time: string            // 操作时间 YYYY-MM-DD HH:mm:ss
  operatorId: string      // 操作人ID
  operatorName: string    // 操作人姓名
  department: string      // 操作人部门
  role: string            // 操作人角色（展示用）
  module: LogModule       // 模块
  action: LogAction       // 操作类型
  content: string         // 操作内容
  target: string          // 操作对象
  ip: string              // IP地址
  result: 'success' | 'failed'  // 执行结果
}

// 初始操作日志模拟数据（与 PRD 原型示例对齐）
export const INITIAL_OPERATION_LOGS: OperationLog[] = [
  { id: '10286', time: '2026-08-06 10:15:32', operatorId: 'u7', operatorName: '王强', department: '运营部', role: '审核管理员', module: '审核管理', action: '审核', content: '通过版本审核', target: '自动报表生成 Skill v4', ip: '10.12.3.45', result: 'success' },
  { id: '10285', time: '2026-08-06 10:12:08', operatorId: 'u1', operatorName: '张明', department: '财务部', role: '创作者', module: '作品发布', action: '创建', content: '提交版本审核', target: '自动报表生成 Skill v4', ip: '10.12.5.78', result: 'success' },
  { id: '10284', time: '2026-08-06 09:58:41', operatorId: 'u8', operatorName: '赵琳', department: '运营部', role: '运营管理员', module: '后台管理', action: '上架/下架', content: '下架作品', target: '合同智能审查工具', ip: '10.12.4.12', result: 'success' },
  { id: '10283', time: '2026-08-06 09:45:15', operatorId: 'u11', operatorName: '吴敏', department: '财务部', role: '普通用户', module: '登录认证', action: '登录/登出', content: '账号密码登录', target: 'EMP103', ip: '10.12.6.90', result: 'success' },
  { id: '10282', time: '2026-08-06 09:30:03', operatorId: 'u9', operatorName: '周涛', department: 'IT部', role: '超级管理员', module: '后台管理', action: '角色分配', content: '为用户分配审核管理员角色', target: '李芳 (EMP012)', ip: '10.12.1.5', result: 'success' },
  { id: '10281', time: '2026-08-06 09:22:47', operatorId: 'u7', operatorName: '王强', department: '运营部', role: '审核管理员', module: '审核管理', action: '审核', content: '驳回版本（附修改意见）', target: '营销文案生成 Prompt v3', ip: '10.12.3.45', result: 'success' },
  { id: '10280', time: '2026-08-06 09:10:22', operatorId: 'u1', operatorName: '张明', department: '财务部', role: '创作者', module: '作品详情', action: '更新', content: '收藏作品', target: '智能财务问答 Bot', ip: '10.12.5.78', result: 'success' },
  { id: '10279', time: '2026-08-06 08:55:10', operatorId: 'u2', operatorName: '李芳', department: '市场部', role: '创作者', module: '作品发布', action: '创建', content: '新建作品草稿', target: '营销文案生成 Prompt v3', ip: '10.12.2.34', result: 'success' },
  { id: '10278', time: '2026-08-06 08:30:00', operatorId: 'u9', operatorName: '周涛', department: 'IT部', role: '超级管理员', module: '后台管理', action: '更新', content: '重置用户密码为默认密码', target: '马超 (EMP134)', ip: '10.12.1.5', result: 'success' },
  { id: '10277', time: '2026-08-06 08:15:48', operatorId: 'u11', operatorName: '吴敏', department: '财务部', role: '普通用户', module: '登录认证', action: '登录/登出', content: '账号密码登录', target: 'EMP103', ip: '10.12.6.90', result: 'failed' },
  { id: '10276', time: '2026-08-05 18:42:19', operatorId: 'u3', operatorName: '王伟', department: '客服部', role: '创作者', module: '作品详情', action: '删除', content: '删除作品评论', target: '客服工单自动分发流程', ip: '10.12.7.11', result: 'success' },
  { id: '10275', time: '2026-08-05 17:30:05', operatorId: 'u8', operatorName: '赵琳', department: '运营部', role: '运营管理员', module: '后台管理', action: '上架/下架', content: '上架作品', target: 'AI 辅助招聘面试方案', ip: '10.12.4.12', result: 'success' },
  { id: '10274', time: '2026-08-05 16:20:33', operatorId: 'u9', operatorName: '周涛', department: 'IT部', role: '超级管理员', module: '后台管理', action: '删除', content: '批量删除作品（软删除）', target: '测试废弃作品 x3', ip: '10.12.1.5', result: 'success' },
  { id: '10273', time: '2026-08-05 15:08:12', operatorId: 'u7', operatorName: '王强', department: '运营部', role: '审核管理员', module: '审核管理', action: '审核', content: '通过版本审核', target: '客服工单自动分发流程 v1', ip: '10.12.3.45', result: 'success' },
  { id: '10272', time: '2026-08-05 14:45:00', operatorId: 'u1', operatorName: '张明', department: '财务部', role: '创作者', module: '个人中心', action: '登录/登出', content: '退出登录', target: '张明', ip: '10.12.5.78', result: 'success' },
]
