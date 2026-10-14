import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import express from 'express'
import pg from 'pg'
import { createHouseholdRouter } from './households.js'

async function serve(t, query) {
  const app = express()
  app.use(express.json())
  app.use('/api/households', createHouseholdRouter(query))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return (body, token = 'owner', extraHeaders = {}, suffix = '') => fetch(`http://127.0.0.1:${server.address().port}/api/households${suffix}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `pawops_session=${token}`, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test('household requests require a session and validate names before writing', async (t) => {
  let writes = 0
  const request = await serve(t, async (sql, args) => {
    if (sql.startsWith('SELECT u.id')) return { rows: args[0] === createHash('sha256').update('owner').digest('hex') ? [{ id: '1' }] : [] }
    writes++
    assert.equal(args[0], 'Our home')
    assert.equal(args[1], '1')
    return { rows: [{ id: '1', name: args[0], role: 'owner' }] }
  })
  assert.equal((await request({ name: 'Home' }, 'invalid')).status, 401)
  for (const name of ['', '   ', 42, null, 'a'.repeat(101)]) assert.equal((await request({ name })).status, 400)
  assert.equal((await request({ name: 'Home' }, 'owner', { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal(writes, 0)
  const response = await request({ name: '  Our home  ', user_id: '999', role: 'member' })
  assert.equal(response.status, 201)
  assert.equal((await response.json()).household.name, 'Our home')
  assert.equal(writes, 1)
})

test('PostgreSQL: household and owner persist; other users cannot list them; failed membership rolls back', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  const schema = `household_test_${process.pid}_${Date.now()}`
  t.after(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  })
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET search_path TO ${schema}`)
  for (const file of ['002_auth.sql', '003_households.sql', '006_invites.sql']) await client.query(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'))
  for (const token of ['owner', 'other']) {
    const result = await client.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [`${token}@example.com`, 'unused'])
    await client.query("INSERT INTO sessions VALUES ($1, $2, NOW() + INTERVAL '1 day')", [createHash('sha256').update(token).digest('hex'), result.rows[0].id])
  }
  const request = await serve(t, client.query.bind(client))
  const response = await request({ name: 'Family' })
  assert.equal(response.status, 201)
  const { household } = await response.json()
  assert.equal(household.role, 'owner')
  assert.equal((await (await request()).json()).households[0].id, household.id)
  assert.deepEqual((await (await request(undefined, 'other')).json()).households, [])
  const members = await client.query('SELECT * FROM household_members')
  assert.equal(members.rowCount, 1)
  assert.equal(members.rows[0].role, 'owner')
  const suffix = `/${household.id}/members`
  assert.equal((await request(undefined, 'other', {}, suffix)).status, 403)
  assert.equal((await request({ email: 'other@example.com' }, 'other', {}, suffix)).status, 403)
  const added = await request({ email: ' OTHER@example.com ', role: 'owner' }, 'owner', {}, suffix)
  assert.equal(added.status, 201)
  assert.equal((await added.json()).member.role, 'member')
  assert.equal((await (await request(undefined, 'other')).json()).households[0].id, household.id)
  assert.equal((await (await request(undefined, 'other', {}, suffix)).json()).members.length, 2)
  assert.equal((await request({ email: 'owner@example.com' }, 'other', {}, suffix)).status, 403)
  assert.equal((await request({ email: 'other@example.com' }, 'owner', {}, suffix)).status, 409)
  assert.equal((await request({ email: 'owner@example.com' }, 'owner', {}, suffix)).status, 409)
  assert.equal((await request({ email: 'missing@example.com' }, 'owner', {}, suffix)).status, 404)
  await client.query("ALTER TABLE household_members ADD CONSTRAINT reject_owner CHECK (role <> 'owner') NOT VALID")
  await assert.rejects(client.query(`WITH household AS (
    INSERT INTO households (name) VALUES ('Rollback') RETURNING id
  ) INSERT INTO household_members SELECT id, 1, 'owner' FROM household`))
  assert.equal((await client.query('SELECT * FROM households')).rowCount, 1)
})

