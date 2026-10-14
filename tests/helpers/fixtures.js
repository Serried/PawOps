// Test data; everything created here is removed after each test file
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { query } from '../../server/db.js'

const created = { users: [], households: [], pets: [] }

export function as(user) {
  return { Cookie: `pawops_session=${user.sessionToken}` }
}

export async function createUser(name = 'Member') {
  const result = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, 'test-only', $2) RETURNING id`,
    [`${name.toLowerCase()}-${randomUUID()}@test.pawops`, name],
  )
  const sessionToken = randomBytes(32).toString('hex')
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [createHash('sha256').update(sessionToken).digest('hex'), result.rows[0].id],
  )
  const user = { id: Number(result.rows[0].id), name, sessionToken }
  created.users.push(user.id)
  return user
}

export async function createHousehold(memberNames = ['Tanakrit', 'Ryuu']) {
  // Household names must be unique (migration 005)
  const result = await query('INSERT INTO households (name) VALUES ($1) RETURNING id', [
    `Test home ${randomUUID()}`,
  ])
  const householdId = Number(result.rows[0].id)
  created.households.push(householdId)
  const members = []
  for (const [index, name] of memberNames.entries()) {
    const user = await createUser(name)
    await query(
      'INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3)',
      [householdId, user.id, index === 0 ? 'owner' : 'member'],
    )
    members.push(user)
  }
  return { householdId, members }
}

export async function createPet(householdId, name = 'Mochi', species = 'Dog') {
  const result = await query(
    'INSERT INTO pets (household_id, name, species) VALUES ($1, $2, $3) RETURNING id',
    [householdId, name, species],
  )
  const pet = { id: Number(result.rows[0].id), name, householdId }
  created.pets.push(pet.id)
  return pet
}

export async function insertDoneEvent({ pet, user, type = 'feeding', minutesAgo = 5 }) {
  const result = await query(
    `INSERT INTO care_events
       (pet_id, type, title, scheduled_at, status, completed_at, completed_by, created_by)
     VALUES ($1, $2, 'Earlier', NOW() - make_interval(mins => $3), 'done',
             NOW() - make_interval(mins => $3), $4, $4)
     RETURNING id`,
    [pet.id, type, minutesAgo, user.id],
  )
  return Number(result.rows[0].id)
}

export async function cleanupFixtures() {
  const petIds = created.pets
  if (petIds.length > 0) {
    await query('DELETE FROM care_events WHERE pet_id = ANY($1::bigint[])', [petIds])
  }
  if (created.households.length > 0) {
    await query(
      `DELETE FROM care_events WHERE pet_id IN
         (SELECT id FROM pets WHERE household_id = ANY($1::bigint[]))`,
      [created.households],
    )
    await query('DELETE FROM pets WHERE household_id = ANY($1::bigint[])', [created.households])
    await query('DELETE FROM households WHERE id = ANY($1::bigint[])', [created.households])
  }
  if (created.users.length > 0) {
    await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [created.users])
  }
  created.users = []
  created.households = []
  created.pets = []
}
