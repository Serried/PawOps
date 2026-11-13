import amqp from 'amqplib'
import {
  ALERT_FAILED_QUEUE,
  ALERT_QUEUE,
  ALERT_RETRY_DELAY_MS,
  ALERT_RETRY_QUEUE,
  RABBITMQ_URL,
} from '../config.js'

export async function connectAlertQueue({ url = RABBITMQ_URL } = {}) {
  const connection = await amqp.connect(url)
  const channel = await connection.createConfirmChannel()

  await channel.assertQueue(ALERT_FAILED_QUEUE, { durable: true })
  await channel.assertQueue(ALERT_RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-message-ttl': ALERT_RETRY_DELAY_MS,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': ALERT_QUEUE,
    },
  })
  await channel.assertQueue(ALERT_QUEUE, { durable: true })

  return { connection, channel }
}

export async function publishAlertEvaluation(channel, {
  queue = ALERT_QUEUE,
  attempt = 1,
  requestedAt = new Date().toISOString(),
} = {}) {
  channel.sendToQueue(
    queue,
    Buffer.from(JSON.stringify({ version: 1, type: 'evaluate-overdue-alerts', requestedAt })),
    {
      persistent: true,
      contentType: 'application/json',
      headers: { attempt },
    },
  )
  await channel.waitForConfirms()
}
