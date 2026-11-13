import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { connectAlertQueue, publishAlertEvaluation } from '../lib/alert-queue.js'

const LOOP_INTERVAL_MS = 60_000

export async function runScheduler({ channel, heartbeatFile = process.env.SCHEDULER_HEARTBEAT_FILE } = {}) {
  await publishAlertEvaluation(channel)
  if (heartbeatFile) await writeFile(heartbeatFile, String(Date.now()))
  console.log('[alerts] queued overdue evaluation')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const shutdown = new AbortController()
  const stop = () => shutdown.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  let queue
  try {
    queue = await connectAlertQueue()
    do {
      await runScheduler({ channel: queue.channel })
      if (!process.argv.includes('--loop')) break
      await delay(LOOP_INTERVAL_MS, undefined, { signal: shutdown.signal }).catch((error) => {
        if (error.name !== 'AbortError') throw error
      })
    } while (!shutdown.signal.aborted)
  } catch (error) {
    if (!shutdown.signal.aborted) {
      console.error('[alerts] scheduler failed', error)
      process.exitCode = 1
    }
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await queue?.channel.close().catch(() => {})
    await queue?.connection.close().catch(() => {})
  }
}
