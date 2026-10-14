import { createApp } from './app.js'
import { pool } from './db.js'

const port = Number(process.env.API_PORT) || 3001
const app = createApp()

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