test('member management enforces ownership, validates input, and handles duplicates', async (t) => {
  let inserts = 0
  let lookups = 0
  const digest = (value) => createHash('sha256').update(value).digest('hex')
  const request = await serve(t, async (sql, args) => {
    if (sql.startsWith('SELECT u.id, u.email, u.display_name FROM sessions')) {
      const id = ['owner', 'member', 'outsider'].find((token) => digest(token) === args[0])
      return { rows: id ? [{ id }] : [] }
    }
    if (sql.startsWith('SELECT role FROM household_members')) {
      return { rows: args[0] === '1' && args[1] !== 'outsider' ? [{ role: args[1] }] : [] }
    }
    if (sql.startsWith('SELECT id, email FROM users')) {
      lookups++
      return { rows: args[0] === 'new@example.com' ? [{ id: 'new', email: args[0] }] : [] }
    }
    if (sql.startsWith('INSERT INTO household_members')) {
      assert.deepEqual(args, ['1', 'new'])
      assert.match(sql, /'member'/)
      inserts++
      return { rows: inserts === 1 ? [{ role: 'member' }] : [] }
    }
    if (sql.startsWith('SELECT u.id, u.email, u.display_name, m.role')) return { rows: [{ id: 'owner', email: 'owner@example.com', role: 'owner' }] }
    throw new Error('Unexpected query')
  })
  const call = (body, token = 'owner', headers = {}, suffix = '/1/members') => request(body, token, headers, suffix)
  assert.equal((await call({ email: 'new@example.com' }, 'invalid')).status, 401)
  assert.equal((await call({ email: 'new@example.com' }, 'member')).status, 403)
  assert.equal((await call({ email: 'new@example.com' }, 'outsider')).status, 403)
  assert.equal((await call(undefined, 'outsider')).status, 403)
  assert.equal((await call({}, 'owner', {}, '/999/members')).status, 403)
  for (const id of ['abc', '0', '9223372036854775808']) assert.equal((await call({}, 'owner', {}, `/${id}/members`)).status, 400)
  for (const email of ['', null, 'bad', 'x'.repeat(255) + '@a.com']) assert.equal((await call({ email })).status, 400)
  assert.equal((await call({ email: 'new@example.com' }, 'owner', { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await call({}, 'owner', { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal(lookups, 0)
  assert.equal(inserts, 0)
  assert.equal((await call({ email: 'missing@example.com' })).status, 404)
  const added = await call({ email: ' NEW@Example.com ', role: 'owner', user_id: 'owner' })
  assert.equal(added.status, 201)
  assert.deepEqual(await added.json(), { member: { id: 'new', email: 'new@example.com', role: 'member' } })
  assert.equal((await call({ email: 'new@example.com' })).status, 409)
  assert.equal((await call(undefined, 'member')).status, 200)
})

test('migration renames duplicates without losing members or pets', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  const schema = `duplicate_test_${process.pid}_${Date.now()}`
  t.after(async () => {
    await client.query('ROLLBACK')
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  })
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET search_path TO ${schema}`)
  for (const file of ['001_initial.sql', '002_auth.sql', '003_households.sql', '004_pet_households.sql']) {
    await client.query(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'))
  }
  await client.query("INSERT INTO households (name) VALUES ('Family'), (' family '), ('family (2)'), (repeat('x',100)), (repeat('x',100))")
  await client.query("INSERT INTO users (email,password_hash) VALUES ('owner@example.com','unused')")
  await client.query("INSERT INTO household_members VALUES (2,1,'owner')")
  await client.query("INSERT INTO pets (name,species,household_id) VALUES ('Mochi','cat',2)")
  await client.query('BEGIN')
  await client.query(await readFile(new URL('./migrations/005_household_rules.sql', import.meta.url), 'utf8'))
  await client.query('COMMIT')
  const rows = (await client.query('SELECT id,name FROM households ORDER BY id')).rows
  assert.equal(rows.length, 5)
  assert.equal(rows[0].name, 'Family')
  assert.equal(rows[1].name, 'family (2-1)')
  assert.equal(rows[2].name, 'family (2)')
  assert.equal(rows[4].name.length, 100)
  assert.equal(new Set(rows.map((row) => row.name.trim().toLowerCase())).size, 5)
  assert.equal((await client.query('SELECT household_id FROM household_members')).rows[0].household_id, '2')
  assert.equal((await client.query('SELECT household_id FROM pets')).rows[0].household_id, '2')
  await assert.rejects(client.query("INSERT INTO households (name) VALUES (' FAMILY ')"), { code: '23505' })
})

