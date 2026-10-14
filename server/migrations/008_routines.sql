CREATE TABLE IF NOT EXISTS care_routines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pet_id BIGINT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('feeding','water','walk','medication','vet_visit','grooming')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  time_of_day TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(days_of_week) > 0),
  CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6])
);
ALTER TABLE care_events
  ADD CONSTRAINT care_events_routine_id_fkey
  FOREIGN KEY (routine_id) REFERENCES care_routines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS care_routines_pet_active_idx ON care_routines(pet_id, active);
