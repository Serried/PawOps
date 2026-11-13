import request from 'supertest'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { pool, query } from '../../server/db.js'
import { as, createHousehold, createPet } from '../helpers/fixtures.js'

const app = createApp()

it('counts unread alerts across all history and filters before pagination', async () => {
  const home = await createHousehold()
  const owner = home.members[0]
  const pet = await createPet(home.householdId)
  const event = (await query(`INSERT INTO care_events(pet_id,type,title,scheduled_at,created_by)
    VALUES($1,'medication','Unresolved medicine',NOW()-INTERVAL '2 days',$2) RETURNING id`, [pet.id, owner.id])).rows[0]
  await query(`INSERT INTO alerts(household_id,pet_id,care_event_id,type,message,created_at)
    VALUES($1,$2,$3,'overdue','Unresolved',NOW()-INTERVAL '2 days')`, [home.householdId, pet.id, event.id])
  await query(`WITH events AS (
    INSERT INTO care_events(pet_id,type,title,scheduled_at,status,completed_at,completed_by,created_by)
    SELECT $1,'walk','Resolved '||n,NOW()-INTERVAL '1 day','done',NOW(),$2,$2
    FROM generate_series(1,100) n RETURNING id
  ) INSERT INTO alerts(household_id,pet_id,care_event_id,type,message)
    SELECT $3,$1,id,'overdue','Resolved' FROM events`, [pet.id, owner.id, home.householdId])
  const list = status => request(app).get('/api/alerts').query({ householdId: home.householdId, status }).set(as(owner))
  const all = await list('all')
  expect(all.status).toBe(200)
  expect(all.body).toMatchObject({ unreadCount: 1, pagination: { total: 101, hasMore: true } })
  expect(all.body.alerts).toHaveLength(100)
  const unread = await list('active')
  expect(unread.body.alerts).toHaveLength(1)
  expect(unread.body.alerts[0].careEvent.id).toBe(Number(event.id))
  const resolved = await list('resolved')
  expect(resolved.body.pagination.total).toBe(100)
  expect(resolved.body.alerts.every(a => a.status === 'resolved')).toBe(true)
  const next = await request(app).get('/api/alerts').query({ householdId: home.householdId, offset: 100 }).set(as(owner))
  expect(next.body.alerts.map(a => a.id)).toEqual(unread.body.alerts.map(a => a.id))
  const outsider = (await createHousehold(['Outsider'])).members[0]
  const denied = await request(app).get(`/api/alerts?householdId=${home.householdId}`).set(as(outsider))
  expect(denied.status).toBe(403)
  for (const params of [{ offset: -1 }, { offset: '1.5' }, { limit: 0 }, { limit: 201 }]) {
    expect((await request(app).get('/api/alerts').query(params).set(as(owner))).status).toBe(400)
  }
})

it.each(['pause', 'delete'])('returns a controlled conflict if a routine is %s while completion waits', async action => {
  const home = await createHousehold()
  const owner = home.members[0]
  const pet = await createPet(home.householdId)
  const created = await request(app).post('/api/routines').set(as(owner)).send({
    petId: pet.id, type: 'walk', time: '20:00', startDate: '2099-01-01',
  })
  const routineId = created.body.routine.id
  const event = (await query(`INSERT INTO care_events(pet_id,type,title,scheduled_at,routine_id,created_by)
    VALUES($1,'walk','Race task',NOW()-INTERVAL '1 hour',$2,$3) RETURNING id`, [pet.id, routineId, owner.id])).rows[0]
  const lock = await pool.connect()
  let completing
  try {
    await lock.query('BEGIN')
    await lock.query('SELECT id FROM pets WHERE id=$1 FOR UPDATE', [pet.id])
    const pid = (await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    completing = request(app).post(`/api/care-events/${event.id}/complete`).set(as(owner)).send({}).then(r => r)
    let blocked = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await query('SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))', [pid])
      if (waiting.rowCount) { blocked = true; break }
      await delay(20)
    }
    expect(blocked).toBe(true)
    const change = action === 'pause'
      ? await request(app).patch(`/api/routines/${routineId}`).set(as(owner)).send({ active: false })
      : await request(app).delete(`/api/routines/${routineId}`).set(as(owner))
    expect(change.status).toBe(action === 'pause' ? 200 : 204)
    await lock.query('COMMIT')
    const response = await completing
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('CARE_EVENT_CHANGED')
  } finally {
    await lock.query('ROLLBACK')
    lock.release()
    if (completing) await completing
  }
})

it('rejects impossible dates at the API without creating care events', async () => {
  const home = await createHousehold()
  const owner = home.members[0]
  const pet = await createPet(home.householdId)
  for (const scheduledAt of ['2026-02-30T12:00:00+07:00', '2026-04-31T00:00:00Z']) {
    const result = await request(app).post(`/api/pets/${pet.id}/events`).set(as(owner)).send({ type: 'walk', scheduledAt })
    expect(result.status).toBe(400)
    expect(result.body.error.details.fields.scheduledAt).toBeDefined()
  }
  expect((await query('SELECT id FROM care_events WHERE pet_id=$1', [pet.id])).rowCount).toBe(0)
  const invalidRange = await request(app).get('/api/care-events').query({ from: '2026-02-30T00:00:00Z' }).set(as(owner))
  expect(invalidRange.status).toBe(400)
})
