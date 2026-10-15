import { Router } from 'express'
import { badRequest } from '../lib/http-error.js'
import { paramId, toId } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { acknowledgeAlert, listAlerts } from '../services/alerts.js'

const STATUS_FILTERS = ['active', 'all']

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
  response.json({ alerts: await listAlerts(request.user, filters) })
})

alertsRouter.post('/:alertId/acknowledge', async (request, response) => {
  const alertId = paramId(request.params.alertId, 'Alert')
  response.json({ alert: await acknowledgeAlert(request.user, alertId) })
})
