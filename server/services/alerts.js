import { APP_TIMEZONE, OVERDUE_GRACE_MINUTES } from '../config.js'
import { query } from '../db.js'
import { forbidden } from '../lib/http-error.js'
import { userNameSql } from '../lib/user-name.js'
import { assertHouseholdMember, listUserHouseholdIds } from './access.js'
import { generateRoutineTasks } from './routine-tasks.js'

export async function evaluateOverdueAlerts({ householdIds = null, db = { query } } = {}) {
  await generateRoutineTasks({ householdIds, db })
  const result = await db.query(
    `INSERT INTO alerts (household_id, pet_id, care_event_id, routine_id, type, message)
     SELECT p.household_id, e.pet_id, e.id, e.routine_id, 'overdue',
            format('%s for %s was due at %s and has not been done yet',
                   e.title, p.name, to_char(e.scheduled_at AT TIME ZONE $3::text, 'HH24:MI'))
       FROM care_events e
       LEFT JOIN care_routines r ON r.id = e.routine_id
       JOIN pets p ON p.id = e.pet_id AND p.archived_at IS NULL
      WHERE e.status = 'upcoming'
        AND (e.routine_id IS NULL OR r.active)
        AND e.scheduled_at + make_interval(mins => $1::int) < clock_timestamp()
        AND ($2::bigint[] IS NULL OR p.household_id = ANY($2::bigint[]))
     ON CONFLICT (care_event_id, type) DO NOTHING
     RETURNING id`,
    [OVERDUE_GRACE_MINUTES, householdIds, APP_TIMEZONE],
  )
  return result.rowCount
}

const ALERT_SELECT = `
  SELECT al.id, al.household_id, al.pet_id, p.name AS pet_name, al.type, al.message,
         al.created_at, al.acknowledged_at, al.routine_id,
         e.id AS event_id, e.title AS event_title, e.type AS event_type,
         e.scheduled_at AS event_scheduled_at, e.status AS event_status,
         e.completed_at AS event_completed_at,
         CASE WHEN c.id IS NULL THEN NULL ELSE ${userNameSql('c')} END AS event_completed_by
    FROM alerts al
    JOIN pets p ON p.id = al.pet_id
    JOIN care_events e ON e.id = al.care_event_id
    LEFT JOIN users c ON c.id = e.completed_by`

function serializeAlert(row) {
  const status =
    row.event_status === 'done' ? 'resolved' : row.acknowledged_at ? 'acknowledged' : 'active'
  return {
    id: Number(row.id),
    householdId: Number(row.household_id),
    petId: Number(row.pet_id),
    petName: row.pet_name,
    type: row.type,
    message: row.message,
    routineId: row.routine_id === null ? null : Number(row.routine_id),
    careEvent: {
      id: Number(row.event_id),
      type: row.event_type,
      title: row.event_title,
      scheduledAt: row.event_scheduled_at,
      status: row.event_status,
      completedAt: row.event_completed_at,
      completedBy: row.event_completed_by,
    },
    status,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
  }
}

export async function listAlerts(user, { householdId, status = 'all', limit = 100 } = {}) {
  if (householdId) await assertHouseholdMember(user.id, householdId)
  const householdIds = householdId ? [householdId] : await listUserHouseholdIds(user.id)

  const where = ['al.household_id = ANY($1::bigint[])', 'p.archived_at IS NULL']
  if (status === 'active') where.push(`e.status = 'upcoming' AND al.acknowledged_at IS NULL`)
  const result = await query(
    `${ALERT_SELECT}
      WHERE ${where.join(' AND ')}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT $2`,
    [householdIds, limit],
  )
  return result.rows.map(serializeAlert)
}

export async function acknowledgeAlert(user, alertId) {
  const found = await query('SELECT household_id FROM alerts WHERE id = $1', [alertId])
  if (found.rowCount === 0) throw forbidden('Alert access denied.')
  await assertHouseholdMember(user.id, Number(found.rows[0].household_id)).catch((error) => {
    throw error.status === 403 ? forbidden('Alert access denied.') : error
  })
  await query(
    `UPDATE alerts
        SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
            acknowledged_by = COALESCE(acknowledged_by, $2)
      WHERE id = $1`,
    [alertId, user.id],
  )
  const result = await query(`${ALERT_SELECT} WHERE al.id = $1`, [alertId])
  return serializeAlert(result.rows[0])
}
