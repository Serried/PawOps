import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { APP_TIMEZONE } from '../../server/config.js'
import { query } from '../../server/db.js'
import { evaluateOverdueAlerts } from '../../server/services/alerts.js'
import { generateRoutineTasks } from '../../server/services/routine-tasks.js'
import { as, createHousehold, createPet } from '../helpers/fixtures.js'

const app = createApp()
let home, user, pet
const schedule = { type: 'medication', title: 'Daily medicine', time: '20:00', startDate: '2099-01-01' }

beforeEach(async () => {
  home = await createHousehold()
  user = home.members[0]
  pet = await createPet(home.householdId)
})

async function create(values = {}) {
  return request(app).post('/api/routines').set(as(user))
    .send({ petId: pet.id, ...schedule, ...values })
}

async function list() {
  return request(app).get(`/api/routines?householdId=${home.householdId}`).set(as(user))
}

describe('PBI-09 routine schedules and access', () => {
  it('stores schedule, assignee and returns the next occurrence in the app timezone', async () => {
    const created = await create({ assignedToId: home.members[1].id })
    expect(created.status).toBe(201)
    const response = await list()
    expect(response.status).toBe(200)
    expect(response.body.routines[0]).toMatchObject({
      ...schedule, status: 'upcoming', timeZone: APP_TIMEZONE,
      assignedTo: { name: home.members[1].name },
    })
    const next = response.body.routines[0].nextScheduledAt
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(next))
    expect(local).toBe('20:00')
    expect(new Date(next).getUTCFullYear()).toBe(2099)
  })

  it('finds a weekly occurrence after a future start date', async () => {
    await create({ daysOfWeek: [1] })
    const response = await list()
    const localDay = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIMEZONE, weekday: 'long',
    }).format(new Date(response.body.routines[0].nextScheduledAt))
    expect(localDay).toBe('Monday')
  })

  it.each([
    { time: '24:00' }, { startDate: '2026-02-30' }, { startDate: '9999-99-99' },
    { daysOfWeek: [] }, { daysOfWeek: [7] }, { daysOfWeek: ['1'] },
  ])('rejects invalid schedule %j', async (values) => {
    expect((await create(values)).status).toBe(400)
  })

  it('requires login and prevents cross-household reads, writes and assignment', async () => {
    const other = await createHousehold(['Outsider'])
    const outsider = other.members[0]
    const id = (await create()).body.routine.id
    expect((await request(app).get('/api/routines')).status).toBe(401)
    expect((await request(app).get(`/api/routines?householdId=${home.householdId}`).set(as(outsider))).status).toBe(403)
    expect((await request(app).patch(`/api/routines/${id}`).set(as(outsider)).send({ active: false })).status).toBe(404)
    expect((await request(app).delete(`/api/routines/${id}`).set(as(outsider))).status).toBe(404)
    expect((await request(app).post('/api/routines').set(as(outsider)).send({ ...schedule, petId: pet.id })).status).toBe(403)
    expect((await create({ assignedToId: outsider.id })).status).toBe(400)
  })

  it.each(['0', '-1', 'abc', '1.5'])('rejects invalid household filter %s', async (id) => {
    expect((await request(app).get(`/api/routines?householdId=${id}`).set(as(user))).status).toBe(400)
  })
})

describe('PBI-10 routine lifecycle and PBI-11 recovery', () => {
  async function makePastRoutine() {
    const id = (await create()).body.routine.id
    await query(`UPDATE care_routines SET start_date = (NOW() AT TIME ZONE $2)::date - 2,
      effective_from = (((NOW() AT TIME ZONE $2)::date - 2)::timestamp AT TIME ZONE $2),
      time_of_day = '00:00' WHERE id = $1`, [id, APP_TIMEZONE])
    return id
  }

  it('catches up after downtime and repeated workers create one task and alert per occurrence', async () => {
    const id = await makePastRoutine()
    await Promise.all(Array.from({ length: 5 }, () => evaluateOverdueAlerts({ householdIds: [home.householdId] })))
    const events = await query('SELECT id FROM care_events WHERE routine_id = $1', [id])
    expect(events.rowCount).toBe(3)
    const alerts = await query(`SELECT care_event_id, COUNT(*)::int AS count FROM alerts
      WHERE routine_id = $1 GROUP BY care_event_id`, [id])
    expect(alerts.rowCount).toBeGreaterThanOrEqual(2)
    expect(alerts.rows.every((row) => row.count === 1)).toBe(true)
  })

  it('pauses unfinished tasks, keeps completed history, and resumes without backfilling paused days', async () => {
    const id = await makePastRoutine()
    await generateRoutineTasks({ householdIds: [home.householdId] })
    await query(`UPDATE care_events SET status = 'done', completed_at = NOW(), completed_by = $2
      WHERE id = (SELECT MIN(id) FROM care_events WHERE routine_id = $1)`, [id, user.id])
    expect((await request(app).patch(`/api/routines/${id}`).set(as(user)).send({ active: false })).status).toBe(200)
    const paused = (await list()).body.routines[0]
    expect(paused).toMatchObject({ status: 'paused', nextScheduledAt: null })
    expect((await query('SELECT status FROM care_events WHERE routine_id = $1', [id])).rows).toEqual([{ status: 'done' }])
    await request(app).patch(`/api/routines/${id}`).set(as(user)).send({ active: true })
    await generateRoutineTasks({ householdIds: [home.householdId] })
    expect((await query('SELECT id FROM care_events WHERE routine_id = $1', [id])).rowCount).toBe(1)
  })

  it('reports done for today and deletion preserves the completed care event', async () => {
    const id = await makePastRoutine()
    await generateRoutineTasks({ householdIds: [home.householdId] })
    await query(`UPDATE care_events SET status = 'done', completed_at = NOW(), completed_by = $2
      WHERE routine_id = $1`, [id, user.id])
    expect((await list()).body.routines[0].status).toBe('done')
    expect((await request(app).delete(`/api/routines/${id}`).set(as(user))).status).toBe(204)
    expect((await list()).body.routines).toEqual([])
    const history = await query('SELECT routine_id, status FROM care_events WHERE pet_id = $1', [pet.id])
    expect(history.rowCount).toBe(3)
    expect(history.rows.every((row) => row.routine_id === null && row.status === 'done')).toBe(true)
  })

  it('editing a future schedule replaces pending occurrences', async () => {
    const id = (await create()).body.routine.id
    await query(`INSERT INTO care_events (pet_id,type,title,scheduled_at,routine_id,created_by)
      VALUES ($1,'medication','Old task','2099-01-01T13:00:00Z',$2,$3)`, [pet.id, id, user.id])
    const response = await request(app).patch(`/api/routines/${id}`).set(as(user))
      .send({ ...schedule, petId: pet.id, time: '21:00' })
    expect(response.status).toBe(200)
    expect((await query('SELECT id FROM care_events WHERE routine_id=$1', [id])).rowCount).toBe(0)
    expect((await list()).body.routines[0].time).toBe('21:00')
  })
})
