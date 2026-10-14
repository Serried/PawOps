ALTER TABLE pets ADD COLUMN household_id BIGINT REFERENCES households(id);
CREATE INDEX pets_household_idx ON pets (household_id);

ALTER TABLE pets ADD CONSTRAINT pets_household_required
  CHECK (household_id IS NOT NULL) NOT VALID;
