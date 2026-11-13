import request from 'supertest'
import sharp from 'sharp'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { query } from '../../server/db.js'
import { UPLOAD_DIR } from '../../server/config.js'
import { as, createHousehold, createPet, insertDoneEvent } from '../helpers/fixtures.js'

const app = createApp()

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

let home
let owner
let member

beforeEach(async () => {
  home = await createHousehold(['Tanakrit', 'Ryuu'])
  ;[owner, member] = home.members
})

describe('PBI-05 pet profiles', () => {
  it('creates a pet with the full profile and caretakers', async () => {
    const response = await request(app)
      .post('/api/pets')
      .set(as(owner))
      .send({
        householdId: home.householdId,
        name: '  Mochi ',
        species: 'Dog',
        breed: 'Shiba Inu',
        birthDate: '2022-03-14',
        weightKg: 11.4,
        sex: 'female',
        healthNotes: 'No known allergies',
        caretakerIds: [member.id],
      })

    expect(response.status).toBe(201)
    expect(response.body.pet).toMatchObject({
      householdId: home.householdId,
      name: 'Mochi',
      species: 'Dog',
      breed: 'Shiba Inu',
      birthDate: '2022-03-14',
      weightKg: 11.4,
      sex: 'female',
      caretakers: [{ id: member.id, name: 'Ryuu' }],
      photoUrl: null,
    })
  })

  it('uses the only household when householdId is omitted', async () => {
    const response = await request(app)
      .post('/api/pets')
      .set(as(owner))
      .send({ name: 'Luna', species: 'Cat' })
    expect(response.status).toBe(201)
    expect(response.body.pet.householdId).toBe(home.householdId)
  })

  it('rejects missing and invalid fields with per-field messages', async () => {
    const response = await request(app)
      .post('/api/pets')
      .set(as(owner))
      .send({ name: '', weightKg: -1, sex: 'robot', birthDate: '2999-01-01' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(response.body.error.details.fields).sort()).toEqual(
      ['birthDate', 'name', 'sex', 'species', 'weightKg'].sort(),
    )
  })

  it('rejects caretakers who are not household members', async () => {
    const outsider = (await createHousehold(['Olive'])).members[0]
    const response = await request(app)
      .post('/api/pets')
      .set(as(owner))
      .send({ name: 'Mochi', species: 'Dog', caretakerIds: [outsider.id] })
    expect(response.status).toBe(400)
    expect(response.body.error.details.fields.caretakerIds).toBeDefined()
  })

  it('lists only pets of the household, in the order they were added', async () => {
    await createPet(home.householdId, 'Pudding', 'Rabbit')
    await createPet(home.householdId, 'Mochi')
    const other = await createHousehold(['Olive'])
    await createPet(other.householdId, 'Biscuit')

    const response = await request(app).get('/api/pets').set(as(member))
    expect(response.status).toBe(200)
    expect(response.body.pets.map((pet) => pet.name)).toEqual(['Pudding', 'Mochi'])
  })

  it('updates a pet and replaces its caretakers', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    const response = await request(app)
      .patch(`/api/pets/${pet.id}`)
      .set(as(member))
      .send({ breed: 'Corgi', weightKg: '11.4', caretakerIds: [owner.id, member.id] })

    expect(response.status).toBe(200)
    expect(response.body.pet.breed).toBe('Corgi')
    expect(response.body.pet.weightKg).toBe(11.4)
    expect(response.body.pet.caretakers.map((c) => c.id).sort()).toEqual(
      [owner.id, member.id].sort(),
    )
  })

  it('does not allow clearing the name', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    const response = await request(app).patch(`/api/pets/${pet.id}`).set(as(owner)).send({ name: '' })
    expect(response.status).toBe(400)
  })

  it('removes (archives) a pet but keeps its care history', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    await insertDoneEvent({ pet, user: owner, type: 'walk', minutesAgo: 10 })

    const removed = await request(app).delete(`/api/pets/${pet.id}`).set(as(owner))
    expect(removed.status).toBe(204)

    const list = await request(app).get('/api/pets').set(as(owner))
    expect(list.body.pets).toEqual([])
    const detail = await request(app).get(`/api/pets/${pet.id}`).set(as(owner))
    expect(detail.status).toBe(403)
    const history = await query('SELECT count(*)::int AS n FROM care_events WHERE pet_id = $1', [pet.id])
    expect(history.rows[0].n).toBe(1)
  })

  it('uploads a photo and serves it back', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    const response = await request(app)
      .post(`/api/pets/${pet.id}/photo`)
      .set(as(owner))
      .attach('photo', PNG, { filename: 'mochi.png', contentType: 'image/png' })

    expect(response.status).toBe(200)
    expect(response.body.pet.photoUrl).toMatch(/^\/api\/uploads\/pets\/pet-\d+-[a-f0-9-]{36}\.png$/)
    const image = await request(app).get(response.body.pet.photoUrl).set(as(member))
    expect(image.status).toBe(200)
    expect(image.headers['cache-control']).toBe('private, no-store')
    expect(await sharp(image.body).metadata()).toMatchObject({ format: 'png', width: 1, height: 1 })
    expect(await sharp(image.body).ensureAlpha().raw().toBuffer()).toEqual(await sharp(PNG).ensureAlpha().raw().toBuffer())
  })

  it('protects photos from anonymous users, other households, former members and archived pets', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    const uploaded = await request(app).post(`/api/pets/${pet.id}/photo`).set(as(owner))
      .attach('photo', PNG, { filename: 'mochi.png', contentType: 'image/png' })
    expect(uploaded.status).toBe(200)
    const url = uploaded.body.pet.photoUrl
    const outsider = (await createHousehold(['Outsider'])).members[0]
    expect((await request(app).get(url)).status).toBe(401)
    expect((await request(app).get(url).set(as(outsider))).status).toBe(403)
    expect((await request(app).get(url).set(as(member))).status).toBe(200)
    const leave = await request(app).post(`/api/households/${home.householdId}/leave`)
      .set(as(member)).send({})
    expect(leave.status).toBe(200)
    expect((await request(app).get(url).set(as(member))).status).toBe(403)
    await request(app).delete(`/api/pets/${pet.id}`).set(as(owner))
    expect((await request(app).get(url).set(as(owner))).status).toBe(403)
    expect((await request(app).get('/api/uploads/pets/missing.png').set(as(owner))).status).toBe(403)
  })

  it('rejects files that are not JPG or PNG', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    const response = await request(app)
      .post(`/api/pets/${pet.id}/photo`)
      .set(as(owner))
      .attach('photo', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' })
    expect(response.status).toBe(400)
    const webp = await request(app)
      .post(`/api/pets/${pet.id}/photo`)
      .set(as(owner))
      .attach('photo', PNG, { filename: 'mochi.webp', contentType: 'image/webp' })
    expect(webp.status).toBe(400)
  })

  it('rejects fake and truncated images without replacing the current photo or leaving files', async () => {
    const pet = await createPet(home.householdId, 'Mochi')
    const uploaded = await request(app).post(`/api/pets/${pet.id}/photo`).set(as(owner))
      .attach('photo', PNG, { filename: 'real.png', contentType: 'image/png' })
    expect(uploaded.status).toBe(200)
    const directory = path.join(UPLOAD_DIR, 'pets')
    const existing = (await readdir(directory)).filter(name => name.startsWith(`pet-${pet.id}-`)).sort()
    for (const bytes of [Buffer.from('not an image'), PNG.subarray(0, 40)]) {
      const response = await request(app).post(`/api/pets/${pet.id}/photo`).set(as(owner))
        .attach('photo', bytes, { filename: 'fake.png', contentType: 'image/png' })
      expect(response.status).toBe(400)
    }
    expect((await request(app).get(`/api/pets/${pet.id}`).set(as(owner))).body.pet.photoUrl).toBe(uploaded.body.pet.photoUrl)
    expect((await readdir(directory)).filter(name => name.startsWith(`pet-${pet.id}-`)).sort()).toEqual(existing)
  })

  it('decodes JPEG images and rejects an image whose declared MIME does not match its format', async () => {
    const pet = await createPet(home.householdId)
    const jpeg = await sharp(PNG).jpeg().toBuffer()
    const mismatch = await request(app).post(`/api/pets/${pet.id}/photo`).set(as(owner))
      .attach('photo', jpeg, { filename: 'wrong.png', contentType: 'image/png' })
    expect(mismatch.status).toBe(400)
    const uploaded = await request(app).post(`/api/pets/${pet.id}/photo`).set(as(owner))
      .attach('photo', jpeg, { filename: 'real.jpg', contentType: 'image/jpeg' })
    expect(uploaded.status).toBe(200)
    const image = await request(app).get(uploaded.body.pet.photoUrl).set(as(owner))
    expect(await sharp(image.body).metadata()).toMatchObject({ format: 'jpeg', width: 1, height: 1 })
  })
})

