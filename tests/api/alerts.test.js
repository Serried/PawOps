import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { APP_TIMEZONE } from '../../server/config.js'
import { query } from '../../server/db.js'
import { evaluateOverdueAlerts } from '../../server/services/alerts.js'
import { as, createHousehold, createPet } from '../helpers/fixtures.js'

const app = createApp()

let home
let tanakrit
let ryuu
let mochi

beforeEach(async () => {
  home = await createHousehold(['Tanakrit', 'Ryuu'])
  ;[tanakrit, ryuu] = home.members
  mochi = await createPet(home.householdId, 'Mochi')
})

async function createRoutine({ time = '20:00', active = true } = {}) {
  const result = await query(
    `INSERT INTO care_routines (pet_id, type, title, time_of_day, created_by, active)
     VALUES ($1, 'medication', 'Medication', $2, $3, $4) RETURNING id`,
    [mochi.id, time, tanakrit.id, active],
  )
  return Number(result.rows[0].id)
}

// A routine task that was due `minutesAgo` minutes ago
async function routineTask(routineId, { minutesAgo, status = 'upcoming' } = {}) {
  const done = status === 'done'
  const result = await query(
    `INSERT INTO care_events
       (pet_id, type, title, scheduled_at, routine_id, created_by, status, completed_at, completed_by)
     VALUES ($1, 'medication', 'Medication', NOW() - make_interval(mins => $2), $3, $4, $5,
             ${done ? 'NOW()' : 'NULL'}, ${done ? '$4' : 'NULL'})
     RETURNING id`,
    [mochi.id, minutesAgo, routineId, tanakrit.id, status],
  )
  return Number(result.rows[0].id)
}

async function countAlerts(eventId) {
  const result = await query('SELECT COUNT(*) AS n FROM alerts WHERE care_event_id = $1', [eventId])
  return Number(result.rows[0].n)
}

function minutesSinceLocalMidnight() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type) => Number(parts.find((part) => part.type === type).value)
  return value('hour') * 60 + value('minute')
}

describe('PBI-11 an overdue alert is created exactly once', () => {
  it('50 evaluations leave one alert', async () => {
    const eventId = await routineTask(await createRoutine(), { minutesAgo: 60 })
    for (let run = 0; run < 50; run += 1) await evaluateOverdueAlerts()
    expect(await countAlerts(eventId)).toBe(1)
  })

  it('parallel evaluations (several workers) still leave one alert', async () => {
    const eventId = await routineTask(await createRoutine(), { minutesAgo: 60 })
    await Promise.all(Array.from({ length: 10 }, () => evaluateOverdueAlerts()))
    expect(await countAlerts(eventId)).toBe(1)
  })

  it('does not alert inside the grace period, for done tasks or for one-off tasks', async () => {
    const routineId = await createRoutine()
    const recent = await routineTask(routineId, { minutesAgo: 0 })
    const finished = await routineTask(routineId, { minutesAgo: 120, status: 'done' })
    const oneOff = await query(
      `INSERT INTO care_events (pet_id, type, title, scheduled_at, created_by)
       VALUES ($1, 'walk', 'Walk', NOW() - INTERVAL '2 hours', $2) RETURNING id`,
      [mochi.id, tanakrit.id],
    )
    await evaluateOverdueAlerts()
    expect(await countAlerts(recent)).toBe(0)
    expect(await countAlerts(finished)).toBe(0)
    expect(await countAlerts(Number(oneOff.rows[0].id))).toBe(0)
  })

  it('does not alert for a paused routine', async () => {
    const eventId = await routineTask(await createRoutine({ active: false }), { minutesAgo: 60 })
    await evaluateOverdueAlerts()
    expect(await countAlerts(eventId)).toBe(0)
  })

  it('creates the task and its alert without anyone opening the app (background job)', async () => {
    // A 00:00 routine is more than 15 minutes late any time after 00:15 local time
    if (minutesSinceLocalMidnight() < 20) return
    const routineId = await createRoutine({ time: '00:00' })
    await query(
      `UPDATE care_routines
          SET start_date = (NOW() AT TIME ZONE $2)::date, effective_from = NOW() - INTERVAL '2 days'
        WHERE id = $1`,
      [routineId, APP_TIMEZONE],
    )
    await evaluateOverdueAlerts()
    await evaluateOverdueAlerts()
    const result = await query(
      `SELECT COUNT(*) AS n FROM alerts WHERE routine_id = $1 AND type = 'overdue'`,
      [routineId],
    )
    expect(Number(result.rows[0].n)).toBe(1)
  })
})

