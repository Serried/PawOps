import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { petHandlers } from './pets.js'

async function invoke(handler, req) {
  const result = { status: 200, headers: {}, next: false }
  const res = {
    set(key, value) { result.headers[key] = value; return this },
    status(value) { result.status = value; return this },
    json(value) { result.body = value; return this },
  }
  await handler(req, res, (error) => { if (error) throw error; result.next = true })
  return result
}

test('pet handlers reject missing/expired sessions and do not trust supplied identity', async () => {
  const handlers = petHandlers(async () => ({ rows: [] }))
  for (const headers of [{}, { cookie: 'pawops_session=expired' }]) {
    const result = await invoke(handlers.authenticate, { headers, user: { id: 'forged' } })
    assert.equal(result.status, 401)
    assert.equal(result.next, false)
    assert.equal(result.headers['Cache-Control'], 'no-store')
  }
})

test('pet denial contains no details; IDs validated; identity bound to session', async () => {
  let calls = 0
  const handlers = petHandlers(async (sql, params) => {
    calls++
    assert.match(sql, /JOIN household_members/)
    assert.match(sql, /m.user_id = \$2/)
    assert.deepEqual(params, ['2', '1'])
    return { rows: [] }
  })
  const request = { user: { id: '1' }, params: { petId: '2' }, query: { user_id: '2', household_id: '2' } }
  const denied = await invoke(handlers.detail, request)
  assert.equal(denied.status, 403)
  assert.deepEqual(denied.body, { error: 'Pet access denied.' })
  for (const petId of ['0', '-1', 'abc', '9223372036854775808']) {
    assert.equal((await invoke(handlers.detail, { ...request, params: { petId } })).status, 400)
  }
  assert.equal(calls, 1)
})

test('PostgreSQL household isolation, legacy pets, and membership changes', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  const schema = `pet_test_${process.pid}_${Date.now()}`
  t.after(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  })
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET search_path TO ${schema}`)
  for (const file of ['001_initial.sql', '002_auth.sql', '003_households.sql']) {
    await client.query(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'))
  }
  await client.query("INSERT INTO pets (name, species) VALUES ('Legacy', 'cat')")
  await client.query(await readFile(new URL('./migrations/004_pet_households.sql', import.meta.url), 'utf8'))
  await client.query("INSERT INTO users (email, password_hash) VALUES ('a@example.com','unused'), ('b@example.com','unused'), ('member@example.com','unused')")
  await client.query("INSERT INTO households (name) VALUES ('A'), ('B')")
  await client.query("INSERT INTO household_members VALUES (1,1,'owner'), (2,2,'owner'), (1,3,'member')")
  await client.query("INSERT INTO pets (name,species,household_id) VALUES ('Pet A','cat',1), ('Secret Pet B','dog',2)")
  const handlers = petHandlers(client.query.bind(client))
  const detail = (userId, petId) => invoke(handlers.detail, { user: { id: userId }, params: { petId } })
  assert.equal((await detail('1', '2')).body.pet.name, 'Pet A')
  assert.equal((await detail('3', '2')).status, 200)
  for (const petId of ['1', '3', '999']) {
    const response = await detail('1', petId)
    assert.equal(response.status, 403)
    assert.deepEqual(response.body, { error: 'Pet access denied.' })
  }
  assert.equal((await detail('2', '2')).status, 403)
  const list = await invoke(handlers.list, { user: { id: '1' } })
  assert.deepEqual(list.body.pets.map((pet) => pet.name), ['Pet A'])
  await client.query('DELETE FROM household_members WHERE user_id = 3')
  assert.equal((await detail('3', '2')).status, 403)
  await assert.rejects(client.query("INSERT INTO pets (name,species) VALUES ('Unassigned','cat')"), { code: '23514' })
  await assert.rejects(client.query("INSERT INTO pets (name,species,household_id) VALUES ('Invalid','cat',999)"), { code: '23503' })
})
