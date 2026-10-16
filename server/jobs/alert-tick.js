import { pool } from '../db.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { evaluateOverdueAlerts } from '../services/alerts.js'

const LOOP_INTERVAL_MS = 60_000

export async function runAlertTick() {
  const created = await evaluateOverdueAlerts()
  console.log(`[alerts] tick: ${created} new overdue alert(s)`)
  return created
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--loop')) {
    const shutdown = new AbortController()
    const stop = () => shutdown.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      while (!shutdown.signal.aborted) {
        try {
          await runAlertTick()
        } catch (error) {
          console.error('[alerts] tick failed; retrying next minute', error)
        }
        await delay(LOOP_INTERVAL_MS, undefined, { signal: shutdown.signal }).catch((error) => {
          if (error.name !== 'AbortError') throw error
        })
      }
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      await pool.end()
    }
  } else {
    runAlertTick()
      .catch((error) => {
        console.error('[alerts] tick failed', error)
        process.exitCode = 1
      })
      .finally(() => pool.end())
  }
}
