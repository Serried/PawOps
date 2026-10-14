import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, query } from './db.js'
import { createAuthRouter } from './auth.js'
import { createHouseholdRouter } from './households.js'
import { createPetRouter } from './pets.js'
import { createInviteRouter } from './invites.js'

const app = express()
const port = Number(process.env.API_PORT) || 3001

app.use(express.json({ limit: '16kb' }))
app.use('/api/auth', createAuthRouter(query))
app.use('/api/households', createHouseholdRouter(query))
app.use('/api/pets', createPetRouter(query))
app.use('/api/invites', createInviteRouter(query))

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

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }))
app.use((error, _req, res, _next) => {
  void _next
  const status = error.status === 400 || error.status === 413 ? error.status : 500
  if (status === 500) console.error('API request failed', error)
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : 'Invalid request body.' })
})

if (process.env.NODE_ENV === 'production') {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
  const staticDirectory = path.resolve(currentDirectory, '..', 'dist')

  app.use(express.static(staticDirectory))
  app.get('/{*path}', (_request, response) => {
    response.sendFile(path.join(staticDirectory, 'index.html'))
  })
}

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

