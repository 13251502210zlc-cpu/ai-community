import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'

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
  await prisma.businessDomain.deleteMany({ where: { name: domainName } })
  await prisma.$disconnect()
})

test('作品接口必须登录且演示请求头默认不可用', async () => {
  assert.equal((await request('/api/works')).status, 401)
  assert.equal((await request('/api/works', { headers: { 'x-user-id': normalId, 'x-user-roles': 'super_admin' } })).status, 401)
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

  const createVersionResponse = await request(`/api/works/${createdId}/versions`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ changelog: '这是第二版的完整更新说明' }),
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
      changelog: '这是第二版的完整更新说明',
      attachments: [],
    }),
  })
  assert.equal(updateResponse.status, 200)
  assert.equal((await prisma.work.findUnique({ where: { id: createdId } })).title, originalTitle)
  assert.equal((await request(`/api/works/${createdId}/versions/${version.version}/submit`, { method: 'POST', headers: auth })).status, 200)
  assert.equal((await request(`/api/works/${createdId}/versions/${version.version}/approve`, { method: 'POST', headers: adminAuth })).status, 200)
  assert.equal((await prisma.work.findUnique({ where: { id: createdId } })).title, changedTitle)
})
