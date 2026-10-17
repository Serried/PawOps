import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { hashPassword } from './passwords.js'

const DEMO_EMAIL_DOMAIN = '@pawops.dev'

export function seedPassword(env) {
  if (!['development', 'test'].includes(env.NODE_ENV) || env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed requires NODE_ENV=development or test and ALLOW_DEMO_SEED=true.')
  }
  if (!env.SEED_PASSWORD || env.SEED_PASSWORD.trim().length < 12) {
    throw new Error('SEED_PASSWORD must contain at least 12 non-padding characters.')
  }
  return env.SEED_PASSWORD
}

async function ensureRow(client, select, identity, insert, values) {
  const existing = await client.query(select, identity)
  if (existing.rows.length) return existing.rows[0].id
  const result = await client.query(insert, values)
  return result.rows[0].id
}

export async function seed(pool, env = process.env) {
  const password = seedPassword(env)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(728401, 8)')

    const users = {}
    for (const name of ['Tanakrit', 'Ryuu', 'Pim', 'Nok', 'Olive']) {
      users[name] = await ensureRow(client,
        'SELECT id FROM users WHERE email = $1', [`${name.toLowerCase()}${DEMO_EMAIL_DOMAIN}`],
        'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
        [`${name.toLowerCase()}${DEMO_EMAIL_DOMAIN}`, await hashPassword(password), name],
      )
    }

    const homeId = await ensureRow(client,
      'SELECT id FROM households WHERE lower(btrim(name)) = lower(btrim($1)) ORDER BY id LIMIT 1', ["Tanakrit's Household"],
      "INSERT INTO households (name) VALUES ('Tanakrit''s Household') RETURNING id",
    )
    await client.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES
         ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')
       ON CONFLICT (household_id, user_id) DO NOTHING`,
      [homeId, users.Tanakrit, users.Ryuu, users.Pim, users.Nok],
    )

    const otherId = await ensureRow(client,
      'SELECT id FROM households WHERE lower(btrim(name)) = lower(btrim($1)) ORDER BY id LIMIT 1', ["Olive's Household"],
      "INSERT INTO households (name) VALUES ('Olive''s Household') RETURNING id",
    )
    await client.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (household_id, user_id) DO NOTHING",
      [otherId, users.Olive],
    )

    const pets = {}
    const petRows = [
      ['Mochi', 'Dog', 'Shiba Inu', '2022-03-14', 11.4, 'female', 'No known allergies', homeId],
      ['Luna', 'Cat', 'British Shorthair', '2021-08-02', 4.2, 'female', null, homeId],
      ['Pudding', 'Rabbit', 'Holland Lop', '2024-02-10', 1.6, 'male', null, homeId],
      ['Biscuit', 'Dog', 'Beagle', '2020-05-20', 10.1, 'male', null, otherId],
    ]
    for (const [name, species, breed, birthDate, weight, sex, notes, householdId] of petRows) {
      pets[name] = await ensureRow(client,
        'SELECT id FROM pets WHERE household_id = $1 AND name = $2 ORDER BY id LIMIT 1', [householdId, name],
        `INSERT INTO pets (household_id, name, species, breed, birth_date, weight_kg, sex, health_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [householdId, name, species, breed, birthDate, weight, sex, notes],
      )
    }

    await client.query(
      `INSERT INTO pet_caretakers (pet_id, user_id) VALUES
         ($1, $4), ($1, $5), ($2, $6), ($3, $6), ($3, $4)
       ON CONFLICT (pet_id, user_id) DO NOTHING`,
      [pets.Mochi, pets.Luna, pets.Pudding, users.Ryuu, users.Pim, users.Nok],
    )

    const events = [
      ['Mochi', 'feeding', 'Breakfast', -360, 'Ryuu', 'Ryuu', 'Ate everything.'],
      ['Mochi', 'medication', 'Joint supplement', -300, 'Tanakrit', 'Tanakrit', 'Hidden in a small treat.'],
      ['Mochi', 'walk', 'Afternoon walk', -150, 'Ryuu', 'Ryuu', 'Park loop, stayed on the shady side.'],
      ['Mochi', 'water', 'Fresh water', -60, 'Tanakrit', null, null],
      ['Mochi', 'feeding', 'Dinner', 120, 'Pim', null, null],
      ['Mochi', 'walk', 'Evening walk', 180, 'Ryuu', null, null],
      ['Luna', 'feeding', 'Breakfast', -330, 'Nok', 'Nok', null],
      ['Luna', 'medication', 'Medication', 90, 'Nok', null, null],
      ['Pudding', 'feeding', 'Morning feed', -340, 'Tanakrit', 'Tanakrit', null],
      ['Biscuit', 'feeding', 'Breakfast', -200, 'Olive', 'Olive', null],
    ]
    for (const [pet, type, title, minutes, assignee, doneBy, note] of events) {
      await ensureRow(client,
        'SELECT id FROM care_events WHERE pet_id = $1 AND type = $2 AND title = $3 ORDER BY id LIMIT 1',
        [pets[pet], type, title],
        `INSERT INTO care_events
           (pet_id, type, title, note, scheduled_at, assigned_to, status,
            completed_at, completed_by, created_by)
         VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5), $6,
                 CASE WHEN $7::bigint IS NULL THEN 'upcoming' ELSE 'done' END,
                 CASE WHEN $7::bigint IS NULL THEN NULL ELSE NOW() + make_interval(mins => $5 + 5) END,
                 $7, $8) RETURNING id`,
        [pets[pet], type, title, note, minutes, users[assignee], doneBy ? users[doneBy] : null, users[assignee]],
      )
    }

    await client.query('COMMIT')
    console.log('Demo data ready. Existing passwords and records were preserved. Demo accounts:')
    for (const name of Object.keys(users)) {
      console.log(`  ${name.toLowerCase()}${DEMO_EMAIL_DOMAIN}${name === 'Olive' ? '  (another household)' : ''}`)
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool
  try {
    seedPassword(process.env)
    pool = (await import('./db.js')).pool
    await seed(pool)
  } catch {
    console.error('Seeding failed. Check NODE_ENV, ALLOW_DEMO_SEED, SEED_PASSWORD and database configuration; run migrations first.')
    process.exitCode = 1
  } finally {
    if (pool) await pool.end()
  }
}
