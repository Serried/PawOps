import { OVERDUE_GRACE_MINUTES } from '../config.js'
import { query } from '../db.js'
import { conflict, forbidden, notFound } from '../lib/http-error.js'
import { withTransaction } from '../lib/transaction.js'
import { userNameSql } from '../lib/user-name.js'
import {
  assertAllMembers,
  assertHouseholdMember,
  listUserHouseholdIds,
  loadAccessiblePet,
} from './access.js'
import {
  displayStatus,
  duplicateWarningMessage,
  duplicateWindowMinutes,
  needsDuplicateCheck,
} from './care-rules.js'

const EVENT_SELECT = `
  SELECT e.id, e.pet_id, p.name AS pet_name, p.household_id, e.type, e.title, e.note,
         e.scheduled_at, e.status, e.completed_at, e.duplicate_override, e.routine_id,
         e.created_at, e.updated_at,
         CASE WHEN a.id IS NULL THEN NULL
              ELSE json_build_object('id', a.id, 'name', ${userNameSql('a')}) END AS assigned_to,
         CASE WHEN c.id IS NULL THEN NULL
              ELSE json_build_object('id', c.id, 'name', ${userNameSql('c')}) END AS completed_by,
         json_build_object('id', cr.id, 'name', ${userNameSql('cr')}) AS created_by
    FROM care_events e
    JOIN pets p ON p.id = e.pet_id
    JOIN users cr ON cr.id = e.created_by
    LEFT JOIN users a ON a.id = e.assigned_to
    LEFT JOIN users c ON c.id = e.completed_by`

