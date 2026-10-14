import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await deriveKey(password, salt, 64)
  return `${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const key = await deriveKey(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return expected.length === key.length && timingSafeEqual(expected, key)
}
