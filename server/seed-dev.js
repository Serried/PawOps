// Demo data (npm run db:seed); skipped if it already exists
import { pool } from './db.js'
import { hashPassword } from './passwords.js'

const DEMO_EMAIL_DOMAIN = '@pawops.dev'
const DEMO_PASSWORD = 'pawops123'

async function seed() {
  const client = await pool.connect()
  try {
    const existing = await client.query('SELECT 1 FROM users WHERE email LIKE $1 LIMIT 1', [
      `%${DEMO_EMAIL_DOMAIN}`,
    ])
    if (existing.rowCount > 0) {
      console.log('Demo data already present — skipping')
      return
    }

    await client.query('BEGIN')

    const users = {}
    for (const name of ['Tanakrit', 'Ryuu', 'Pim', 'Nok', 'Olive']) {
      const result = await client.query(
        'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
        [`${name.toLowerCase()}${DEMO_EMAIL_DOMAIN}`, await hashPassword(DEMO_PASSWORD), name],
      )
      users[name] = Number(result.rows[0].id)
    }

    const home = await client.query(
      "INSERT INTO households (name) VALUES ('Tanakrit''s Household') RETURNING id",
    )
    const homeId = Number(home.rows[0].id)
    await client.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES
         ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')`,
      [homeId, users.Tanakrit, users.Ryuu, users.Pim, users.Nok],
    )

    // Another household, for the 403 demo
    const other = await client.query(
      "INSERT INTO households (name) VALUES ('Olive''s Household') RETURNING id",
    )
    const otherId = Number(other.rows[0].id)
    await client.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')",
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
      const result = await client.query(
        `INSERT INTO pets (household_id, name, species, breed, birth_date, weight_kg, sex, health_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [householdId, name, species, breed, birthDate, weight, sex, notes],
      )
      pets[name] = Number(result.rows[0].id)
    }

    await client.query(
      `INSERT INTO pet_caretakers (pet_id, user_id) VALUES
         ($1, $4), ($1, $5), ($2, $6), ($3, $6), ($3, $4)`,
      [pets.Mochi, pets.Luna, pets.Pudding, users.Ryuu, users.Pim, users.Nok],
    )

    // [pet, type, title, minutesFromNow, assignee, doneBy, note]
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
      await client.query(
        `INSERT INTO care_events
           (pet_id, type, title, note, scheduled_at, assigned_to, status,
            completed_at, completed_by, created_by)
         VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5), $6,
                 CASE WHEN $7::bigint IS NULL THEN 'upcoming' ELSE 'done' END,
                 CASE WHEN $7::bigint IS NULL THEN NULL ELSE NOW() + make_interval(mins => $5 + 5) END,
                 $7, $8)`,
        [pets[pet], type, title, note, minutes, users[assignee], doneBy ? users[doneBy] : null, users[assignee]],
      )
    }

    await client.query('COMMIT')
    console.log(`Seeded demo data. Sign in with password "${DEMO_PASSWORD}":`)
    for (const name of Object.keys(users)) {
      console.log(`  ${name.toLowerCase()}${DEMO_EMAIL_DOMAIN}${name === 'Olive' ? '  (another household)' : ''}`)
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((error) => {
  console.error('Seeding failed', error)
  process.exitCode = 1
})
