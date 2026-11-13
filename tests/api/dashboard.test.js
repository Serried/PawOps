import request from 'supertest'
import { expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { evaluateOverdueAlerts } from '../../server/services/alerts.js'
import { api } from '../../src/api/client.js'
import { getDashboard, localDayBounds } from '../../src/api/dashboard.js'
import { query } from '../../server/db.js'
import { as, createHousehold, createPet } from '../helpers/fixtures.js'

it('removes acknowledged alerts from the dashboard while keeping their overdue care task', async () => {
  const app = createApp()
  const home = await createHousehold(['Owner', 'Member'])
  const [owner, member] = home.members
  const pet = await createPet(home.householdId)
  const created = await request(app).post(`/api/pets/${pet.id}/events`).set(as(owner)).send({
    type: 'walk', title: 'Missed walk', scheduledAt: new Date(Date.now() - 3600000).toISOString(),
  })
  expect(created.status).toBe(201)
  await evaluateOverdueAlerts({ householdIds: [home.householdId] })

  // Exercise the actual frontend data loader against Express and PostgreSQL.
  const adapter = api.defaults.adapter
  api.defaults.adapter = async (config) => {
    const response = await request(app).get('/api' + config.url)
      .query(config.params ?? {}).set(as(owner))
    expect(response.status).toBe(200)
    return { data: response.body, status: response.status, headers: response.headers, config }
  }
  try {
    const before = await getDashboard(home.householdId)
    expect(before.activeAlerts).toHaveLength(1)
    expect(before.activeAlerts[0].careEvent.id).toBe(created.body.event.id)
    const ack = await request(app).post(`/api/alerts/${before.activeAlerts[0].id}/acknowledge`)
      .set(as(member)).send({})
    expect(ack.status).toBe(200)
    const after = await getDashboard(home.householdId)
    expect(after.activeAlerts).toEqual([])
    const pending = await request(app).get('/api/care-events?status=overdue').set(as(owner))
    expect(pending.body.events.some(event => event.id === created.body.event.id)).toBe(true)
  } finally {
    api.defaults.adapter = adapter
  }
})

it('groups today care by its scheduled date while keeping late completions in recent activity', async () => {
  const app = createApp()
  const home = await createHousehold()
  const owner = home.members[0]
  const pet = await createPet(home.householdId)
  const { from } = localDayBounds()
  const today = new Date(new Date(from).getTime() + 12 * 3600000).toISOString()
  const yesterday = new Date(new Date(from).getTime() - 12 * 3600000).toISOString()
  await query(`INSERT INTO care_events(pet_id,type,title,scheduled_at,status,completed_at,completed_by,created_by)
    VALUES ($1,'walk','Scheduled today',$2,'done',$3,$4,$4),
           ($1,'walk','Completed today',$3,'done',$2,$4,$4)`, [pet.id, today, yesterday, owner.id])
  const adapter = api.defaults.adapter
  api.defaults.adapter = async config => {
    const response = await request(app).get('/api' + config.url).query(config.params ?? {}).set(as(owner))
    expect(response.status).toBe(200)
    return { data: response.body, status: response.status, headers: response.headers, config }
  }
  try {
    const dashboard = await getDashboard(home.householdId)
    expect(dashboard.today.map(event => event.title)).toEqual(['Scheduled today'])
    expect(dashboard.recentActivity.some(event => event.title === 'Completed today')).toBe(true)
  } finally {
    api.defaults.adapter = adapter
  }
})
