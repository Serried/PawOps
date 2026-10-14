import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { query } from '../../server/db.js'
import { as, createHousehold, createPet, insertDoneEvent } from '../helpers/fixtures.js'

const app = createApp()

let home
let tanakrit
let ryuu
let mochi

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString()

function schedule(user, body, pet = mochi) {
  return request(app)
    .post(`/api/pets/${pet.id}/events`)
    .set(as(user))
    .send({ scheduledAt: inMinutes(0), ...body })
}

function complete(user, eventId, body = {}) {
  return request(app).post(`/api/care-events/${eventId}/complete`).set(as(user)).send(body)
}

beforeEach(async () => {
  home = await createHousehold(['Tanakrit', 'Ryuu'])
  ;[tanakrit, ryuu] = home.members
  mochi = await createPet(home.householdId, 'Mochi')
})

describe('PBI-06 Add Care Event', () => {
  it('schedules a one-off task assigned to a member', async () => {
    const scheduledAt = inMinutes(120)
    const response = await schedule(tanakrit, {
      type: 'feeding',
      title: 'Dinner',
      scheduledAt,
      assignedToId: ryuu.id,
    })

    expect(response.status).toBe(201)
    expect(response.body.event).toMatchObject({
      petId: mochi.id,
      type: 'feeding',
      title: 'Dinner',
      status: 'upcoming',
      assignedTo: { id: ryuu.id, name: 'Ryuu' },
      completedAt: null,
      completedBy: null,
    })
    expect(new Date(response.body.event.scheduledAt).toISOString()).toBe(scheduledAt)
  })

  it('uses the type as title when the title is empty', async () => {
    const response = await schedule(tanakrit, { type: 'grooming', title: '' })
    expect(response.body.event.title).toBe('Grooming')
  })

  it('validates type, schedule time and assignee', async () => {
    const outsider = (await createHousehold(['Olive'])).members[0]
    const invalid = await request(app)
      .post(`/api/pets/${mochi.id}/events`)
      .set(as(tanakrit))
      .send({ type: 'dance' })
    expect(invalid.status).toBe(400)
    expect(Object.keys(invalid.body.error.details.fields).sort()).toEqual(['scheduledAt', 'type'])

    const badAssignee = await schedule(tanakrit, { type: 'walk', assignedToId: outsider.id })
    expect(badAssignee.status).toBe(400)
    expect(badAssignee.body.error.details.fields.assignedToId).toBeDefined()
  })
})

describe('AC-01 / PBI-07 record care and timeline', () => {
  it('Mark as Done stores pet, user, type and timestamp; another member sees it', async () => {
    const task = await schedule(tanakrit, { type: 'feeding', title: 'Dinner', assignedToId: ryuu.id })
    const done = await complete(tanakrit, task.body.event.id)

    expect(done.status).toBe(200)
    expect(done.body.event).toMatchObject({
      petId: mochi.id,
      type: 'feeding',
      status: 'done',
      completedBy: { id: tanakrit.id, name: 'Tanakrit' },
      duplicateOverride: false,
    })
    expect(Date.now() - new Date(done.body.event.completedAt).getTime()).toBeLessThan(60_000)

    const timeline = await request(app)
      .get(`/api/pets/${mochi.id}/events?status=done`)
      .set(as(ryuu))
    expect(timeline.status).toBe(200)
    expect(timeline.body.events.map((e) => e.id)).toEqual([task.body.event.id])
  })

  it('reports an unfinished task past its grace period as overdue; done is never overdue', async () => {
    const task = await schedule(tanakrit, { type: 'walk', scheduledAt: inMinutes(-60) })
    expect(task.body.event.status).toBe('overdue')

    const list = await request(app)
      .get(`/api/care-events?status=overdue&householdId=${home.householdId}`)
      .set(as(tanakrit))
    expect(list.body.events.map((e) => e.id)).toEqual([task.body.event.id])

    const done = await complete(tanakrit, task.body.event.id)
    expect(done.body.event.status).toBe('done')
  })

  it('refuses to complete the same task twice', async () => {
    const task = await schedule(tanakrit, { type: 'walk' })
    await complete(tanakrit, task.body.event.id)
    const again = await complete(ryuu, task.body.event.id)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_DONE')
  })
})

