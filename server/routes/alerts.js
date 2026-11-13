import { Router } from 'express'
import { badRequest } from '../lib/http-error.js'
import { paramId, toId } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { acknowledgeAlert, listAlertsPage } from '../services/alerts.js'

const STATUS_FILTERS = ['active', 'all', 'resolved']

export const alertsRouter = Router()
alertsRouter.use(requireAuth)

alertsRouter.get('/', async (request, response) => {
  const filters = {}
  if (request.query.status !== undefined) {
    if (!STATUS_FILTERS.includes(request.query.status)) {
      throw badRequest(`status must be one of: ${STATUS_FILTERS.join(', ')}`)
    }
    filters.status = request.query.status
  }
  if (request.query.householdId !== undefined) {
    const householdId = toId(request.query.householdId)
    if (householdId === null) throw badRequest('householdId must be a positive integer id')
    filters.householdId = householdId
  }
  if (request.query.limit !== undefined) {
    const limit = toId(request.query.limit)
    if (limit === null || limit > 200) throw badRequest('limit must be between 1 and 200')
    filters.limit = limit
  }
  if (request.query.offset !== undefined) {
    const value = request.query.offset
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw badRequest('offset must be a non-negative integer')
    }
    filters.offset = Number(value)
  }
  response.json(await listAlertsPage(request.user, filters))
})

alertsRouter.post('/:alertId/acknowledge', async (request, response) => {
  const alertId = paramId(request.params.alertId, 'Alert')
  response.json({ alert: await acknowledgeAlert(request.user, alertId) })
})
