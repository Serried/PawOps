import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import {
  ALERT_QUEUE,
} from '../config.js'
import { pool } from '../db.js'
import { processAlertMessage } from '../lib/alert-job.js'
import { connectAlertQueue } from '../lib/alert-queue.js'
import { evaluateOverdueAlerts } from '../services/alerts.js'

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let queue
  const shutdown = async () => {
    await queue?.channel.close().catch(() => {})
    await queue?.connection.close().catch(() => {})
    await pool.end()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  try {
    queue = await connectAlertQueue()
    await queue.channel.prefetch(1)
    await queue.channel.consume(
      ALERT_QUEUE,
      (message) => processAlertMessage({
        channel: queue.channel,
        message,
        evaluate: evaluateOverdueAlerts,
        heartbeat: process.env.WORKER_HEARTBEAT_FILE
          ? () => writeFile(process.env.WORKER_HEARTBEAT_FILE, String(Date.now()))
          : undefined,
      }),
      { noAck: false },
    )
    console.log(`[alerts] worker consuming ${ALERT_QUEUE}`)
  } catch (error) {
    console.error('[alerts] worker startup failed', error)
    process.exitCode = 1
    await shutdown()
  }
}