describe('AC-03 / PBI-08 duplicate safety', () => {
  it('warns when Mochi was fed 5 minutes ago, naming when and who', async () => {
    await insertDoneEvent({ pet: mochi, user: tanakrit, type: 'feeding', minutesAgo: 5 })
    const task = await schedule(ryuu, { type: 'feeding', title: 'Dinner' })

    const response = await complete(ryuu, task.body.event.id)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('DUPLICATE_CARE')
    expect(response.body.error.message).toBe('Mochi was fed 5 minutes ago by Tanakrit')
    expect(response.body.error.details.previous).toMatchObject({
      completedBy: { id: tanakrit.id, name: 'Tanakrit' },
    })

    const row = await query('SELECT status FROM care_events WHERE id = $1', [task.body.event.id])
    expect(row.rows[0].status).toBe('upcoming')
  })

  it('names medication in the warning', async () => {
    await insertDoneEvent({ pet: mochi, user: tanakrit, type: 'medication', minutesAgo: 10 })
    const task = await schedule(ryuu, { type: 'medication', title: 'Pill' })
    const response = await complete(ryuu, task.body.event.id)
    expect(response.status).toBe(409)
    expect(response.body.error.message).toBe('Mochi was given medication 10 minutes ago by Tanakrit')
  })

  it('records it when the member presses Override', async () => {
    await insertDoneEvent({ pet: mochi, user: tanakrit, type: 'feeding', minutesAgo: 5 })
    const task = await schedule(ryuu, { type: 'feeding' })
    const response = await complete(ryuu, task.body.event.id, { override: true })
    expect(response.status).toBe(200)
    expect(response.body.event).toMatchObject({ status: 'done', duplicateOverride: true })
  })

  it('does not warn outside the duplicate window', async () => {
    await insertDoneEvent({ pet: mochi, user: tanakrit, type: 'feeding', minutesAgo: 45 })
    const task = await schedule(ryuu, { type: 'feeding' })
    expect((await complete(ryuu, task.body.event.id)).status).toBe(200)
  })

  it('does not warn for types that may repeat, or for another pet', async () => {
    await insertDoneEvent({ pet: mochi, user: tanakrit, type: 'walk', minutesAgo: 5 })
    const luna = await createPet(home.householdId, 'Luna', 'Cat')
    await insertDoneEvent({ pet: luna, user: tanakrit, type: 'feeding', minutesAgo: 5 })

    const walk = await schedule(ryuu, { type: 'walk' })
    const feed = await schedule(ryuu, { type: 'feeding' })
    const results = [
      (await complete(ryuu, walk.body.event.id)).status,
      (await complete(ryuu, feed.body.event.id)).status,
    ]
    expect(results).toEqual([200, 200])
  })

  it('lets only one of two members who feed at the same moment through', async () => {
    const first = await schedule(tanakrit, { type: 'feeding', title: 'Dinner' })
    const second = await schedule(ryuu, { type: 'feeding', title: 'Dinner' })

    const statuses = await Promise.all([
      complete(tanakrit, first.body.event.id),
      complete(ryuu, second.body.event.id),
    ])
    expect(statuses.map((r) => r.status).sort()).toEqual([200, 409])

    const done = await query(
      "SELECT count(*)::int AS n FROM care_events WHERE pet_id = $1 AND status = 'done'",
      [mochi.id],
    )
    expect(done.rows[0].n).toBe(1)
  })

  it('lets only one member complete the same task at the same moment', async () => {
    const task = await schedule(tanakrit, { type: 'walk' })
    const statuses = await Promise.all([
      complete(tanakrit, task.body.event.id),
      complete(ryuu, task.body.event.id),
    ])
    expect(statuses.map((r) => r.status).sort()).toEqual([200, 409])
  })
})

describe('history and access rules', () => {
  it('BR-06: removing a household member keeps their care events', async () => {
    const task = await schedule(tanakrit, { type: 'walk' })
    await complete(ryuu, task.body.event.id)

    await query('DELETE FROM household_members WHERE household_id = $1 AND user_id = $2', [
      home.householdId,
      ryuu.id,
    ])

    const timeline = await request(app).get(`/api/pets/${mochi.id}/events`).set(as(tanakrit))
    const event = timeline.body.events.find((e) => e.id === task.body.event.id)
    expect(event.completedBy).toEqual({ id: ryuu.id, name: 'Ryuu' })

    // BR-06: a user with care history can't be deleted
    await expect(query('DELETE FROM users WHERE id = $1', [ryuu.id])).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('BR-02 / AC-02: members of another household cannot read or record care', async () => {
    const olive = (await createHousehold(['Olive'])).members[0]
    const task = await schedule(tanakrit, { type: 'walk', scheduledAt: inMinutes(30) })

    const create = await schedule(olive, { type: 'feeding' })
    const timeline = await request(app).get(`/api/pets/${mochi.id}/events`).set(as(olive))
    const done = await complete(olive, task.body.event.id)

    expect([create.status, timeline.status, done.status]).toEqual([403, 403, 403])
    expect(JSON.stringify(timeline.body)).not.toContain('Mochi')

    const list = await request(app).get('/api/care-events').set(as(olive))
    expect(list.body.events.every((e) => e.petId !== mochi.id)).toBe(true)
  })

  it('BR-02: care for a pet that does not exist is denied like another household pet', async () => {
    const response = await request(app)
      .post('/api/pets/999999999/events')
      .set(as(tanakrit))
      .send({ type: 'feeding', scheduledAt: inMinutes(0) })
    expect(response.status).toBe(403)
    expect(response.body.error.message).toBe('Pet access denied.')
  })

  it('rejects an unknown status filter', async () => {
    const response = await request(app).get('/api/care-events?status=bogus').set(as(tanakrit))
    expect(response.status).toBe(400)
  })
})
