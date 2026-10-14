import { Router } from 'express'
import { CARE_EVENT_TYPES } from '../config.js'
import { badRequest } from '../lib/http-error.js'
import { paramId, toId, Validator } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import {
  completeCareEvent,
  EVENT_STATUS_FILTERS,
  listCareEvents,
} from '../services/care-events.js'

const DEFAULT_TITLES = {
  feeding: 'Feeding',
  water: 'Fresh water',
  walk: 'Walk',
  medication: 'Medication',
  vet_visit: 'Vet visit',
  grooming: 'Grooming',
}

export function careEventValues(body) {
  const values = new Validator(body)
    .oneOf('type', CARE_EVENT_TYPES, { required: true })
    .string('title', { max: 80 })
    .string('note', { max: 500 })
    .id('assignedToId')
    .timestamp('scheduledAt', { required: true })
    .result()
  if (!values.title) values.title = DEFAULT_TITLES[values.type]
  return values
}

export function listQuery(query) {
  const filters = { limit: 100 }
  if (query.status !== undefined) {
    if (!EVENT_STATUS_FILTERS.includes(query.status)) {
      throw badRequest(`status must be one of: ${EVENT_STATUS_FILTERS.join(', ')}`)
    }
    filters.status = query.status
  }
  for (const key of ['from', 'to']) {
    if (query[key] === undefined) continue
    const date = new Date(query[key])
    if (Number.isNaN(date.getTime())) throw badRequest(`${key} must be an ISO date-time`)
    filters[key] = date.toISOString()
  }
  if (query.limit !== undefined) {
    const limit = toId(query.limit)
    if (limit === null || limit > 200) throw badRequest('limit must be between 1 and 200')
    filters.limit = limit
  }
  if (query.householdId !== undefined) {
    const householdId = toId(query.householdId)
    if (householdId === null) throw badRequest('householdId must be a positive integer id')
    filters.householdId = householdId
  }
  return filters
}

export const careEventsRouter = Router()
careEventsRouter.use(requireAuth)

// Household-wide list, used by the Dashboard (Member 4)
careEventsRouter.get('/', async (request, response) => {
  const filters = listQuery(request.query)
  if (request.query.petId !== undefined) {
    filters.petId = paramId(request.query.petId, 'Pet')
  }
  response.json({ events: await listCareEvents(request.user, filters) })
})

// 409 DUPLICATE_CARE unless { override: true }
careEventsRouter.post('/:eventId/complete', async (request, response) => {
  const eventId = paramId(request.params.eventId, 'Care event')
  const { override } = new Validator(request.body).boolean('override').result()
  response.json({ event: await completeCareEvent(request.user, eventId, { override }) })
})