describe('AC-02 household isolation for pets', () => {
  it('returns 403 and exposes nothing for a pet of another household', async () => {
    const other = await createHousehold(['Olive'])
    const secretPet = await createPet(other.householdId, 'Biscuit')

    const response = await request(app).get(`/api/pets/${secretPet.id}`).set(as(owner))
    expect(response.status).toBe(403)
    expect(JSON.stringify(response.body)).not.toContain('Biscuit')
  })

  it('returns 403 when editing, removing or uploading to another household pet', async () => {
    const other = await createHousehold(['Olive'])
    const secretPet = await createPet(other.householdId, 'Biscuit')

    const edit = await request(app).patch(`/api/pets/${secretPet.id}`).set(as(owner)).send({ name: 'X' })
    const remove = await request(app).delete(`/api/pets/${secretPet.id}`).set(as(owner))
    const photo = await request(app)
      .post(`/api/pets/${secretPet.id}/photo`)
      .set(as(owner))
      .attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' })
    expect([edit.status, remove.status, photo.status]).toEqual([403, 403, 403])
  })

  it('answers a missing pet exactly like another household pet (no existence leak)', async () => {
    const response = await request(app).get('/api/pets/999999999').set(as(owner))
    expect(response.status).toBe(403)
    expect(response.body.error.message).toBe('Pet access denied.')
    const invalid = await request(app).get('/api/pets/abc').set(as(owner))
    expect(invalid.status).toBe(400)
  })

  it('requires an authenticated user', async () => {
    const response = await request(app).get('/api/pets')
    expect(response.status).toBe(401)
  })
})
