import { query } from '../db.js'
import { badRequest, forbidden } from '../lib/http-error.js'

export async function listUserHouseholdIds(userId, db = { query }) {
  const result = await db.query(
    'SELECT household_id FROM household_members WHERE user_id = $1 ORDER BY household_id',
    [userId],
  )
  return result.rows.map((row) => Number(row.household_id))
}

export async function isHouseholdMember(userId, householdId, db = { query }) {
  const result = await db.query(
    'SELECT 1 FROM household_members WHERE user_id = $1 AND household_id = $2',
    [userId, householdId],
  )
  return result.rowCount > 0
}

export async function assertHouseholdMember(userId, householdId, db = { query }) {
  if (!(await isHouseholdMember(userId, householdId, db))) throw forbidden()
}

export async function resolveHouseholdId(userId, requestedId, db = { query }) {
  if (requestedId) {
    await assertHouseholdMember(userId, requestedId, db)
    return requestedId
  }
  const ids = await listUserHouseholdIds(userId, db)
  if (ids.length === 1) return ids[0]
  if (ids.length === 0) throw badRequest('Create or join a household first')
  throw badRequest('householdId is required when you belong to several households', {
    fields: { householdId: 'is required' },
  })
}

// Missing, archived and other-household pets all get the same 403 (no existence leak).
// lock=true locks the pet row so care actions on one pet run one at a time.
export async function loadAccessiblePet(petId, userId, { db = { query }, lock = false } = {}) {
  const result = await db.query(
    `SELECT id, household_id, name
       FROM pets
      WHERE id = $1 AND archived_at IS NULL
      ${lock ? 'FOR UPDATE' : ''}`,
    [petId],
  )
  const pet = result.rows[0]
  if (!pet || pet.household_id === null) throw forbidden('Pet access denied.')
  if (!(await isHouseholdMember(userId, pet.household_id, db))) {
    throw forbidden('Pet access denied.')
  }
  return { id: Number(pet.id), householdId: Number(pet.household_id), name: pet.name }
}

export async function assertAllMembers(householdId, userIds, field, db = { query }) {
  if (userIds.length === 0) return
  const result = await db.query(
    `SELECT user_id FROM household_members
      WHERE household_id = $1 AND user_id = ANY($2::bigint[])`,
    [householdId, userIds],
  )
  if (result.rowCount !== userIds.length) {
    throw badRequest('Only members of this household can be selected', {
      fields: { [field]: 'contains someone who is not a household member' },
    })
  }
}
