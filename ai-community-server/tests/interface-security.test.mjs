import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

process.env.NODE_ENV = 'test'
process.env.AUTH_SECRET = 'interface-security-test-secret-at-least-32-characters'
delete process.env.ALLOW_DEMO_AUTH_HEADERS

const { default: app } = await import('../dist/app.js')
const { prisma } = await import('../dist/lib/prisma.js')
const { signToken } = await import('../dist/lib/jwt.js')

const suffix = Date.now().toString(36)
const normalId = `test-user-${suffix}`
const adminId = `test-admin-${suffix}`
const disabledId = `test-disabled-${suffix}`
const workId = `test-work-${suffix}`
const domainName = `测试领域-${suffix}`
let server
let baseUrl

function token(userId, roles) {
  return signToken({ userId, roles, name: userId, loginType: 'password' }, '10m')
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options)
}

before(async () => {
  await prisma.businessDomain.create({ data: { name: domainName } })
  await prisma.user.createMany({
    data: [
      { id: normalId, name: '测试用户', department: '测试部', position: '员工', role: 'user', accountStatus: 'active' },
      { id: adminId, name: '测试超管', department: 'IT部', position: '管理员', role: 'super_admin', accountStatus: 'active', password: 'must-not-leak' },
      { id: disabledId, name: '禁用用户', department: '测试部', position: '员工', role: 'user', accountStatus: 'disabled' },
    ],
  })
  await prisma.userRole.createMany({
    data: [
      { userId: normalId, role: 'user' },
      { userId: adminId, role: 'user' },
      { userId: adminId, role: 'super_admin' },
      { userId: disabledId, role: 'user' },
    ],
  })
  await prisma.work.create({
    data: {
      id: workId,
      title: `私有测试作品-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '这是一个未发布且不应被其他用户读取的测试作品。',
      usage: '这是满足长度要求的测试使用说明内容，仅供自动化测试使用。',
      authorId: adminId,
      authorName: '测试超管',
      department: 'IT部',
      status: 'unpublished',
    },
  })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`
      resolve()
    })
  })
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => setTimeout(resolve, 50))
  await prisma.operationLog.deleteMany({ where: { operatorId: { in: [normalId, adminId, disabledId] } } })
  await prisma.work.deleteMany({ where: { id: workId } })
  await prisma.work.deleteMany({ where: { title: { contains: suffix } } })
  await prisma.userRole.deleteMany({ where: { userId: { in: [normalId, adminId, disabledId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [normalId, adminId, disabledId] } } })
  await prisma.businessDomain.deleteMany({ where: { OR: [{ name: domainName }, { name: { contains: suffix } }] } })
  await prisma.$disconnect()
})

test('作品接口必须登录且演示请求头默认不可用', async () => {
  assert.equal((await request('/api/works')).status, 401)
  assert.equal((await request('/api/works', { headers: { 'x-user-id': normalId, 'x-user-roles': 'super_admin' } })).status, 401)
})

