-- Add the date from which a recurring routine becomes effective.
-- Existing routines retain their previous behavior, starting from today.
ALTER TABLE care_routines
  ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE;
