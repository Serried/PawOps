LOCK TABLE households IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  duplicate RECORD;
  candidate TEXT;
  suffix TEXT;
  attempt INTEGER;
BEGIN
  FOR duplicate IN
    SELECT id, name FROM (
      SELECT id, name, row_number() OVER (
        PARTITION BY lower(btrim(name)) ORDER BY created_at, id
      ) AS position FROM households
    ) ranked WHERE position > 1 ORDER BY id
  LOOP
    attempt := 0;
    LOOP
      suffix := ' (' || duplicate.id || CASE WHEN attempt = 0 THEN '' ELSE '-' || attempt END || ')';
      candidate := left(btrim(duplicate.name), 100 - char_length(suffix)) || suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM households WHERE lower(btrim(name)) = lower(candidate)
      );
      attempt := attempt + 1;
    END LOOP;
    UPDATE households SET name = candidate WHERE id = duplicate.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX households_name_unique ON households (lower(btrim(name)));

ALTER TABLE pets DROP CONSTRAINT pets_household_id_fkey;
ALTER TABLE pets ADD CONSTRAINT pets_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE;

CREATE FUNCTION leave_household(target_id BIGINT, actor_id BIGINT)
RETURNS TABLE (left_household BOOLEAN, household_deleted BOOLEAN)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM households WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;
  DELETE FROM household_members WHERE household_id = target_id AND user_id = actor_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM household_members WHERE household_id = target_id AND role = 'owner') THEN
    DELETE FROM households WHERE id = target_id;
    RETURN QUERY SELECT true, true;
  ELSE
    RETURN QUERY SELECT true, false;
  END IF;
END;
$$;
