import { Router } from 'express'
import { APP_TIMEZONE, DUPLICATE_CHECK_TYPES, DUPLICATE_WINDOW_MINUTES, OVERDUE_GRACE_MINUTES } from '../config.js'
import { query } from '../db.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { withTransaction } from '../lib/transaction.js'
import { userNameSql } from '../lib/user-name.js'
import { paramId, toId, Validator } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { assertAllMembers, assertHouseholdMember, listUserHouseholdIds, loadAccessiblePet } from '../services/access.js'
import { generateRoutineTasks } from '../services/routine-tasks.js'

const TYPES = ['feeding', 'water', 'walk', 'medication', 'vet_visit', 'grooming']
const DEFAULT_TITLES = {
  feeding: 'Feeding',
  water: 'Fresh water',
  walk: 'Walk',
  medication: 'Medication',
  vet_visit: 'Vet visit',
  grooming: 'Grooming',
}

// YYYY-MM-DD in the app timezone (toISOString() would give the UTC date)
function todayInAppZone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function routineValues(body) {
  const values = new Validator(body)
    .id('petId', { required: true })
    .oneOf('type', TYPES, { required: true })
    .string('title', { max: 80 })
    .string('time', { required: true, max: 5 })
    .id('assignedToId')
    .result()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) {
    throw badRequest('time must use HH:MM format')
  }
  const days = body.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]
  if (
    !Array.isArray(days) ||
    !days.length ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw badRequest('daysOfWeek must contain days from 0 (Sunday) to 6 (Saturday)')
  }
  if (body.startDate !== undefined && body.startDate !== null && body.startDate !== '') {
    const valid =
      typeof body.startDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) &&
      !Number.isNaN(new Date(`${body.startDate}T00:00:00Z`).getTime()) &&
      new Date(`${body.startDate}T00:00:00Z`).toISOString().slice(0, 10) === body.startDate
    if (!valid) throw badRequest('startDate must be a date in YYYY-MM-DD format')
  }
  values.title = values.title ?? DEFAULT_TITLES[values.type]
  values.startDate = body.startDate || todayInAppZone()
  values.daysOfWeek = [...new Set(days)].sort()
  return values
}

export const routinesRouter = Router()
routinesRouter.use(requireAuth)

routinesRouter.get('/', async (req, res) => {
  const householdId = req.query.householdId === undefined ? null : toId(req.query.householdId)
  if (req.query.householdId !== undefined && householdId === null) {
    throw badRequest('householdId must be a positive integer id')
  }
  if (householdId) await assertHouseholdMember(req.user.id, householdId)
  const householdIds = householdId ? [householdId] : await listUserHouseholdIds(req.user.id)
  if (householdIds.length) await generateRoutineTasks({ householdIds })
  const result = await query(
    `SELECT r.id, r.pet_id, p.name AS pet_name, r.type, r.title,
            to_char(r.time_of_day, 'HH24:MI') AS time, r.days_of_week,
            r.active, to_char(r.start_date, 'YYYY-MM-DD') AS start_date, r.assigned_to,
            next_due.at AS next_scheduled_at,
            CASE WHEN NOT r.active THEN 'paused'
                 WHEN today.status = 'done' THEN 'done'
                 WHEN today.scheduled_at + make_interval(mins => $4::int) < NOW() THEN 'overdue'
                 ELSE 'upcoming' END AS status,
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id',u.id,'name',${userNameSql('u')}) END AS assignee
       FROM care_routines r JOIN pets p ON p.id=r.pet_id
       LEFT JOIN users u ON u.id=r.assigned_to
       LEFT JOIN LATERAL (
         SELECT e.status, e.scheduled_at FROM care_events e
          WHERE e.routine_id = r.id
            AND (e.scheduled_at AT TIME ZONE $3::text)::date = (NOW() AT TIME ZONE $3::text)::date
          ORDER BY e.scheduled_at DESC LIMIT 1
       ) today ON TRUE
       LEFT JOIN LATERAL (
         SELECT ((base.day + offset_day + r.time_of_day) AT TIME ZONE $3::text) AS at
           FROM (SELECT GREATEST((NOW() AT TIME ZONE $3::text)::date, r.start_date,
                     (r.effective_from AT TIME ZONE $3::text)::date) AS day) base
          CROSS JOIN generate_series(0, 7) offset_day
          WHERE r.active
            AND EXTRACT(DOW FROM base.day + offset_day)::int = ANY(r.days_of_week)
            AND ((base.day + offset_day + r.time_of_day) AT TIME ZONE $3::text) >= GREATEST(NOW(), r.effective_from)
            AND NOT EXISTS (SELECT 1 FROM care_events e WHERE e.routine_id = r.id
              AND e.scheduled_at = ((base.day + offset_day + r.time_of_day) AT TIME ZONE $3::text)
              AND e.status = 'done')
          ORDER BY at LIMIT 1
       ) next_due ON TRUE
      WHERE p.household_id IN (SELECT household_id FROM household_members WHERE user_id=$1)
        AND p.archived_at IS NULL AND ($2::bigint IS NULL OR p.household_id=$2) ORDER BY p.name, r.time_of_day`,
    [req.user.id, householdId, APP_TIMEZONE, OVERDUE_GRACE_MINUTES],
  )
  res.json({
    routines: result.rows.map((r) => ({
      id: Number(r.id),
      petId: Number(r.pet_id),
      petName: r.pet_name,
      type: r.type,
      title: r.title,
      time: r.time,
      daysOfWeek: r.days_of_week,
      active: r.active,
      status: r.status,
      nextScheduledAt: r.next_scheduled_at,
      timeZone: APP_TIMEZONE,
      graceMinutes: OVERDUE_GRACE_MINUTES,
      duplicateWindowMinutes: DUPLICATE_CHECK_TYPES.includes(r.type) ? DUPLICATE_WINDOW_MINUTES : null,
      startDate: r.start_date,
      assignedTo: r.assignee,
    })),
  })
})

