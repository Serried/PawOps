import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationsDirectory = path.join(currentDirectory, 'migrations')

async function migrate() {
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file],
      )

      if (existing.rowCount > 0) continue

      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
      await client.query('BEGIN')

      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Applied migration: ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    console.log('Database is up to date')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((error) => {
  console.error('Migration failed', error)
  process.exitCode = 1
})

