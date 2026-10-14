import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from '../config.js'
import { query } from '../db.js'
import { withTransaction } from '../lib/transaction.js'
import { userNameSql } from '../lib/user-name.js'
import {
  assertAllMembers,
  listUserHouseholdIds,
  loadAccessiblePet,
  resolveHouseholdId,
} from './access.js'

const PET_SELECT = `
  SELECT p.id, p.household_id, p.name, p.species, p.breed,
         to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date,
         p.weight_kg::float8 AS weight_kg, p.sex, p.health_notes, p.photo_path,
         p.created_at, p.updated_at,
         COALESCE((
           SELECT json_agg(json_build_object('id', u.id, 'name', ${userNameSql('u')})
                           ORDER BY ${userNameSql('u')})
             FROM pet_caretakers pc
             JOIN users u ON u.id = pc.user_id
             -- current members only
             JOIN household_members hm
               ON hm.user_id = pc.user_id AND hm.household_id = p.household_id
            WHERE pc.pet_id = p.id
         ), '[]'::json) AS caretakers
    FROM pets p`

export function photoUrl(photoPath) {
  return photoPath ? `/api/uploads/${photoPath}` : null
}

function serializePet(row) {
  return {
    id: Number(row.id),
    householdId: Number(row.household_id),
    name: row.name,
    species: row.species,
    breed: row.breed,
    birthDate: row.birth_date,
    weightKg: row.weight_kg,
    sex: row.sex,
    healthNotes: row.health_notes,
    photoUrl: photoUrl(row.photo_path),
    caretakers: row.caretakers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const WRITABLE = {
  name: 'name',
  species: 'species',
  breed: 'breed',
  birthDate: 'birth_date',
  weightKg: 'weight_kg',
  sex: 'sex',
  healthNotes: 'health_notes',
}

async function fetchPet(petId, db = { query }) {
  const result = await db.query(`${PET_SELECT} WHERE p.id = $1`, [petId])
  return serializePet(result.rows[0])
}

async function replaceCaretakers(client, petId, householdId, userIds) {
  await assertAllMembers(householdId, userIds, 'caretakerIds', client)
  await client.query('DELETE FROM pet_caretakers WHERE pet_id = $1', [petId])
  if (userIds.length > 0) {
    await client.query(
      `INSERT INTO pet_caretakers (pet_id, user_id)
       SELECT $1, unnest($2::bigint[])`,
      [petId, userIds],
    )
  }
}

export async function listPets(userId, householdId) {
  const householdIds = householdId ? [householdId] : await listUserHouseholdIds(userId)
  const result = await query(
    `${PET_SELECT}
      WHERE p.household_id = ANY($1::bigint[])
        AND p.archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM household_members m
           WHERE m.household_id = p.household_id AND m.user_id = $2
        )
      ORDER BY p.id`,
    [householdIds, userId],
  )
  return result.rows.map(serializePet)
}

export async function getPet(petId, userId) {
  await loadAccessiblePet(petId, userId)
  return fetchPet(petId)
}

export async function createPet(userId, values) {
  return withTransaction(async (client) => {
    const householdId = await resolveHouseholdId(userId, values.householdId, client)
    const columns = ['household_id']
    const params = [householdId]
    for (const [key, column] of Object.entries(WRITABLE)) {
      if (values[key] !== undefined) {
        columns.push(column)
        params.push(values[key])
      }
    }
    const placeholders = params.map((_, index) => `$${index + 1}`).join(', ')
    const inserted = await client.query(
      `INSERT INTO pets (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      params,
    )
    const petId = Number(inserted.rows[0].id)
    if (values.caretakerIds) {
      await replaceCaretakers(client, petId, householdId, values.caretakerIds)
    }
    return fetchPet(petId, client)
  })
}

export async function updatePet(petId, userId, values) {
  return withTransaction(async (client) => {
    const pet = await loadAccessiblePet(petId, userId, { db: client, lock: true })
    const sets = []
    const params = []
    for (const [key, column] of Object.entries(WRITABLE)) {
      if (values[key] !== undefined) {
        params.push(values[key])
        sets.push(`${column} = $${params.length}`)
      }
    }
    if (sets.length > 0) {
      params.push(petId)
      await client.query(
        `UPDATE pets SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params,
      )
    }
    if (values.caretakerIds) {
      await replaceCaretakers(client, petId, pet.householdId, values.caretakerIds)
    }
    return fetchPet(petId, client)
  })
}

// Archived, not deleted, so care history is kept
export async function archivePet(petId, userId) {
  await withTransaction(async (client) => {
    await loadAccessiblePet(petId, userId, { db: client, lock: true })
    await client.query(
      'UPDATE pets SET archived_at = NOW(), updated_at = NOW() WHERE id = $1',
      [petId],
    )
  })
}

export async function setPhoto(petId, userId, storedPath) {
  const previous = await withTransaction(async (client) => {
    await loadAccessiblePet(petId, userId, { db: client, lock: true })
    const before = await client.query('SELECT photo_path FROM pets WHERE id = $1', [petId])
    await client.query(
      'UPDATE pets SET photo_path = $1, updated_at = NOW() WHERE id = $2',
      [storedPath, petId],
    )
    return before.rows[0].photo_path
  })
  if (previous && previous !== storedPath) {
    await unlink(path.join(UPLOAD_DIR, previous)).catch(() => {})
  }
  return fetchPet(petId)
}