routinesRouter.post('/', async (req, res) => {
  const v = routineValues(req.body)
  const pet = await loadAccessiblePet(v.petId, req.user.id)
  if (v.assignedToId) await assertAllMembers(pet.householdId, [v.assignedToId], 'assignedToId')
  const result = await query(
    `INSERT INTO care_routines (pet_id,type,title,time_of_day,days_of_week,assigned_to,created_by,start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [pet.id, v.type, v.title, v.time, v.daysOfWeek, v.assignedToId ?? null, req.user.id, v.startDate],
  )
  res.status(201).json({
    routine: { id: Number(result.rows[0].id), petId: pet.id, petName: pet.name, ...v, active: true },
  })
})

routinesRouter.patch('/:routineId', async (req, res) => {
  const id = paramId(req.params.routineId, 'Routine')

  // Pause / resume
  if (typeof req.body.active === 'boolean' && Object.keys(req.body).length === 1) {
    const { active } = req.body
    const routine = await withTransaction(async (client) => {
      // Resuming starts a fresh schedule from now (nothing is generated for the paused time)
      const result = await client.query(
        `UPDATE care_routines r
            SET active = $2,
                effective_from = CASE WHEN $2::boolean AND NOT r.active THEN NOW() ELSE r.effective_from END
           FROM pets p
          WHERE r.pet_id = p.id AND r.id = $1
            AND p.archived_at IS NULL
            AND p.household_id IN (SELECT household_id FROM household_members WHERE user_id = $3)
          RETURNING r.id, r.active`,
        [id, active, req.user.id],
      )
      if (!result.rowCount) throw notFound('Routine not found')
      // A paused routine must not keep unfinished tasks (they would turn into alerts)
      if (!active) {
        await client.query(
          "DELETE FROM care_events WHERE routine_id = $1 AND status = 'upcoming'",
          [id],
        )
      }
      return { id: Number(result.rows[0].id), active: result.rows[0].active }
    })
    return res.json({ routine })
  }

  const v = routineValues(req.body)
  const pet = await loadAccessiblePet(v.petId, req.user.id)
  if (v.assignedToId) await assertAllMembers(pet.householdId, [v.assignedToId], 'assignedToId')
  await withTransaction(async (client) => {
    // A new time, weekday set or start date takes effect from now
    const result = await client.query(
      `UPDATE care_routines r
          SET pet_id=$2, type=$3, title=$4, time_of_day=$5, days_of_week=$6, assigned_to=$7, start_date=$9,
              effective_from = CASE
                WHEN r.time_of_day IS DISTINCT FROM $5::time
                  OR r.days_of_week IS DISTINCT FROM $6::int[]
                  OR r.start_date IS DISTINCT FROM $9::date THEN NOW()
                ELSE r.effective_from END
        WHERE r.id=$1 AND EXISTS (
          SELECT 1 FROM pets p WHERE p.id=r.pet_id
          AND p.household_id IN (SELECT household_id FROM household_members WHERE user_id=$8)
        ) RETURNING r.id`,
      [id, pet.id, v.type, v.title, v.time, v.daysOfWeek, v.assignedToId ?? null, req.user.id, v.startDate],
    )
    if (!result.rowCount) throw notFound('Routine not found')
    // Tasks that are not due yet were made from the old settings; they are created again
    // from the new ones the next time care events are listed. Tasks already due stay.
    await client.query(
      `DELETE FROM care_events
        WHERE routine_id = $1 AND status = 'upcoming' AND scheduled_at > NOW()`,
      [id],
    )
  })
  res.json({ routine: { id, petId: pet.id, petName: pet.name, ...v } })
})

routinesRouter.delete('/:routineId', async (req, res) => {
  const id = paramId(req.params.routineId, 'Routine')
  await withTransaction(async (client) => {
    const found = await client.query(
      `SELECT r.id FROM care_routines r JOIN pets p ON p.id = r.pet_id
        WHERE r.id = $1
          AND p.household_id IN (SELECT household_id FROM household_members WHERE user_id = $2)
        FOR UPDATE OF r`,
      [id, req.user.id],
    )
    if (!found.rowCount) throw notFound('Routine not found')
    // Finished tasks stay in the history; unfinished ones would become orphan alerts
    await client.query("DELETE FROM care_events WHERE routine_id = $1 AND status = 'upcoming'", [id])
    await client.query('DELETE FROM care_routines WHERE id = $1', [id])
  })
  res.status(204).end()
})
