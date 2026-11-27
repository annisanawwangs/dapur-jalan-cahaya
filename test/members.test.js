import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SECRET_KEY = 'test-key'

const { default: handler } = await import('../api/members.js')

const userIds = {
  admin: '00000000-0000-4000-8000-000000000001',
  'inactive-admin': '00000000-0000-4000-8000-000000000002',
  manager: '00000000-0000-4000-8000-000000000003',
  viewer: '00000000-0000-4000-8000-000000000004',
}

const roles = [
  { id: 'admin-role', slug: 'admin' },
  { id: 'viewer-role', slug: 'viewer' },
  { id: 'manager-role', slug: 'manager' },
]

test('member management API', async t => {
  const members = [
    { id: 'admin', role_id: 'admin-role', active: true },
    { id: 'inactive-admin', role_id: 'admin-role', active: false },
    { id: 'manager', role_id: 'manager-role', active: true },
    { id: 'viewer', role_id: 'viewer-role', active: true },
  ].map(member => ({ ...member, email: member.id + '@example.test', full_name: member.id, id: userIds[member.id] }))
  const authWrites = []
  const memberWrites = []

  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input.url || input)
    const method = options.method || 'GET'
    const headers = new Headers(options.headers)
    const path = url.pathname
    if (path === '/auth/v1/user') {
      const id = headers.get('authorization').split(' ')[1]
      return Response.json({ id })
    }
    if (path.startsWith('/auth/v1/admin/users')) {
      authWrites.push(JSON.parse(options.body))
      return Response.json({ id: path.split('/').at(-1) })
    }
    const id = url.searchParams.get('id')?.slice(3)
    const roleId = url.searchParams.get('role_id')?.slice(3)
    if (path === '/rest/v1/role_permissions') {
      return Response.json(roleId === 'viewer-role' ? [] : [{ allowed: true }])
    }
    if (path === '/rest/v1/roles') {
      return Response.json(roles.filter(role => role.id === id))
    }
    assert.equal(path, '/rest/v1/members')
    if (method === 'HEAD') {
      const count = members.filter(member => member.active && member.role_id === roleId).length
      return new Response(null, { headers: { 'content-range': '*/' + count } })
    }
    const result = members.filter(member => !id || member.id === id)
    if (method === 'PATCH') {
      const changes = JSON.parse(options.body)
      memberWrites.push(changes)
      result.forEach(member => Object.assign(member, changes))
    }
    return Response.json(result.map(member => ({
      ...member,
      roles: roles.find(role => role.id === member.role_id),
    })))
  })

  async function call(method, actor, body) {
    let result
    const res = {
      status(code) { return { json: data => { result = { code, ...data } } } },
    }
    await handler({ method, headers: { authorization: actor ? 'Bearer ' + userIds[actor] : '' }, body }, res)
    return result
  }

  await t.test('requires an active account with member management permission', async () => {
    assert.equal((await call('GET')).code, 401)
    assert.equal((await call('GET', 'inactive-admin')).code, 403)
    assert.equal((await call('GET', 'viewer')).code, 403)
    assert.equal((await call('GET', 'admin')).members.length, 4)
  })

  await t.test('deactivation and activation change only the status', async () => {
    assert.equal((await call('PATCH', 'admin', { id: userIds.viewer, active: false })).code, 200)
    assert.deepEqual(memberWrites.at(-1), { active: false })
    assert.equal((await call('PATCH', 'admin', { id: userIds.viewer, active: true })).code, 200)
    assert.deepEqual(memberWrites.at(-1), { active: true })
    assert.equal(authWrites.length, 0)
    assert.equal((await call('PATCH', 'admin', { id: userIds.viewer, active: 'false' })).code, 400)
  })

  await t.test('a profile edit preserves the current status and only syncs changed Auth fields', async () => {
    const viewer = members.find(member => member.id === userIds.viewer)
    viewer.active = false
    const result = await call('PATCH', 'admin', {
      id: viewer.id, email: viewer.email, full_name: 'Nama baru', role_id: viewer.role_id,
    })
    assert.equal(result.code, 200)
    assert.equal(viewer.active, false)
    assert.deepEqual(authWrites.at(-1), { user_metadata: { full_name: 'Nama baru' } })
    assert.equal('active' in memberWrites.at(-1), false)
  })

  await t.test('protects the last active admin while allowing edits to inactive admins', async () => {
    const fields = { email: 'admin@example.test', full_name: 'Admin', role_id: 'viewer-role' }
    assert.equal((await call('PATCH', 'admin', { id: userIds.admin, active: false })).code, 400)
    assert.equal((await call('PATCH', 'admin', { id: userIds.admin, ...fields })).code, 400)
    assert.equal((await call('PATCH', 'admin', { id: userIds['inactive-admin'], ...fields, email: 'inactive-admin@example.test' })).code, 200)
  })

  await t.test('delegated managers cannot modify admins or assign the admin role', async () => {
    const fields = { email: 'someone@example.test', full_name: 'Someone', role_id: 'admin-role', password: 'test-password' }
    const previousAuthWrites = authWrites.length
    assert.equal((await call('POST', 'manager', fields)).code, 403)
    assert.equal((await call('PATCH', 'manager', { id: userIds.viewer, ...fields })).code, 403)
    assert.equal((await call('PATCH', 'manager', { id: userIds.admin, active: false })).code, 403)
    assert.equal(authWrites.length, previousAuthWrites)
  })
})
