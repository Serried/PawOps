import { APP_TIMEZONE } from '../config.js'
import { query } from '../db.js'

export async function generateRoutineTasks({ householdIds = null, db = { query } } = {}) {
  const result = await db.query(
    `WITH eligible AS MATERIALIZED (
       SELECT r.* FROM care_routines r JOIN pets p ON p.id = r.pet_id
        WHERE r.active AND p.archived_at IS NULL
          AND ($1::bigint[] IS NULL OR p.household_id = ANY($1::bigint[]))
        FOR SHARE OF r
     )
     INSERT INTO care_events
       (pet_id, type, title, scheduled_at, assigned_to, routine_id, created_by)
     SELECT r.pet_id, r.type, r.title, due.at, r.assigned_to, r.id, r.created_by
       FROM eligible r
       JOIN pets p ON p.id = r.pet_id
      CROSS JOIN LATERAL generate_series(
        GREATEST(r.start_date, (r.effective_from AT TIME ZONE $2::text)::date)::timestamp,
        (NOW() AT TIME ZONE $2::text)::date::timestamp,
        INTERVAL '1 day'
      ) days(day)
      CROSS JOIN LATERAL (
        SELECT days.day::date AS day,
               ((days.day::date + r.time_of_day) AT TIME ZONE $2::text) AS at
      ) due
      WHERE r.active = TRUE
        AND p.archived_at IS NULL
        AND ($1::bigint[] IS NULL OR p.household_id = ANY($1::bigint[]))
        AND due.day >= r.start_date
        AND due.at >= r.effective_from
        AND EXTRACT(DOW FROM due.day)::integer = ANY(r.days_of_week)
     ON CONFLICT (routine_id, scheduled_at) WHERE routine_id IS NOT NULL DO NOTHING`,
    [householdIds, APP_TIMEZONE],
  )
  return result.rowCount
}
