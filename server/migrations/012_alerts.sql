
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  pet_id BIGINT NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  care_event_id BIGINT NOT NULL REFERENCES care_events (id) ON DELETE CASCADE,
  routine_id BIGINT REFERENCES care_routines (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('overdue')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
  -- "Exactly one overdue alert": enforced by the database, so repeated runs, several
  -- workers at once or a redelivered queue message cannot create a second one.
  CONSTRAINT alerts_one_per_occurrence UNIQUE (care_event_id, type)
);

CREATE INDEX IF NOT EXISTS alerts_household_idx ON alerts (household_id, created_at DESC);
