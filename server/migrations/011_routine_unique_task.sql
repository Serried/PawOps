DELETE FROM care_events duplicate
 USING care_events keep
 WHERE duplicate.routine_id IS NOT NULL
   AND duplicate.routine_id = keep.routine_id
   AND duplicate.scheduled_at = keep.scheduled_at
   AND duplicate.id > keep.id
   AND duplicate.status = 'upcoming';

CREATE UNIQUE INDEX IF NOT EXISTS care_events_routine_occurrence_idx
  ON care_events (routine_id, scheduled_at)
  WHERE routine_id IS NOT NULL;