describe('Alert API', () => {
  it('shows the alert to every household member and names pet and task', async () => {
    const eventId = await routineTask(await createRoutine(), { minutesAgo: 60 })
    await evaluateOverdueAlerts({ householdIds: [home.householdId] })
    const response = await request(app).get('/api/alerts').set(as(ryuu))
    expect(response.status).toBe(200)
    expect(response.body.alerts).toHaveLength(1)
    expect(response.body.alerts[0]).toMatchObject({
      petName: 'Mochi',
      type: 'overdue',
      status: 'active',
      careEvent: { id: eventId, status: 'upcoming' },
    })
    expect(response.body.alerts[0].message).toContain('Mochi')
  })

  it('listing again and again never adds a second alert', async () => {
    await routineTask(await createRoutine(), { minutesAgo: 60 })
    await evaluateOverdueAlerts({ householdIds: [home.householdId] })
    for (let i = 0; i < 5; i += 1) await request(app).get('/api/alerts').set(as(tanakrit))
    const response = await request(app).get('/api/alerts?status=all').set(as(tanakrit))
    expect(response.body.alerts).toHaveLength(1)
  })

  it('is resolved once the task is completed', async () => {
    const eventId = await routineTask(await createRoutine(), { minutesAgo: 60 })
    await evaluateOverdueAlerts({ householdIds: [home.householdId] })
    await request(app).get('/api/alerts').set(as(tanakrit))
    const done = await request(app)
      .post(`/api/care-events/${eventId}/complete`)
      .set(as(ryuu))
      .send({})
    expect(done.status).toBe(200)

    const active = await request(app).get('/api/alerts?status=active').set(as(tanakrit))
    expect(active.body.alerts).toHaveLength(0)
    const all = await request(app).get('/api/alerts?status=all').set(as(tanakrit))
    expect(all.body.alerts[0]).toMatchObject({ status: 'resolved' })
    expect(all.body.alerts[0].careEvent.completedBy).toBe('Ryuu')
  })

  it('can be marked read by a member, and stays read for the whole household', async () => {
    await routineTask(await createRoutine(), { minutesAgo: 60 })
    await evaluateOverdueAlerts({ householdIds: [home.householdId] })
    const list = await request(app).get('/api/alerts').set(as(tanakrit))
    const alertId = list.body.alerts[0].id
    const ack = await request(app).post(`/api/alerts/${alertId}/acknowledge`).set(as(ryuu))
    expect(ack.status).toBe(200)
    expect(ack.body.alert.status).toBe('acknowledged')
    const active = await request(app).get('/api/alerts?status=active').set(as(tanakrit))
    expect(active.body.alerts).toHaveLength(0)
  })

  it('another household sees nothing and cannot read or mark it (403)', async () => {
    await routineTask(await createRoutine(), { minutesAgo: 60 })
    await evaluateOverdueAlerts({ householdIds: [home.householdId] })
    const list = await request(app).get('/api/alerts').set(as(tanakrit))
    const alertId = list.body.alerts[0].id
    const outsider = (await createHousehold(['Olive'])).members[0]

    const own = await request(app).get('/api/alerts').set(as(outsider))
    expect(own.body.alerts).toHaveLength(0)
    const foreign = await request(app)
      .get(`/api/alerts?householdId=${home.householdId}`)
      .set(as(outsider))
    expect(foreign.status).toBe(403)
    const ack = await request(app).post(`/api/alerts/${alertId}/acknowledge`).set(as(outsider))
    expect(ack.status).toBe(403)
  })

  it('rejects a bad status filter and requires login', async () => {
    const bad = await request(app).get('/api/alerts?status=nope').set(as(tanakrit))
    expect(bad.status).toBe(400)
    expect((await request(app).get('/api/alerts')).status).toBe(401)
  })

  it('serves the API while workers are stopped without creating alerts on a read', async () => {
    const eventId = await routineTask(await createRoutine(), { minutesAgo: 60 })
    const response = await request(app).get('/api/alerts').set(as(tanakrit))
    expect(response.status).toBe(200)
    expect(response.body.alerts).toHaveLength(0)
    expect(await countAlerts(eventId)).toBe(0)
  })
})

describe('routine task generation', () => {
  it('works through the care-event list and never creates an occurrence twice', async () => {
    const routineId = await createRoutine({ time: '00:00' })
    await query(
      `UPDATE care_routines
          SET start_date = CURRENT_DATE - 2, effective_from = NOW() - INTERVAL '2 days'
        WHERE id = $1`,
      [routineId],
    )
    const first = await request(app).get('/api/care-events').set(as(tanakrit))
    expect(first.status).toBe(200)
    await request(app).get('/api/care-events').set(as(ryuu))
    await request(app).get('/api/care-events').set(as(tanakrit))
    const duplicates = await query(
      `SELECT scheduled_at FROM care_events WHERE routine_id = $1
        GROUP BY scheduled_at HAVING COUNT(*) > 1`,
      [routineId],
    )
    expect(duplicates.rowCount).toBe(0)
  })
})
