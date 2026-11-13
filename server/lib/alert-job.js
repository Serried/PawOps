import {
  ALERT_FAILED_QUEUE,
  ALERT_MAX_ATTEMPTS,
  ALERT_RETRY_QUEUE,
} from '../config.js'
import { publishAlertEvaluation } from './alert-queue.js'

export async function processAlertMessage({ channel, message, evaluate, heartbeat = async () => {} }) {
  if (!message) return
  const attempt = Number(message.properties.headers?.attempt) || 1

  let job
  try {
    job = JSON.parse(message.content.toString('utf8'))
    if (job.version !== 1 || job.type !== 'evaluate-overdue-alerts') {
      throw new Error('Unsupported alert job payload')
    }
  } catch (error) {
    await publishAlertEvaluation(channel, {
      queue: ALERT_FAILED_QUEUE,
      attempt,
      requestedAt: new Date().toISOString(),
    })
    channel.ack(message)
    console.error(`[alerts] invalid job routed to ${ALERT_FAILED_QUEUE}`, error)
    return
  }

  try {
    const created = await evaluate()
    await heartbeat()
    channel.ack(message)
    console.log(`[alerts] worker attempt=${attempt}: ${created} new overdue alert(s)`)
  } catch (error) {
    const target = attempt < ALERT_MAX_ATTEMPTS ? ALERT_RETRY_QUEUE : ALERT_FAILED_QUEUE
    await publishAlertEvaluation(channel, {
      queue: target,
      attempt: attempt + 1,
      requestedAt: new Date().toISOString(),
    })
    channel.ack(message)
    console.error(`[alerts] worker attempt=${attempt} failed; routed to ${target}`, error)
  }
}
