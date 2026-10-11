import express from 'express'
import { pool, query } from './db.js'

const app = express()
const port = Number(process.env.API_PORT) || 3001

app.use(express.json())

app.get('/api/health', async (_request, response) => {
  try {
    const result = await query('SELECT NOW() AS database_time')
    response.json({
      status: 'ok',
      database: 'connected',
      databaseTime: result.rows[0].database_time,
    })
  } catch (error) {
    console.error('Database health check failed', error)
    response.status(503).json({ status: 'error', database: 'unavailable' })
  }
})

const server = app.listen(port, () => {
  console.log(`PawOps API listening on http://localhost:${port}`)
})

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

