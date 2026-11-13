import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { query } from '../../server/db.js'
import { evaluateOverdueAlerts } from '../../server/services/alerts.js'

const app = createApp()
const suffix = randomUUID()
const ownerEmail = `owner-${suffix}@test.pawops`
const memberEmail = `member-${suffix}@test.pawops`
const password = 'PawOpsJourney123!'
const created = { householdId: null, userIds: [] }

async function registerAndLogin(email, displayName) {
  const agent = request.agent(app)
  const registered = await agent.post('/api/auth/register').send({ email, password, displayName })
  expect(registered.status).toBe(201)
  created.userIds.push(Number(registered.body.user.id))
  const login = await agent.post('/api/auth/login').send({ email, password })
  expect(login.status).toBe(200)
  return { agent, id: Number(login.body.user.id) }
}

afterAll(async () => {
  if (created.householdId) {
    await query('DELETE FROM households WHERE id = $1', [created.householdId])
  }
  if (created.userIds.length) {
    await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [created.userIds])
  }
})

describe('PBI-01..20 reproducible MVP journey', () => {
  it('runs auth → household → pet → shared care → duplicate → routine → alert', async () => {
    const owner = await registerAndLogin(ownerEmail, 'Journey Owner')
    const member = await registerAndLogin(memberEmail, 'Journey Member')

    const household = await owner.agent.post('/api/households').send({ name: `Journey ${suffix}` })
    expect(household.status).toBe(201)
    created.householdId = Number(household.body.household.id)

    const added = await owner.agent
      .post(`/api/households/${created.householdId}/members`)
      .send({ email: memberEmail })
    expect(added.status).toBe(201)

    const petResponse = await owner.agent.post('/api/pets').send({
      householdId: created.householdId,
      name: 'Mochi Journey',
      species: 'Dog',
      caretakerIds: [owner.id, member.id],
    })
    expect(petResponse.status).toBe(201)
    const petId = petResponse.body.pet.id

    const firstCare = await owner.agent.post(`/api/pets/${petId}/events`).send({
      type: 'feeding',
      title: 'Breakfast',
      scheduledAt: new Date().toISOString(),
    })
    expect(firstCare.status).toBe(201)
    expect((await owner.agent.post(`/api/care-events/${firstCare.body.event.id}/complete`).send({})).status)
      .toBe(200)

    const sharedTimeline = await member.agent.get(`/api/pets/${petId}/events?status=done`)
    expect(sharedTimeline.status).toBe(200)
    expect(sharedTimeline.body.events[0]).toMatchObject({
      petId,
      type: 'feeding',
      completedBy: { id: owner.id, name: 'Journey Owner' },
    })

    const duplicate = await member.agent.post(`/api/pets/${petId}/events`).send({
      type: 'feeding',
      title: 'Second breakfast',
      scheduledAt: new Date().toISOString(),
    })
    const warning = await member.agent
      .post(`/api/care-events/${duplicate.body.event.id}/complete`)
      .send({})
    expect(warning.status).toBe(409)
    expect(warning.body.error).toMatchObject({ code: 'DUPLICATE_CARE' })
    expect(warning.body.error.message).toContain('Mochi Journey was fed')

    const routine = await owner.agent.post('/api/routines').send({
      petId,
      type: 'medication',
      title: 'Evening medicine',
      time: '20:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      assignedToId: member.id,
    })
    expect(routine.status).toBe(201)
    const routines = await member.agent.get(`/api/routines?householdId=${created.householdId}`)
    expect(routines.body.routines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: routine.body.routine.id, nextScheduledAt: expect.any(String) }),
    ]))

    const overdue = await owner.agent.post(`/api/pets/${petId}/events`).send({
      type: 'walk',
      title: 'Overdue walk',
      scheduledAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      assignedToId: member.id,
    })
    expect(overdue.status).toBe(201)
    await evaluateOverdueAlerts({ householdIds: [created.householdId] })
    await evaluateOverdueAlerts({ householdIds: [created.householdId] })

    const alerts = await member.agent.get(`/api/alerts?householdId=${created.householdId}&status=active`)
    expect(alerts.status).toBe(200)
    expect(alerts.body.alerts.filter((alert) => alert.careEvent.id === overdue.body.event.id))
      .toHaveLength(1)

    const outsider = await registerAndLogin(`outsider-${suffix}@test.pawops`, 'Journey Outsider')
    const forbidden = await outsider.agent.get(`/api/pets/${petId}`)
    expect(forbidden.status).toBe(403)
    expect(JSON.stringify(forbidden.body)).not.toContain('Mochi Journey')
  }, 30_000)
})