function serializeEvent(row, now = new Date()) {
  const event = {
    id: Number(row.id),
    petId: Number(row.pet_id),
    petName: row.pet_name,
    householdId: Number(row.household_id),
    type: row.type,
    title: row.title,
    note: row.note,
    scheduledAt: row.scheduled_at,
    status: row.status,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    duplicateOverride: row.duplicate_override,
    routineId: row.routine_id === null ? null : Number(row.routine_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  event.status = displayStatus(event, now)
  return event
}

async function fetchEvent(eventId, db = { query }) {
  const result = await db.query(`${EVENT_SELECT} WHERE e.id = $1`, [eventId])
  if (result.rowCount === 0) throw notFound('Care event not found')
  return serializeEvent(result.rows[0])
}

// BR-03. Caller must hold the pet row lock.
// clock_timestamp(): now() is frozen at the start of the transaction.
async function guardDuplicate(client, { pet, type, excludeEventId = null, override }) {
  if (!needsDuplicateCheck(type)) return { duplicate: null }

  const windowMinutes = duplicateWindowMinutes({ petId: pet.id, type })
  const result = await client.query(
    `SELECT e.id, e.title, e.completed_at, u.id AS user_id, ${userNameSql('u')} AS user_name,
            clock_timestamp() AS checked_at
       FROM care_events e
       JOIN users u ON u.id = e.completed_by
      WHERE e.pet_id = $1
        AND e.type = $2
        AND e.status = 'done'
        AND e.id <> COALESCE($3::bigint, 0)
        AND e.completed_at > clock_timestamp() - make_interval(mins => $4)
      ORDER BY e.completed_at DESC
      LIMIT 1`,
    [pet.id, type, excludeEventId, windowMinutes],
  )
  if (result.rowCount === 0) return { duplicate: null }

  const row = result.rows[0]
  const previous = {
    id: Number(row.id),
    title: row.title,
    completedAt: row.completed_at,
    completedBy: { id: Number(row.user_id), name: row.user_name },
  }
  if (!override) {
    throw conflict(
      'DUPLICATE_CARE',
      duplicateWarningMessage({
        type,
        petName: pet.name,
        completedAt: row.completed_at,
        completedByName: row.user_name,
        now: row.checked_at,
      }),
      { petId: pet.id, type, windowMinutes, previous },
    )
  }
  if (process.env.NODE_ENV !== 'test') {
    console.info(
      `[care] duplicate override pet=${pet.id} type=${type} previousEvent=${previous.id}`,
    )
  }
  return { duplicate: previous }
}

export async function createCareEvent(user, petId, values) {
  return withTransaction(async (client) => {
    const pet = await loadAccessiblePet(petId, user.id, { db: client })
    if (values.assignedToId) {
      await assertAllMembers(pet.householdId, [values.assignedToId], 'assignedToId', client)
    }
    const inserted = await client.query(
      `INSERT INTO care_events (pet_id, type, title, note, scheduled_at, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        pet.id,
        values.type,
        values.title,
        values.note ?? null,
        values.scheduledAt,
        values.assignedToId ?? null,
        user.id,
      ],
    )
    return fetchEvent(Number(inserted.rows[0].id), client)
  })
}

export async function completeCareEvent(user, eventId, { override }) {
  return withTransaction(async (client) => {
    const found = await client.query('SELECT pet_id FROM care_events WHERE id = $1', [eventId])
    if (found.rowCount === 0) throw forbidden('Care event access denied.')
    const pet = await loadAccessiblePet(Number(found.rows[0].pet_id), user.id, {
      db: client,
      lock: true,
    })

    const current = await client.query(
      `SELECT e.type, e.status, e.completed_at, ${userNameSql('u')} AS completed_by_name
         FROM care_events e
         LEFT JOIN users u ON u.id = e.completed_by
        WHERE e.id = $1
        FOR UPDATE OF e`,
      [eventId],
    )
    const event = current.rows[0]
    if (event.status === 'done') {
      throw conflict('ALREADY_DONE', `This task was already completed by ${event.completed_by_name}`, {
        completedAt: event.completed_at,
      })
    }

    const { duplicate } = await guardDuplicate(client, {
      pet,
      type: event.type,
      excludeEventId: eventId,
      override,
    })

    await client.query(
      `UPDATE care_events
          SET status = 'done', completed_at = clock_timestamp(), completed_by = $2,
              duplicate_override = $3, updated_at = NOW()
        WHERE id = $1`,
      [eventId, user.id, Boolean(duplicate)],
    )
    return fetchEvent(eventId, client)
  })
}

const STATUS_FILTERS = {
  done: `e.status = 'done'`,
  open: `e.status = 'upcoming'`,
  upcoming: `e.status = 'upcoming' AND e.scheduled_at >= NOW() - make_interval(mins => $GRACE)`,
  overdue: `e.status = 'upcoming' AND e.scheduled_at < NOW() - make_interval(mins => $GRACE)`,
}

export const EVENT_STATUS_FILTERS = Object.keys(STATUS_FILTERS)

export async function listCareEvents(user, { householdId, petId, status, from, to, limit }) {
  if (petId) {
    await loadAccessiblePet(petId, user.id)
  } else if (householdId) {
    await assertHouseholdMember(user.id, householdId)
  }
  const householdIds = householdId ? [householdId] : await listUserHouseholdIds(user.id)

  const params = [householdIds, user.id]
  const where = [
    'p.household_id = ANY($1::bigint[])',
    'p.archived_at IS NULL',
    `EXISTS (SELECT 1 FROM household_members m
              WHERE m.household_id = p.household_id AND m.user_id = $2)`,
  ]
  if (petId) {
    params.push(petId)
    where.push(`e.pet_id = $${params.length}`)
  }
  if (status) {
    let filter = STATUS_FILTERS[status]
    // Bind only if used: PostgreSQL rejects untyped unused parameters
    if (filter.includes('$GRACE')) {
      params.push(OVERDUE_GRACE_MINUTES)
      const placeholder = `$${params.length}`
      filter = filter.replaceAll('$GRACE', () => placeholder)
    }
    where.push(filter)
  }
  if (from) {
    params.push(from)
    where.push(`COALESCE(e.completed_at, e.scheduled_at) >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    where.push(`COALESCE(e.completed_at, e.scheduled_at) < $${params.length}`)
  }
  params.push(limit)

  const orderBy =
    status === 'done'
      ? 'e.completed_at DESC, e.id DESC'
      : status
        ? 'e.scheduled_at ASC, e.id ASC'
        : 'COALESCE(e.completed_at, e.scheduled_at) DESC, e.id DESC'

  const result = await query(
    `${EVENT_SELECT}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${params.length}`,
    params,
  )
  const now = new Date()
  return result.rows.map((row) => serializeEvent(row, now))
}
