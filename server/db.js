import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env first.')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error)
})

export async function query(text, params) {
  return pool.query(text, params)
}

