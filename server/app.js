import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthRouter } from './auth.js'
import { UPLOAD_DIR } from './config.js'
import { query } from './db.js'
import { createHouseholdRouter } from './households.js'
import { createInviteRouter } from './invites.js'
import { apiNotFound, errorHandler, memberOneErrorHandler } from './middleware/error-handler.js'
import { careEventsRouter } from './routes/care-events.js'
import { petsRouter } from './routes/pets.js'
import { routinesRouter } from './routes/routines.js'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '16kb' }))

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

  app.use('/api/uploads', express.static(UPLOAD_DIR, { fallthrough: false, index: false }))

  const memberOneRoutes = ['/api/auth', '/api/households', '/api/invites']
  app.use('/api/auth', createAuthRouter(query))
  app.use('/api/households', createHouseholdRouter(query))
  app.use('/api/invites', createInviteRouter(query))
  // Member 1's routes keep their { error: "message" } format
  app.use(memberOneRoutes, memberOneErrorHandler)

  app.use('/api/pets', petsRouter)
  app.use('/api/care-events', careEventsRouter)
  app.use('/api/routines', routinesRouter)

  app.use('/api', apiNotFound)

  if (process.env.NODE_ENV === 'production') {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
    const staticDirectory = path.resolve(currentDirectory, '..', 'dist')

    app.use(express.static(staticDirectory))
    app.get('/{*path}', (_request, response) => {
      response.sendFile(path.join(staticDirectory, 'index.html'))
    })
  }

  app.use(errorHandler)
  return app
}
