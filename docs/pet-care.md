# Pet & Care — Member 2

Owner: **Member 2** · PBI-05, PBI-06, PBI-07, PBI-08 · Business rules BR-02, BR-03, BR-06 · AC-01, AC-03

## Run it locally

```powershell
Copy-Item .env.example .env        # first time only
npm install
npm run db:up
npm run db:migrate
npm run db:seed      # demo users, households and pets
npm run dev          # http://localhost:5173
npm test             # Member 1's node:test suites + Vitest (needs the database)
```

Sign in with any demo user, password `pawops123`:
`tanakrit@pawops.dev` (owner), `ryuu@pawops.dev`, `pim@pawops.dev`, `nok@pawops.dev`
(same household), `olive@pawops.dev` (another household).
After signing in, choose the household on Member 1's household screen.

If an old local database fails to migrate, reset it: `docker compose down --volumes`,
then `npm run db:up` and `npm run db:migrate` again.

## Screens (from the web design)

| Route | Screen |
|---|---|
| `/pets` | My Pets |
| `/pets/new` | Add Pet (photo JPG/PNG, caretakers) |
| `/pets/:id` | Pet profile — Routines (Mark as Done), Care timeline |
| `/members` | Household Members (Member 1's page inside the app shell) |
| `/pets/:id/edit` | Edit pet, Remove pet |
| `/care/new?petId=` | Add Care Event — opened from the Dashboard's "+ Add care event" (Member 4) |

## API

All requests need Member 1's login session cookie (`pawops_session`); without it the API answers 401.
Pet / Care errors use `{ "error": { "code", "message", "details" } }`
(Member 1's routes keep `{ "error": "message" }`; the web client reads both).
Validation errors list fields in `details.fields`.

| Method | Path | Used by |
|---|---|---|
| GET | `/api/pets?householdId=` | My Pets (in the order pets were added) |
| POST | `/api/pets` | Add Pet: `name`, `species` required; `breed`, `birthDate`, `weightKg`, `sex`, `healthNotes`, `caretakerIds`, `householdId` |
| GET | `/api/pets/:id` | Pet profile, Edit pet — 403 "Pet access denied." for another household, a missing or a removed pet (same answer, so existence is not revealed — Member 1's PBI-04 rule); 400 for an invalid id |
| PATCH | `/api/pets/:id` | Edit pet (same fields as POST) |
| DELETE | `/api/pets/:id` | Remove pet (archived; care history is kept) |
| POST | `/api/pets/:id/photo` | Upload photo — multipart field `photo`, JPG or PNG ≤ 2 MB |
| GET | `/api/pets/:id/events?status=&from=&to=&limit=` | Pet profile routines + care timeline |
| POST | `/api/pets/:id/events` | Add Care Event: `{ type, title, scheduledAt, assignedToId, note }` |
| POST | `/api/care-events/:id/complete` | Mark as Done, `{ override? }` |
| GET | `/api/care-events?status=&from=&to=&householdId=&petId=` | Dashboard (Member 4) |

`type`: `feeding`, `walk`, `medication`, `vet_visit`, `grooming` (Add Care Event), plus `water` for routines.
`status` filter: `open` (not done), `upcoming`, `overdue`, `done`.
An upcoming event is reported as `overdue` 15 minutes after its time
(`OVERDUE_GRACE_MINUTES`). Done events never become overdue.

### Duplicate safety (BR-03 / AC-03)

Marking **feeding** or **medication** as done when the same type was done for that pet
in the last 30 minutes (`DUPLICATE_WINDOW_MINUTES`) answers:

```json
409 { "error": { "code": "DUPLICATE_CARE",
  "message": "Mochi was fed 5 minutes ago by Tanakrit",
  "details": { "previous": { "completedAt": "...", "completedBy": { "id": 1, "name": "Tanakrit" } } } } }
```

The UI shows ⚠ with the message and **Cancel / Override**; Override resends with
`override: true` and the event is stored with `duplicate_override = true`.

The check and the update run in one transaction that locks the pet row
(`SELECT ... FOR UPDATE`), so two members marking food as done at the same moment
cannot both pass. Completing an already-done task answers 409 `ALREADY_DONE`.

## Traceability

| Requirement | Implementation | Test |
|---|---|---|
| PBI-05 pet profiles | `server/services/pets.js`, `src/pages/pets/*` | `tests/api/pets.test.js` |
| PBI-06 / AC-01 record care | `createCareEvent`, `completeCareEvent` | `care-events.test.js` › PBI-06, AC-01 |
| PBI-07 timeline | `listCareEvents`, `PetProfilePage` | AC-01 "shows it on the timeline" |
| PBI-08 / AC-03 / BR-03 duplicate warning | `guardDuplicate`, `useDuplicateGuard`, `DuplicateWarningDialog` | `care-events.test.js` › AC-03, `tests/unit/care-rules.test.js` |
| BR-02 event needs existing pet + authorized user | `loadAccessiblePet` | "BR-02 / AC-02", "BR-02: care for a pet that does not exist…" |
| Works with Member 1 login, leave household, caretakers | `middleware/auth.js`, migration 007 | `tests/api/integration.test.js` |
| BR-06 history survives member removal | FKs `ON DELETE RESTRICT`, pet archive | "BR-06 …" |
| AC-02 no data from other households | `loadAccessiblePet` → 403 | `pets.test.js` › AC-02 |

## Demo (steps 3–5 of the 5-minute demo)

1. Sign in as **tanakrit@pawops.dev** → choose *Tanakrit's Household* → My Pets → Mochi →
   Routines: *Dinner* → **Mark as Done** → ✓ Done, and it appears in the Care timeline.
2. Sign in as **ryuu@pawops.dev** (another browser / private window) → Mochi → the same event is in the timeline.
3. Ryuu opens `/care/new?petId=1` → Feeding, time = now → Save event → **Mark as Done** →
   ⚠ *"Mochi was fed … ago by Tanakrit"* → Cancel.
4. Failure case: sign in as **olive@pawops.dev** (another household) and open `/pets/1` →
   "You don't have access to this pet." (API 403).

## Integration with Member 1 (PBI-01..04)

- Login: `server/middleware/auth.js` uses Member 1's `sessionUser()` (cookie session) and sets
  `req.user = { id, name, email }`; `name` = `display_name`, or the email name when empty.
- Tables: Member 1's `users`, `households`, `household_members`; Pet & Care adds migration
  `007_pets_care_events.sql`.
- When the last owner leaves (Member 1's `leave_household()`), the household, its pets and
  their care history are deleted. Removing one pet in the app archives it and keeps history.
- People who leave a household are no longer listed as caretakers.
- Web: after login and choosing a household (Member 1's `Households.jsx`), `src/PawOpsApp.jsx`
  renders the app shell and routes; `/members` shows Member 1's Household Members page.
- Styles: `src/styles/pawops.css` is scoped to `.app-shell` / `.pc-page`, so Member 1's screens
  are unchanged.

## Integration notes (other members)

- **Member 3 (routines):** `care_events.routine_id` is ready for the FK. Return the
  routine's `duplicate_window_minutes` from `duplicateWindowMinutes()` in
  `server/services/care-rules.js`. Overdue one-off tasks can be read with
  `status=overdue` for alerts.
- **Member 4 (dashboard / CI):** "Today's routines" = `GET /api/care-events?from=&to=`,
  "Recent activity" = `status=done&limit=10`. The "+ Add care event" button opens `/care/new`.
  Jenkins already runs `npm test` after `npm run db:migrate`. Uploaded photos are written to
  `UPLOAD_DIR` (`/app/uploads` in the image) — mount a volume there in Compose.
