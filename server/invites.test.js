import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { inviteHandlers } from './invites.js'

async function invoke(handler, req) {
  const result = { status: 200, next: false }
  const res = {
    status(value) { result.status = value; return this },
    json(value) { result.body = value; return this },
  }
  await handler(req, res, (error) => { if (error) throw error; result.next = true })
  return result
}
const owner = { params: { householdId: '1' }, user: { id: '2' } }
const joiner = { user: { id: '3' }, body: { code: ' paw-abcdef1234567890 ', role: 'owner', user_id: '99' } }

test('only owners can view or replace codes', async () => {
  for (const role of [null, 'member', 'owner']) {
    const handlers = inviteHandlers(async (_sql, params) => {
      assert.deepEqual(params, ['1', '2'])
      return { rows: role ? [{ role }] : [] }
    })
    const result = await invoke(handlers.owner, owner)
    assert.equal(result.status, role === 'owner' ? 200 : 403)
    assert.equal(result.next, role === 'owner')
  }
  const handlers = inviteHandlers(() => { throw new Error('Should not query') })
  assert.equal((await invoke(handlers.owner, { ...owner, params: { householdId: 'bad' } })).status, 400)
})

test('generating codes produces random codes and sets an expiry', async () => {
  const codes = []
  const handlers = inviteHandlers(async (sql, params) => {
    assert.match(sql, /INTERVAL '7 days'/)
    assert.match(sql, /ON CONFLICT \(household_id\) DO UPDATE/)
    assert.equal(params[0], '1')
    assert.match(params[1], /^PAW-[A-F0-9]{16}$/)
    codes.push(params[1])
    return { rows: [{ code: params[1], expires_at: '2030-01-01' }] }
  })
  assert.equal((await invoke(handlers.generate, owner)).status, 201)
  await invoke(handlers.generate, owner)
  assert.notEqual(codes[0], codes[1])
})

test('joining normalizes codes and assigns member using authenticated identity', async () => {
  const handlers = inviteHandlers(async (sql, params) => {
    assert.deepEqual(params, ['PAW-ABCDEF1234567890', '3'])
    assert.match(sql, /i.expires_at > NOW\(\)/)
    assert.match(sql, /SELECT id, \$2, 'member'/)
    return { rows: [{ id: '1', name: 'Family', created_at: 'today', joined: true }] }
  })
  const result = await invoke(handlers.join, joiner)
  assert.equal(result.status, 201)
  assert.equal(result.body.household.role, 'member')
})

test('invalid, expired, and duplicate invitations fail without exposing household details', async () => {
  let queried = false
  const handlers = inviteHandlers(async () => { queried = true; return { rows: [] } })
  assert.equal((await invoke(handlers.join, { ...joiner, body: { code: 'bad' } })).status, 400)
  assert.equal(queried, false)
  const expired = await invoke(handlers.join, joiner)
  assert.equal(expired.status, 404)
  assert.deepEqual(expired.body, { error: 'This invite code is invalid or expired.' })
  const duplicate = inviteHandlers(async () => ({ rows: [{ id: '1', joined: false }] }))
  assert.equal((await invoke(duplicate.join, joiner)).status, 409)
})

test('PostgreSQL: invitation rotation, joining, duplicates, expiry and deletion', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  const schema = `invite_test_${process.pid}_${Date.now()}`
  t.after(async () => { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await client.end() })
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET search_path TO ${schema}`)
  for (const file of ['002_auth.sql', '003_households.sql', '006_invites.sql']) await client.query(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'))
  await client.query("INSERT INTO users (email,password_hash) VALUES ('a@example.com','unused'),('b@example.com','unused'),('c@example.com','unused')")
  await client.query("INSERT INTO households (name) VALUES ('Home')")
  await client.query("INSERT INTO household_members VALUES (1,2,'owner')")
  const handlers = inviteHandlers(client.query.bind(client))
  const first = (await invoke(handlers.generate, owner)).body.invite
  const second = (await invoke(handlers.generate, owner)).body.invite
  assert.notEqual(first.code, second.code)
  assert.equal((await invoke(handlers.join, { ...joiner, body: { code: first.code } })).status, 404)
  const request = { ...joiner, body: { code: second.code } }
  assert.equal((await invoke(handlers.join, request)).status, 201)
  assert.equal((await invoke(handlers.join, request)).status, 409)
  assert.equal((await client.query('SELECT role FROM household_members WHERE user_id = 3')).rows[0].role, 'member')
  await client.query("UPDATE household_invites SET expires_at = NOW() - INTERVAL '1 second'")
  assert.equal((await invoke(handlers.join, { ...request, user: { id: '1' } })).status, 404)
  await client.query('DELETE FROM households WHERE id = 1')
  assert.equal((await client.query('SELECT * FROM household_invites')).rowCount, 0)
})