test('普通用户不能编辑、删除或撤回他人的作品版本', async () => {
  const auth = { authorization: `Bearer ${token(normalId, ['user'])}`, 'content-type': 'application/json' }
  const pending = await prisma.workVersion.create({
    data: {
      workId,
      version: 'v-security',
      status: 'pending',
      changelog: '验证他人版本不可被撤回',
      title: `私有测试作品-${suffix}`,
      type: 'prompt',
      category: domainName,
      tagsJson: JSON.stringify(['自动化测试']),
      intro: '这是一个用于验证越权拦截的待审核版本。',
      usage: '这是满足长度要求的测试使用说明内容，仅供自动化测试使用。',
    },
  })
  try {
    const updateResponse = await request(`/api/works/${workId}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ title: `越权修改-${suffix}` }),
    })
    assert.equal(updateResponse.status, 403)

    const withdrawResponse = await request(`/api/works/${workId}/versions/${pending.version}/withdraw`, {
      method: 'POST',
      headers: auth,
    })
    assert.equal(withdrawResponse.status, 403)

    const deleteResponse = await request(`/api/works/${workId}`, { method: 'DELETE', headers: auth })
    assert.equal(deleteResponse.status, 403)
    assert.notEqual((await prisma.work.findUnique({ where: { id: workId } })).status, 'deleted')
    assert.equal((await prisma.workVersion.findUnique({ where: { id: pending.id } })).status, 'pending')
  } finally {
    await prisma.workVersion.deleteMany({ where: { id: pending.id } })
  }
})

test('封面上传后返回可直接访问的图片地址', async () => {
  const form = new FormData()
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'cover.png')
  const response = await request('/api/upload/cover', {
    method: 'POST',
    headers: { authorization: `Bearer ${token(normalId, ['user'])}` },
    body: form,
  })
  assert.equal(response.status, 200)
  const uploaded = await response.json()
  assert.match(uploaded.url, /^\/api\/uploads\/covers\//)
  const imageResponse = await request(uploaded.url)
  assert.equal(imageResponse.status, 200)
  assert.match(imageResponse.headers.get('content-type') || '', /^image\/png/)
  fs.rmSync(path.resolve('uploads', 'covers', path.basename(uploaded.url)), { force: true })
})

test('点赞收藏后详情、本人作品和后台作品列表均返回当前用户状态', async () => {
  await prisma.work.update({ where: { id: workId }, data: { status: 'published' } })
  const adminHeaders = { authorization: `Bearer ${token(adminId, ['super_admin'])}` }
  assert.equal((await request(`/api/works/${workId}/like`, { method: 'POST', headers: adminHeaders })).status, 200)
  assert.equal((await request(`/api/works/${workId}/favorite`, { method: 'POST', headers: adminHeaders })).status, 200)
  const ownerDetail = await request(`/api/works/${workId}`, { headers: adminHeaders })
  assert.equal(ownerDetail.status, 200)
  const body = await ownerDetail.json()
  assert.equal(body.likedByMe, true)
  assert.equal(body.favoritedByMe, true)

  const ownerWorksResponse = await request(`/api/users/${adminId}/works`, { headers: adminHeaders })
  assert.equal(ownerWorksResponse.status, 200)
  const ownerWork = (await ownerWorksResponse.json()).find((work) => work.id === workId)
  assert.equal(ownerWork.likedByMe, true)
  assert.equal(ownerWork.favoritedByMe, true)

  const adminWorksResponse = await request('/api/admin/works?pageSize=100', { headers: adminHeaders })
  assert.equal(adminWorksResponse.status, 200)
  const adminWork = (await adminWorksResponse.json()).items.find((work) => work.id === workId)
  assert.equal(adminWork.likedByMe, true)
  assert.equal(adminWork.favoritedByMe, true)
  await prisma.userLike.deleteMany({ where: { userId: adminId, workId } })
  await prisma.userFavorite.deleteMany({ where: { userId: adminId, workId } })
  await prisma.work.update({ where: { id: workId }, data: { status: 'unpublished', likes: 0, favorites: 0 } })
})

test('附件删除 POST 兼容入口必须登录且可删除本人的待上传附件', async () => {
  assert.equal((await request('/api/upload/attachment/test-file/delete', { method: 'POST' })).status, 401)
  const storedName = `pending-${suffix}.txt`
  await prisma.pendingUpload.create({
    data: { storedName, uploaderId: normalId, name: '待删除附件.txt', size: '1 KB', url: `/api/upload/attachment/${storedName}` },
  })
  const response = await request(`/api/upload/attachment/${storedName}/delete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token(normalId, ['user'])}` },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true })
  assert.equal(await prisma.pendingUpload.findUnique({ where: { storedName } }), null)
})

test('用户不能自行切换为超级管理员', async () => {
  const response = await request('/api/auth/switch-role', {
    method: 'POST',
    headers: { authorization: `Bearer ${token(normalId, ['user'])}`, 'content-type': 'application/json' },
    body: JSON.stringify({ roles: ['super_admin'] }),
  })
  assert.equal(response.status, 403)
  assert.equal(await prisma.userRole.count({ where: { userId: normalId, role: 'super_admin' } }), 0)
})

test('管理员用户列表不泄露密码', async () => {
  const response = await request('/api/admin/users', { headers: { authorization: `Bearer ${token(adminId, ['super_admin'])}` } })
  assert.equal(response.status, 200)
  const body = await response.json()
  const admin = body.items.find((item) => item.id === adminId)
  assert.ok(admin)
  assert.equal(Object.hasOwn(admin, 'password'), false)
})

test('权限矩阵接口持久化配置且当前用户权限接口返回实际生效值', async () => {
  const adminHeaders = { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' }
  const originalRows = await prisma.rolePermission.findMany({ where: { role: 'user' } })
  const beforeResponse = await request('/api/admin/permission-matrix', { headers: adminHeaders })
  assert.equal(beforeResponse.status, 200)

  try {
    const updateResponse = await request('/api/admin/permission-matrix/user', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ permissions: ['work:read'] }),
    })
    assert.equal(updateResponse.status, 200)

    const normalHeaders = { authorization: `Bearer ${token(normalId, ['user'])}` }
    const permissionResponse = await request('/api/auth/permissions', { headers: normalHeaders })
    assert.equal(permissionResponse.status, 200)
    assert.deepEqual((await permissionResponse.json()).permissions, ['work:read'])

    const createResponse = await request('/api/works', {
      method: 'POST',
      headers: { ...normalHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(createResponse.status, 403)
  } finally {
    await prisma.rolePermission.deleteMany({ where: { role: 'user' } })
    if (originalRows.length > 0) {
      await prisma.rolePermission.createMany({
        data: originalRows.map(({ role, permission, allowed }) => ({ role, permission, allowed })),
      })
    }
  }
})

test('超级管理员始终拥有系统全部权限且不受历史配置影响', async () => {
  const originalRows = await prisma.rolePermission.findMany({ where: { role: 'super_admin' } })
  const adminHeaders = { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' }
  try {
    await prisma.rolePermission.deleteMany({ where: { role: 'super_admin' } })
    await prisma.rolePermission.create({ data: { role: 'super_admin', permission: 'work:read', allowed: false } })

    const permissionsResponse = await request('/api/auth/permissions', { headers: adminHeaders })
    assert.equal(permissionsResponse.status, 200)
    const permissions = (await permissionsResponse.json()).permissions
    assert.ok(permissions.includes('admin:role'))
    assert.ok(permissions.includes('admin:workManage'))
    assert.ok(permissions.includes('work:create'))

    const matrixResponse = await request('/api/admin/permission-matrix', { headers: adminHeaders })
    assert.equal(matrixResponse.status, 200)
    const matrix = await matrixResponse.json()
    assert.ok(matrix.super_admin.includes('admin:role'))
    assert.ok(matrix.super_admin.includes('admin:workManage'))

    const updateResponse = await request('/api/admin/permission-matrix/super_admin', {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ permissions: [] }),
    })
    assert.equal(updateResponse.status, 400)
  } finally {
    await prisma.rolePermission.deleteMany({ where: { role: 'super_admin' } })
    if (originalRows.length > 0) {
      await prisma.rolePermission.createMany({
        data: originalRows.map(({ role, permission, allowed }) => ({ role, permission, allowed })),
      })
    }
  }
})

test('客户端不能写审计日志', async () => {
  const response = await request('/api/operation-logs', {
    method: 'POST',
    headers: { authorization: `Bearer ${token(normalId, ['user'])}`, 'content-type': 'application/json' },
    body: JSON.stringify({ module: '伪造', action: '伪造', content: '伪造成功日志', result: 'success' }),
  })
  assert.equal(response.status, 405)
})

test('禁用账号的旧 Token 立即失效', async () => {
  const response = await request('/api/auth/me', { headers: { authorization: `Bearer ${token(disabledId, ['user'])}` } })
  assert.equal(response.status, 403)
})

test('普通用户不能读取他人的未发布作品', async () => {
  const response = await request(`/api/works/${workId}`, { headers: { authorization: `Bearer ${token(normalId, ['user'])}` } })
  assert.equal(response.status, 404)
})

test('操作日志全部操作类型筛选均匹配实际及历史动作值', async () => {
  const log = (action, content, target) => ({
    time: new Date(),
    operatorId: adminId,
    operatorName: '测试超管',
    department: 'IT部',
    role: '超级管理员',
    module: '后台管理',
    action,
    content,
    target: `${target}-${suffix}`,
    ip: '127.0.0.1',
    result: 'success',
  })
  await prisma.operationLog.createMany({
    data: [
      log('创建', 'POST /api/works', 'log-create'),
      log('更新', 'PUT /api/works/test', 'log-update'),
      log('删除', 'DELETE /api/works/test', 'log-delete'),
      log('审核通过', 'POST /api/works/test/approve', 'log-review'),
      log('上架', 'POST /api/admin/works/test/republish', 'log-online'),
      log('下架', 'POST /api/admin/works/test/offline', 'log-offline'),
      log('登录', '账号密码登录成功', 'log-login'),
      log('创建', 'POST /api/auth/logout', 'log-legacy-logout'),
      log('角色分配', 'PUT /api/admin/users/test/roles', 'log-role'),
      log('更新', 'PUT /api/admin/users/test/roles', 'log-legacy-role'),
    ],
  })
  const queryTargets = async (action) => {
    const response = await request(`/api/operation-logs?action=${encodeURIComponent(action)}&pageSize=100`, {
      headers: { authorization: `Bearer ${token(adminId, ['super_admin'])}` },
    })
    assert.equal(response.status, 200)
    return (await response.json()).items.map((item) => item.target)
  }
  assert.ok((await queryTargets('创建')).includes(`log-create-${suffix}`))
  assert.ok(!(await queryTargets('创建')).includes(`log-legacy-logout-${suffix}`))
  assert.ok((await queryTargets('更新')).includes(`log-update-${suffix}`))
  assert.ok(!(await queryTargets('更新')).includes(`log-legacy-role-${suffix}`))
  assert.ok((await queryTargets('删除')).includes(`log-delete-${suffix}`))
  assert.ok((await queryTargets('审核')).includes(`log-review-${suffix}`))
  const onlineOffline = await queryTargets('上架/下架')
  assert.ok(onlineOffline.includes(`log-online-${suffix}`))
  assert.ok(onlineOffline.includes(`log-offline-${suffix}`))
  const loginLogout = await queryTargets('登录/登出')
  assert.ok(loginLogout.includes(`log-login-${suffix}`))
  assert.ok(loginLogout.includes(`log-legacy-logout-${suffix}`))
  const roleAssignment = await queryTargets('角色分配')
  assert.ok(roleAssignment.includes(`log-role-${suffix}`))
  assert.ok(roleAssignment.includes(`log-legacy-role-${suffix}`))
})

test('具备管理他人作品权限的角色可以查看并下载已有附件', async () => {
  const originalRows = await prisma.rolePermission.findMany({ where: { role: 'user' } })
  const targetId = `managed-attachment-work-${suffix}`
  const storedName = `managed-attachment-${suffix}.txt`
  const attachmentDir = path.resolve('uploads', 'attachments')
  const filePath = path.join(attachmentDir, storedName)
  fs.mkdirSync(attachmentDir, { recursive: true })
  fs.writeFileSync(filePath, 'managed attachment test')

  try {
    const work = await prisma.work.create({
      data: {
        id: targetId,
        title: `他人附件权限-${suffix}`,
        type: 'skill',
        category: domainName,
        intro: '用于验证具备管理权限的角色可以查看他人作品附件。',
        usage: '用于验证具备管理权限的角色可以查看和下载他人作品附件。',
        authorId: adminId,
        authorName: '测试超管',
        department: 'IT部',
        status: 'unpublished',
      },
    })
    assert.equal(work.id, targetId)
    const version = await prisma.workVersion.create({
      data: { workId: targetId, version: 'v1', status: 'draft', changelog: '初始草稿版本' },
    })
    await prisma.attachment.create({
      data: {
        workId: targetId,
        versionId: version.id,
        uploaderId: adminId,
        name: '他人作品附件.txt',
        size: '1 KB',
        url: `/api/upload/attachment/${storedName}`,
        storedName,
      },
    })

    await prisma.rolePermission.deleteMany({ where: { role: 'user' } })
    await prisma.rolePermission.create({ data: { role: 'user', permission: 'admin:workManage', allowed: true } })
    const headers = { authorization: `Bearer ${token(normalId, ['user'])}` }

    const detailResponse = await request(`/api/works/${targetId}`, { headers })
    assert.equal(detailResponse.status, 200)
    const detail = await detailResponse.json()
    assert.equal(detail.versions[0].attachments[0].storedName, storedName)

    const downloadResponse = await request(`/api/upload/attachment/${storedName}`, { headers })
    assert.equal(downloadResponse.status, 200)
    assert.equal(await downloadResponse.text(), 'managed attachment test')
  } finally {
    await prisma.rolePermission.deleteMany({ where: { role: 'user' } })
    if (originalRows.length > 0) {
      await prisma.rolePermission.createMany({
        data: originalRows.map(({ role, permission, allowed }) => ({ role, permission, allowed })),
      })
    }
    await prisma.work.deleteMany({ where: { id: targetId } })
    fs.rmSync(filePath, { force: true })
  }
})

test('用户作品和收藏同时支持标准路径与兼容路径', async () => {
  const headers = { authorization: `Bearer ${token(adminId, ['super_admin'])}` }
  for (const prefix of ['/api/users', '/api/auth/users']) {
    const worksResponse = await request(`${prefix}/${adminId}/works`, { headers })
    assert.equal(worksResponse.status, 200)
    const works = await worksResponse.json()
    assert.ok(works.some((work) => work.id === workId))

    const favoritesResponse = await request(`${prefix}/${adminId}/favorites`, { headers })
    assert.equal(favoritesResponse.status, 200)
    assert.deepEqual(await favoritesResponse.json(), [])
  }
})

test('用户作品和收藏接口必须登录且收藏只能本人查看', async () => {
  assert.equal((await request(`/api/users/${normalId}/works`)).status, 401)
  assert.equal((await request(`/api/users/${normalId}/favorites`)).status, 401)
  const response = await request(`/api/users/${adminId}/favorites`, {
    headers: { authorization: `Bearer ${token(normalId, ['user'])}` },
  })
  assert.equal(response.status, 403)
})

test('业务错误向前端返回可直接展示的原因且不暴露内部前缀', async () => {
  const auth = { authorization: `Bearer ${token(normalId, ['user'])}`, 'content-type': 'application/json' }
  const title = `业务错误测试-${suffix}`
  const createResponse = await request('/api/works', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title,
      type: 'prompt',
      category: domainName,
      tags: ['自动化测试'],
      intro: '这是用于验证业务错误提示的完整作品简介。',
      usage: '这是用于验证业务错误提示的完整使用说明，长度满足要求。',
      changelog: '初始版本',
      attachments: [],
    }),
  })
  assert.equal(createResponse.status, 201)
  const created = await createResponse.json()
  const duplicateVersionResponse = await request(`/api/works/${created.id}/versions`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ changelog: '用于触发已有草稿版本业务错误提示的完整更新说明内容' }),
  })
  assert.equal(duplicateVersionResponse.status, 400)
  const body = await duplicateVersionResponse.json()
  assert.match(body.error, /已有草稿版本/)
  assert.equal(body.error.startsWith('BUSINESS_'), false)
})

test('作品内容只有版本审核通过后才切换上线', async () => {
  const auth = { authorization: `Bearer ${token(normalId, ['user'])}`, 'content-type': 'application/json' }
  const adminAuth = { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' }
  const originalTitle = `版本测试作品-${suffix}`
  const changedTitle = `审核后标题-${suffix}`
  const createResponse = await request('/api/works', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: originalTitle,
      type: 'prompt',
      category: domainName,
      tags: ['自动化测试'],
      intro: '这是用于验证版本审核流程的完整作品简介。',
      usage: '这是用于验证版本审核流程的完整使用说明，长度满足要求。',
      changelog: '初始版本',
      attachments: [],
    }),
  })
  assert.equal(createResponse.status, 201)
  const created = await createResponse.json()
  const createdId = created.id
  assert.equal((await request(`/api/works/${createdId}/versions/v1/submit`, { method: 'POST', headers: auth })).status, 200)
  assert.equal((await request(`/api/works/${createdId}/versions/v1/approve`, { method: 'POST', headers: adminAuth })).status, 200)
  assert.equal((await prisma.work.findUnique({ where: { id: createdId } })).title, originalTitle)
  await prisma.work.update({
    where: { id: createdId },
    data: { likes: 7, favorites: 5, downloads: 3, views: 11 },
  })

  const createVersionResponse = await request(`/api/works/${createdId}/versions`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ changelog: '这是第二版的完整更新说明，包含功能调整和问题修复详情' }),
  })
  assert.equal(createVersionResponse.status, 201)
  const version = await createVersionResponse.json()
  const updateResponse = await request(`/api/works/${createdId}`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({
      title: changedTitle,
      type: 'prompt',
      category: domainName,
      tags: ['自动化测试'],
      intro: '这是第二版更新后的作品简介，审核前不应上线。',
      usage: '这是第二版更新后的完整使用说明，审核通过后才允许上线。',
      changelog: '这是第二版的完整更新说明，包含功能调整和问题修复详情',
      attachments: [],
    }),
  })
  assert.equal(updateResponse.status, 200)
  assert.equal((await prisma.work.findUnique({ where: { id: createdId } })).title, originalTitle)

  const galleryResponse = await request('/api/works?pageSize=50', { headers: auth })
  assert.equal(galleryResponse.status, 200)
  const galleryWork = (await galleryResponse.json()).items.find((item) => item.id === createdId)
  assert.equal(galleryWork.title, originalTitle)

  const detailResponse = await request(`/api/works/${createdId}`, { headers: auth })
  assert.equal(detailResponse.status, 200)
  const draftDetail = await detailResponse.json()
  assert.equal(draftDetail.title, originalTitle)
  const savedDraft = draftDetail.versions.find((item) => item.version === version.version)
  assert.equal(savedDraft.title, changedTitle)
  assert.equal(savedDraft.intro, '这是第二版更新后的作品简介，审核前不应上线。')

  assert.equal((await request(`/api/works/${createdId}/versions/${version.version}/submit`, { method: 'POST', headers: auth })).status, 200)
  const rejectResponse = await request(`/api/works/${createdId}/versions/${version.version}/reject`, {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({ reason: '自动化验证：审核驳回后不得更新后台作品主记录和线上展示内容。' }),
  })
  assert.equal(rejectResponse.status, 200)
  const afterReject = await prisma.work.findUnique({ where: { id: createdId } })
  assert.equal(afterReject.title, originalTitle)
  assert.deepEqual(
    { likes: afterReject.likes, favorites: afterReject.favorites, downloads: afterReject.downloads, views: afterReject.views },
    { likes: 7, favorites: 5, downloads: 3, views: 12 },
  )

  const adminListResponse = await request('/api/admin/works?pageSize=100', { headers: adminAuth })
  assert.equal(adminListResponse.status, 200)
  const adminListWork = (await adminListResponse.json()).items.find((item) => item.id === createdId)
  assert.equal(adminListWork.title, originalTitle)

  assert.equal((await request(`/api/works/${createdId}/versions/${version.version}/modify`, { method: 'POST', headers: auth })).status, 200)
  assert.equal((await request(`/api/works/${createdId}/versions/${version.version}/submit`, { method: 'POST', headers: auth })).status, 200)
  assert.equal((await request(`/api/works/${createdId}/versions/${version.version}/approve`, { method: 'POST', headers: adminAuth })).status, 200)
  const afterApprove = await prisma.work.findUnique({ where: { id: createdId } })
  assert.equal(afterApprove.title, changedTitle)
  assert.deepEqual(
    { likes: afterApprove.likes, favorites: afterApprove.favorites, downloads: afterApprove.downloads, views: afterApprove.views },
    { likes: 7, favorites: 5, downloads: 3, views: 12 },
  )
})

test('详情响应返回最新浏览量和持久化评论', async () => {
  const auth = { authorization: `Bearer ${token(normalId, ['user'])}`, 'content-type': 'application/json' }
  const publishedId = `published-detail-${suffix}`
  await prisma.work.create({
    data: {
      id: publishedId,
      title: `详情统计-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证详情浏览量和评论持久化的测试作品。',
      usage: '用于验证详情浏览量和评论持久化的完整使用说明内容。',
      authorId: adminId,
      authorName: '测试超管',
      department: 'IT部',
      status: 'published',
      views: 3,
    },
  })
  const commentResponse = await request(`/api/works/${publishedId}/comments`, {
    method: 'POST', headers: auth, body: JSON.stringify({ content: '这是一条会在刷新后保留的评价' }),
  })
  assert.equal(commentResponse.status, 201)
  const detailResponse = await request(`/api/works/${publishedId}`, { headers: auth })
  assert.equal(detailResponse.status, 200)
  const detail = await detailResponse.json()
  assert.equal(detail.views, 4)
  assert.equal(detail.comments.length, 1)
  assert.equal(detail.comments[0].content, '这是一条会在刷新后保留的评价')
})

