import { describe, expect, it, vi } from 'vitest'
import { ALERT_FAILED_QUEUE, ALERT_RETRY_QUEUE } from '../../server/config.js'
import { processAlertMessage } from '../../server/lib/alert-job.js'

function message({ attempt = 1, body = { version: 1, type: 'evaluate-overdue-alerts' } } = {}) {
  return {
    content: Buffer.from(JSON.stringify(body)),
    properties: { headers: { attempt } },
  }
}

function channel() {
  return {
    ack: vi.fn(),
    sendToQueue: vi.fn(),
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
  }
}

describe('PBI-12 RabbitMQ worker failure isolation', () => {
  it('acknowledges a successful job after evaluating overdue alerts', async () => {
    const queue = channel()
    const job = message()
    const evaluate = vi.fn().mockResolvedValue(2)

    await processAlertMessage({ channel: queue, message: job, evaluate })

    expect(evaluate).toHaveBeenCalledOnce()
    expect(queue.ack).toHaveBeenCalledWith(job)
    expect(queue.sendToQueue).not.toHaveBeenCalled()
  })

  it('routes a failed job through the delayed retry queue without crashing the API', async () => {
    const queue = channel()
    const job = message({ attempt: 2 })
    const evaluate = vi.fn().mockRejectedValue(new Error('notification dependency unavailable'))

    await processAlertMessage({ channel: queue, message: job, evaluate })

    expect(queue.sendToQueue).toHaveBeenCalledWith(
      ALERT_RETRY_QUEUE,
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, headers: { attempt: 3 } }),
    )
    expect(queue.waitForConfirms).toHaveBeenCalledOnce()
    expect(queue.ack).toHaveBeenCalledWith(job)
  })

  it('moves a repeatedly failing job to the failed queue after the retry budget', async () => {
    const queue = channel()
    const job = message({ attempt: 5 })

    await processAlertMessage({
      channel: queue,
      message: job,
      evaluate: vi.fn().mockRejectedValue(new Error('still unavailable')),
    })

    expect(queue.sendToQueue.mock.calls[0][0]).toBe(ALERT_FAILED_QUEUE)
    expect(queue.ack).toHaveBeenCalledWith(job)
  })

  it('isolates unsupported job payloads without retrying them as valid work', async () => {
    const queue = channel()
    const job = message({ body: { version: 99, type: 'unknown' } })

    await processAlertMessage({ channel: queue, message: job, evaluate: vi.fn() })

    expect(queue.sendToQueue.mock.calls[0][0]).toBe(ALERT_FAILED_QUEUE)
    expect(queue.sendToQueue.mock.calls[0][2].headers).toEqual({ attempt: 1 })
    expect(queue.ack).toHaveBeenCalledWith(job)
  })
})
