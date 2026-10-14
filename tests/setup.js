import os from 'node:os'
import path from 'node:path'
import 'dotenv/config'
import { afterAll } from 'vitest'

process.env.NODE_ENV = 'test'
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.UPLOAD_DIR ??= path.join(os.tmpdir(), 'pawops-test-uploads')

// Import after the environment is set
const { cleanupFixtures } = await import('./helpers/fixtures.js')
const { pool } = await import('../server/db.js')

afterAll(async () => {
  await cleanupFixtures()
  await pool.end()
})
