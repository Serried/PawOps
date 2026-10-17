import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'
import { seed, seedPassword } from './seed-dev.js'

const env = { NODE_ENV: 'test', ALLOW_DEMO_SEED: 'true', SEED_PASSWORD: 'test-only-password-123' }

test('unsafe environments and missing passwords fail before connecting', async () => {
  for (const overrides of [
    { NODE_ENV: undefined }, { NODE_ENV: 'production' }, { NODE_ENV: 'staging' },
    { ALLOW_DEMO_SEED: undefined }, { SEED_PASSWORD: undefined }, { SEED_PASSWORD: 'short' },
  ]) {
    await assert.rejects(seed({ connect() { assert.fail('must not connect') } }, { ...env, ...overrides }))
  }
  assert.equal(seedPassword(env), env.SEED_PASSWORD)
})

test('failed seed rolls back and releases its connection', async () => {
  const calls = []
  const client = {
    async query(sql) {
      calls.push(sql)
      if (sql.startsWith('SELECT id')) throw new Error('simulated failure')
      return { rows: [] }
    },
    release() { calls.push('release') },
  }
  await assert.rejects(seed({ async connect() { return client } }, env), /simulated failure/)
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release'])
})

test('PostgreSQL: repeated seed preserves data and restores deleted fixtures', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await client.connect()
  const schema = `seed_test_${process.pid}_${Date.now()}`
  t.after(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await client.end()
  })
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET search_path TO ${schema}`)
  const directory = new URL('./migrations/', import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await client.query(await readFile(new URL(file, directory), 'utf8'))
  }
  const pool = { async connect() { return { query: client.query.bind(client), release() {} } } }
  const tables = ['users', 'households', 'household_members', 'pets', 'pet_caretakers', 'care_events']
  async function snapshot() {
    return Promise.all(tables.map(async table => (await client.query(`SELECT * FROM ${table} ORDER BY 1, 2`)).rows))
  }
  await seed(pool, env)
  const original = await snapshot()
  assert.deepEqual(original.map(rows => rows.length), [5, 2, 5, 4, 5, 10])
  await seed(pool, { ...env, SEED_PASSWORD: 'different-password-123' })
  assert.deepEqual(await snapshot(), original)

  for (const [label, transform] of [
    ['case variations', name => name.toUpperCase()],
    ['surrounding whitespace', name => `  ${name}   `],
    ['case and whitespace together', name => `  ${name.toLowerCase()}   `],
  ]) {
    await t.test(`household matching tolerates ${label} without changing existing records`, async () => {
      for (const household of original[1]) {
        await client.query('UPDATE households SET name = $1 WHERE id = $2', [transform(household.name), household.id])
      }
      const before = await snapshot()
      await seed(pool, env)
      await seed(pool, env)
      assert.deepEqual(await snapshot(), before)
    })
  }
  for (const household of original[1]) {
    await client.query('UPDATE households SET name = $1 WHERE id = $2', [household.name, household.id])
  }

  async function fixtureContents() {
    const queries = [
      'SELECT email, display_name FROM users ORDER BY email',
      'SELECT name FROM households ORDER BY name',
      `SELECT h.name, u.email, m.role FROM household_members m
       JOIN households h ON h.id = m.household_id JOIN users u ON u.id = m.user_id ORDER BY 1, 2`,
      `SELECT h.name AS household, p.name, p.species, p.breed, p.birth_date, p.weight_kg, p.sex, p.health_notes
       FROM pets p JOIN households h ON h.id = p.household_id ORDER BY 1, 2`,
      `SELECT p.name, u.email FROM pet_caretakers c
       JOIN pets p ON p.id = c.pet_id JOIN users u ON u.id = c.user_id ORDER BY 1, 2`,
      `SELECT p.name, e.type, e.title, e.note, e.status, a.email AS assignee,
              d.email AS completed_by, c.email AS created_by
       FROM care_events e JOIN pets p ON p.id = e.pet_id
       LEFT JOIN users a ON a.id = e.assigned_to LEFT JOIN users d ON d.id = e.completed_by
       JOIN users c ON c.id = e.created_by ORDER BY 1, 2, 3`,
    ]
    return Promise.all(queries.map(async sql => (await client.query(sql)).rows))
  }
  const expectedContents = await fixtureContents()
  for (const [label, deletions] of [
    ['care event', ["DELETE FROM care_events WHERE title = 'Dinner'"]],
    ['caretakers', ['DELETE FROM pet_caretakers']],
    ['non-owner memberships', ["DELETE FROM household_members WHERE role = 'member'"]],
    ['owner memberships', ["DELETE FROM household_members WHERE role = 'owner'"]],
    ['pet and dependent records', ["DELETE FROM pets WHERE name = 'Luna'"]],
    ['household and dependent records', ["DELETE FROM households WHERE name = 'Olive''s Household'"]],
    ['all demo data including users', ['DELETE FROM households', 'DELETE FROM users']],
  ]) {
    await t.test(`restores deleted ${label} and remains idempotent`, async () => {
      for (const sql of deletions) await client.query(sql)
      assert.notDeepEqual(await fixtureContents(), expectedContents)
      await seed(pool, env)
      assert.deepEqual(await fixtureContents(), expectedContents)
      const repaired = await snapshot()
      await seed(pool, env)
      assert.deepEqual(await snapshot(), repaired)
    })
  }
})
