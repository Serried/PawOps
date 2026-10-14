-- Pet & Care (Member 2). Builds on Member 1's migrations 002-005.

-- household_id comes from 004 (legacy rows may be NULL)
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS breed TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS sex TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_notes TEXT,
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  -- "Remove pet" archives, so care history is kept
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE pets
  ADD CONSTRAINT pets_name_not_blank CHECK (length(trim(name)) > 0),
  ADD CONSTRAINT pets_species_not_blank CHECK (length(trim(species)) > 0),
  ADD CONSTRAINT pets_sex_valid CHECK (sex IN ('male', 'female', 'unknown')),
  ADD CONSTRAINT pets_weight_positive CHECK (weight_kg IS NULL OR weight_kg > 0);

CREATE INDEX IF NOT EXISTS pets_household_active_idx
  ON pets (household_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS pet_caretakers (
  pet_id BIGINT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pet_id, user_id)
);

-- "overdue" is derived from scheduled_at, not stored
CREATE TABLE IF NOT EXISTS care_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- CASCADE: a deleted household (last owner left) takes its pets and history
  pet_id BIGINT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('feeding', 'water', 'walk', 'medication', 'vet_visit', 'grooming')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  note TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  assigned_to BIGINT REFERENCES users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'done')),
  completed_at TIMESTAMPTZ,
  -- RESTRICT: history stays when a member leaves (BR-06)
  completed_by BIGINT REFERENCES users (id) ON DELETE RESTRICT,
  duplicate_override BOOLEAN NOT NULL DEFAULT FALSE,
  -- FK added with routines (Member 3)
  routine_id BIGINT,
  created_by BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT care_events_done_has_completion CHECK (
    (status = 'done' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    OR (status = 'upcoming' AND completed_at IS NULL AND completed_by IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS care_events_duplicate_idx
  ON care_events (pet_id, type, completed_at DESC)
  WHERE status = 'done';

CREATE INDEX IF NOT EXISTS care_events_pet_scheduled_idx
  ON care_events (pet_id, scheduled_at);

CREATE INDEX IF NOT EXISTS care_events_assignee_upcoming_idx
  ON care_events (assigned_to)
  WHERE status = 'upcoming';
