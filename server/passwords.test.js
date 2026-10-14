import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPassword, verifyPassword } from './passwords.js'

test('password hashing uses random salts and rejects incorrect passwords', async () => {
  const first = await hashPassword('correct horse battery')
  const second = await hashPassword('correct horse battery')
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('correct horse battery', first), true)
  assert.equal(await verifyPassword('wrong password', first), false)
})
