// Runs migrations once (TEST_DATABASE_URL or DATABASE_URL)
import { execFileSync } from 'node:child_process'
import 'dotenv/config'

export default function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) and start PostgreSQL: npm run db:up')
  }
  execFileSync(process.execPath, ['server/migrate.js'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
}
