import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { query } from '../../server/db.js'
import { as, createHousehold, createPet, insertDoneEvent } from '../helpers/fixtures.js'

const app = createApp()

describe('Member 1 login + Member 2 pets', () => {
  it('a user who registers and logs in can create and read pets of their household', async () => {
    const email = `login-${randomUUID()}@test.pawops`
    const register = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'pawops123', displayName: 'Login Test' })
    expect(register.status).toBe(201)

    const login = await request(app).post('/api/auth/login').send({ email, password: 'pawops123' })
    expect(login.status).toBe(200)
    const cookie = login.headers['set-cookie'][0].split(';')[0]

    const household = await request(app)
      .post('/api/households')
      .set('Cookie', cookie)
      .send({ name: `Login home ${randomUUID()}` })
    expect(household.status).toBe(201)

    const created = await request(app)
      .post('/api/pets')
      .set('Cookie', cookie)
      .send({ name: 'Mochi', species: 'Dog', householdId: Number(household.body.household.id) })
    expect(created.status).toBe(201)

    const list = await request(app).get('/api/pets').set('Cookie', cookie)
    expect(list.body.pets.map((pet) => pet.name)).toEqual(['Mochi'])

    await query('DELETE FROM households WHERE id = $1', [household.body.household.id])
    await query('DELETE FROM users WHERE email = $1', [email])
  })

  it('rejects requests without a valid session', async () => {
    const response = await request(app).get('/api/pets').set('Cookie', 'pawops_session=forged')
    expect(response.status).toBe(401)
  })

  it('a member who leaves the household is no longer shown as a caretaker', async () => {
    const home = await createHousehold(['Tanakrit', 'Ryuu'])
    const [owner, member] = home.members
    const pet = await createPet(home.householdId, 'Mochi')
    await request(app)
      .patch(`/api/pets/${pet.id}`)
      .set(as(owner))
      .send({ caretakerIds: [member.id] })

    const leave = await request(app)
      .post(`/api/households/${home.householdId}/leave`)
      .set(as(member))
      .send({})
    expect(leave.status).toBe(200)

    const detail = await request(app).get(`/api/pets/${pet.id}`).set(as(owner))
    expect(detail.body.pet.caretakers).toEqual([])
    const save = await request(app).patch(`/api/pets/${pet.id}`).set(as(owner)).send({ breed: 'Corgi' })
    expect(save.status).toBe(200)
  })

  it('when the last owner leaves, the household, its pets and their care history are deleted', async () => {
    const home = await createHousehold(['Tanakrit'])
    const [owner] = home.members
    const pet = await createPet(home.householdId, 'Mochi')
    await insertDoneEvent({ pet, user: owner, type: 'feeding', minutesAgo: 5 })

    const leave = await request(app)
      .post(`/api/households/${home.householdId}/leave`)
      .set(as(owner))
      .send({})
    expect(leave.status).toBe(200)
    expect(leave.body.householdDeleted).toBe(true)

    const pets = await query('SELECT count(*)::int AS n FROM pets WHERE id = $1', [pet.id])
    const events = await query('SELECT count(*)::int AS n FROM care_events WHERE pet_id = $1', [pet.id])
    expect([pets.rows[0].n, events.rows[0].n]).toEqual([0, 0])
  })
})
