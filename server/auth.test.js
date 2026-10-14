import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import express from 'express'
import pg from 'pg'
import { createAuthRouter } from './auth.js'

async function database() {
  if (process.env.TEST_DATABASE_URL) {
    const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
    await client.connect()
    const schema = `auth_test_${process.pid}_${Date.now()}`
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(`SET search_path TO ${schema}`)
    for (const file of ['002_auth.sql', '003_households.sql', '006_invites.sql']) await client.query(await readFile(new URL('./migrations/' + file, import.meta.url), 'utf8'))
    return { query: client.query.bind(client), close: async () => {
      await client.query(`DROP SCHEMA ${schema} CASCADE`)
      await client.end()
    } }
  }
  const users = new Map()
  const sessions = new Map()
  return {
    close: async () => {},
    query: async (sql, args) => {
      if (sql.startsWith('INSERT INTO users')) {
        if (users.has(args[0])) throw Object.assign(new Error('Duplicate'), { code: '23505' })
        const user = { id: String(users.size + 1), email: args[0], password_hash: args[1], display_name: args[2] }
        users.set(args[0], user)
        return { rows: [{ id: user.id, email: user.email }] }
      }
      if (sql.startsWith('SELECT id, email, password_hash')) return { rows: users.has(args[0]) ? [users.get(args[0])] : [] }
      if (sql.startsWith('INSERT INTO sessions')) sessions.set(args[0], { userId: args[1], expires: args[2] })
      else if (sql.startsWith('DELETE FROM sessions WHERE token_hash')) sessions.delete(args[0])
      else if (sql.startsWith('DELETE FROM sessions WHERE expires_at')) {
        for (const [token, session] of sessions) if (session.expires <= new Date()) sessions.delete(token)
      } else if (sql.startsWith('SELECT u.id')) {
        const session = sessions.get(args[0])
        const user = session && session.expires > new Date() && [...users.values()].find((u) => u.id === session.userId)
        return { rows: user ? [{ id: user.id, email: user.email, display_name: user.display_name }] : [] }
      } else if (sql.startsWith('UPDATE sessions')) {
        for (const session of sessions.values()) session.expires = new Date(0)
      } else throw new Error(`Unexpected query: ${sql}`)
      return { rows: [] }
    },
  }
}

test(`authentication lifecycle (${process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'in-memory repository'})`, async (t) => {
  const db = await database()
  t.after(() => db.close())
  const app = express()
  app.use(express.json())
  app.use('/auth', createAuthRouter(db.query, { secure: true }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/auth`
  const post = (path, body, cookie) => fetch(`${base}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  })
  const credentials = { email: ' Owner@Example.com ', password: 'a secure password', displayName: 'Owner Name' }
  assert.equal((await fetch(`${base}/me`)).status, 401)
  assert.equal((await post('register', { email: 'bad', password: 'short' })).status, 400)
  const registered = await post('register', credentials)
  assert.equal(registered.status, 201)
  assert.deepEqual(Object.keys((await registered.json()).user).sort(), ['email', 'id'])
  assert.equal((await post('register', { ...credentials, email: 'owner@example.com' })).status, 409)
  const wrong = await post('login', { ...credentials, password: 'wrong password' })
  const unknown = await post('login', { ...credentials, email: 'unknown@example.com' })
  assert.equal(wrong.status, 401)
  assert.equal(unknown.status, 401)
  assert.deepEqual(await wrong.json(), await unknown.json())
  const loggedIn = await post('login', credentials)
  assert.equal(loggedIn.status, 200)
  assert.equal((await loggedIn.json()).user.display_name, 'Owner Name')
  const cookieHeader = loggedIn.headers.get('set-cookie')
  assert.match(cookieHeader, /HttpOnly/)
  assert.match(cookieHeader, /Secure/)
  assert.match(cookieHeader, /SameSite=Strict/)
  let cookie = cookieHeader.split(';')[0]
  const me = () => fetch(`${base}/me`, { headers: { Cookie: cookie } })
  assert.equal((await (await me()).json()).user.email, 'owner@example.com')
  const rotated = await post('login', credentials, cookie)
  assert.equal((await me()).status, 401)
  cookie = rotated.headers.get('set-cookie').split(';')[0]
  assert.equal((await me()).status, 200)
  assert.equal((await post('logout', {}, cookie)).status, 204)
  assert.equal((await me()).status, 401)
  const nextLogin = await post('login', credentials)
  cookie = nextLogin.headers.get('set-cookie').split(';')[0]
  await db.query("UPDATE sessions SET expires_at = '2000-01-01'", [])
  assert.equal((await me()).status, 401)
  assert.equal((await fetch(`${base}/login`, { method: 'POST', body: 'email=test' })).status, 415)
  assert.equal((await fetch(`${base}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' })).status, 403)
  let limited
  for (let i = 0; i < 21; i++) limited = await post('login', {})
  assert.equal(limited.status, 429)
})