test('管理员强制下架必须填写原因', async () => {
  const adminAuth = { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' }
  const targetId = `offline-reason-${suffix}`
  await prisma.work.create({
    data: {
      id: targetId,
      title: `下架原因-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证管理员强制下架原因必填的测试作品。',
      usage: '用于验证管理员强制下架原因必填的完整使用说明内容。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'published',
    },
  })
  const missing = await request(`/api/admin/works/${targetId}/offline`, { method: 'POST', headers: adminAuth, body: '{}' })
  assert.equal(missing.status, 400)
  assert.match((await missing.json()).error, /下架原因/)
  const success = await request(`/api/admin/works/${targetId}/offline`, {
    method: 'POST', headers: adminAuth, body: JSON.stringify({ reason: '测试违规内容下架' }),
  })
  assert.equal(success.status, 200)
  assert.equal((await prisma.work.findUnique({ where: { id: targetId } })).status, 'offline')
  await new Promise((resolve) => setTimeout(resolve, 50))
  const auditLog = await prisma.operationLog.findFirst({
    where: { operatorId: adminId, action: '下架', target: targetId, result: 'success' },
    orderBy: { time: 'desc' },
  })
  assert.ok(auditLog)
  assert.match(auditLog.content, /测试违规内容下架/)
})

test('业务领域仅关联已删除作品时仍可删除', async () => {
  const adminAuth = { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' }
  const disposableDomain = await prisma.businessDomain.create({ data: { name: `可删除领域-${suffix}` } })
  await prisma.work.create({
    data: {
      id: `deleted-domain-work-${suffix}`,
      title: `已删除领域作品-${suffix}`,
      type: 'prompt',
      category: disposableDomain.name,
      intro: '用于验证已删除作品不会阻塞业务领域删除。',
      usage: '用于验证已删除作品不会阻塞业务领域删除的完整说明。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'deleted',
    },
  })
  const response = await request(`/api/admin/domains/${disposableDomain.id}`, { method: 'DELETE', headers: adminAuth })
  assert.equal(response.status, 200)
  assert.equal(await prisma.businessDomain.findUnique({ where: { id: disposableDomain.id } }), null)
  const listResponse = await request('/api/admin/works?status=deleted&pageSize=100', { headers: adminAuth })
  assert.equal(listResponse.status, 200)
  const deletedWork = (await listResponse.json()).items.find((work) => work.id === `deleted-domain-work-${suffix}`)
  assert.equal(deletedWork.category, disposableDomain.name)
})

test('已审核版本再次审核统一提示该版本已被审核', async () => {
  const adminAuth = { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' }
  const reviewedId = `reviewed-version-${suffix}`
  await prisma.work.create({
    data: {
      id: reviewedId,
      title: `并发审核-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证重复审核提示保持一致的测试作品。',
      usage: '用于验证重复审核提示保持一致的完整使用说明内容。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'unpublished',
      versions: { create: { version: 'v1', status: 'rejected', changelog: '已处理版本' } },
    },
  })
  const response = await request(`/api/works/${reviewedId}/versions/v1/reject`, {
    method: 'POST', headers: adminAuth, body: JSON.stringify({ reason: '再次审核时应返回统一且明确的业务提示信息。' }),
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, '该版本已被审核')
})

test('超级管理员可以编辑其他作者的作品并写入草稿版本', async () => {
  const targetId = `admin-edit-guard-${suffix}`
  await prisma.work.create({
    data: {
      id: targetId,
      title: `禁止代编辑-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证后台管理员不能代替作者编辑作品内容。',
      usage: '用于验证后台管理员不能代替作者编辑作品内容的完整说明。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'unpublished',
      versions: { create: { version: 'v1', status: 'draft', changelog: '初始草稿版本' } },
    },
  })
  const response = await request(`/api/works/${targetId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: `管理员越权修改-${suffix}` }),
  })
  assert.equal(response.status, 200)
  const updatedDraft = await prisma.workVersion.findUnique({
    where: { workId_version: { workId: targetId, version: 'v1' } },
  })
  assert.equal(updatedDraft.title, `管理员越权修改-${suffix}`)
})

test('已删除作品不能撤回审核', async () => {
  const deletedId = `deleted-withdraw-${suffix}`
  await prisma.work.create({
    data: {
      id: deletedId,
      title: `已删除撤回-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证删除后的作品不能再次撤回审核。',
      usage: '用于验证删除后的作品不能再次撤回审核的完整说明内容。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'deleted',
      versions: { create: { version: 'v1', status: 'pending', changelog: '待审核版本' } },
    },
  })
  const response = await request(`/api/works/${deletedId}/versions/v1/withdraw`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token(normalId, ['user'])}` },
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /作品已删除/)

  const offlineResponse = await request(`/api/works/${deletedId}/offline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token(normalId, ['user'])}` },
  })
  assert.equal(offlineResponse.status, 400)
  assert.match((await offlineResponse.json()).error, /作品已删除/)
})

test('标签名称最多 30 个字符', async () => {
  const response = await request('/api/admin/tags', {
    method: 'POST',
    headers: { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: '标'.repeat(31) }),
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /30/)
})

test('作品列表限制搜索长度且越界页码稳定返回空列表', async () => {
  const headers = { authorization: `Bearer ${token(normalId, ['user'])}` }
  const tooLong = await request(`/api/works?q=${encodeURIComponent('测'.repeat(51))}`, { headers })
  assert.equal(tooLong.status, 400)
  assert.match((await tooLong.json()).error, /50/)

  const overflow = await request('/api/works?page=999999&pageSize=12', { headers })
  assert.equal(overflow.status, 200)
  const body = await overflow.json()
  assert.deepEqual(body.items, [])
  assert.ok(body.totalPages >= 1)
})

test('同一版本第三次驳回仍成功并返回管理员提醒', async () => {
  const targetId = `third-reject-${suffix}`
  await prisma.work.create({
    data: {
      id: targetId,
      title: `三次驳回-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证第三次驳回时向审核管理员展示提醒。',
      usage: '用于验证第三次驳回时向审核管理员展示提醒的完整说明。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'unpublished',
      versions: { create: { version: 'v1', status: 'pending', changelog: '反复修改的版本' } },
      events: {
        create: [
          { workTitle: `三次驳回-${suffix}`, version: 'v1', status: 'rejected', reviewerId: adminId, reason: '第一次驳回记录' },
          { workTitle: `三次驳回-${suffix}`, version: 'v1', status: 'rejected', reviewerId: adminId, reason: '第二次驳回记录' },
        ],
      },
    },
  })
  const response = await request(`/api/works/${targetId}/versions/v1/reject`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token(adminId, ['super_admin'])}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reason: '第三次驳回仍然执行，但需要向审核管理员明确展示累计次数提醒。' }),
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.rejectionCount, 3)
  assert.match(body.warning, /累计驳回 3 次/)
})

test('推荐接口强制限制最多 5 个且超限时仍允许取消推荐', async () => {
  const adminHeaders = { authorization: `Bearer ${token(adminId, ['super_admin'])}` }
  const existingCount = await prisma.work.count({ where: { recommended: true, status: 'published' } })
  const fillCount = Math.max(0, 5 - existingCount)
  if (fillCount > 0) {
    await prisma.work.createMany({
      data: Array.from({ length: fillCount }, (_, index) => ({
        id: `recommend-fill-${index}-${suffix}`,
        title: `推荐占位-${index}-${suffix}`,
        type: 'prompt',
        category: domainName,
        intro: '用于验证推荐作品数量上限的测试作品简介。',
        usage: '用于验证推荐作品数量上限的完整测试使用说明。',
        authorId: normalId,
        authorName: '测试用户',
        department: '测试部',
        status: 'published',
        recommended: true,
      })),
    })
  }
  const targetId = `recommend-limit-${suffix}`
  await prisma.work.create({
    data: {
      id: targetId,
      title: `推荐上限-${suffix}`,
      type: 'prompt',
      category: domainName,
      intro: '用于验证第六个作品不能加入运营推荐。',
      usage: '用于验证第六个作品不能加入运营推荐的完整说明。',
      authorId: normalId,
      authorName: '测试用户',
      department: '测试部',
      status: 'published',
    },
  })
  const blocked = await request(`/api/admin/works/${targetId}/recommend`, { method: 'POST', headers: adminHeaders })
  assert.equal(blocked.status, 400)
  assert.match((await blocked.json()).error, /最多 5 个/)
  assert.equal((await prisma.work.findUnique({ where: { id: targetId } })).recommended, false)

  await prisma.work.update({ where: { id: targetId }, data: { recommended: true } })
  const adminRecommended = await request('/api/admin/works/recommended', { headers: adminHeaders })
  assert.equal(adminRecommended.status, 200)
  assert.ok((await adminRecommended.json()).length >= 6)

  const publicRecommended = await request('/api/works/recommended', { headers: adminHeaders })
  assert.equal(publicRecommended.status, 200)
  assert.equal((await publicRecommended.json()).length, 5)

  const cancelled = await request(`/api/admin/works/${targetId}/recommend`, { method: 'POST', headers: adminHeaders })
  assert.equal(cancelled.status, 200)
  assert.equal((await cancelled.json()).recommended, false)
})
