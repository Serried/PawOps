import { Router } from 'express'
import { query } from '../db.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { paramId, Validator } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { userNameSql } from '../lib/user-name.js'
import { assertAllMembers, loadAccessiblePet } from '../services/access.js'

const TYPES = ['feeding', 'water', 'walk', 'medication', 'vet_visit', 'grooming']
function routineValues(body) {
  const values = new Validator(body)
    .id('petId', { required: true })
    .oneOf('type', TYPES, { required: true })
    .string('title', { max: 80 })
    .string('time', { required: true, max: 5 })
    .id('assignedToId')
    .result()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) {
    throw badRequest('time must use HH:MM format')
  }
  const days = body.daysOfWeek ?? [0,1,2,3,4,5,6]
  if (!Array.isArray(days) || !days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw badRequest('daysOfWeek must contain days from 0 (Sunday) to 6 (Saturday)')
  }
  if (body.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) throw badRequest('Invalid start date')
  values.startDate = body.startDate || new Date().toISOString().slice(0,10)
  values.daysOfWeek = [...new Set(days)]
  return values
}
export const routinesRouter = Router()
routinesRouter.use(requireAuth)

routinesRouter.get('/', async (req, res) => {
  const householdId = req.query.householdId ? Number(req.query.householdId) : null
  const result = await query(
    `SELECT r.id, r.pet_id, p.name AS pet_name, r.type, r.title,
            to_char(r.time_of_day, 'HH24:MI') AS time, r.days_of_week,
            r.active, r.start_date, r.assigned_to,
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id',u.id,'name',${userNameSql('u')}) END AS assignee
       FROM care_routines r JOIN pets p ON p.id=r.pet_id
       LEFT JOIN users u ON u.id=r.assigned_to
      WHERE p.household_id IN (SELECT household_id FROM household_members WHERE user_id=$1)
        AND p.archived_at IS NULL AND ($2::bigint IS NULL OR p.household_id=$2) ORDER BY p.name, r.time_of_day`,
    [req.user.id, householdId],
  )
  res.json({ routines: result.rows.map((r) => ({ id:Number(r.id), petId:Number(r.pet_id), petName:r.pet_name, type:r.type, title:r.title, time:r.time, daysOfWeek:r.days_of_week, active:r.active, startDate:r.start_date, assignedTo:r.assignee })) })
})
routinesRouter.post('/', async (req, res) => {
  const v = routineValues(req.body)
  const pet = await loadAccessiblePet(v.petId, req.user.id)
  if (v.assignedToId) await assertAllMembers(pet.householdId, [v.assignedToId], 'assignedToId')
  const result = await query(
    `INSERT INTO care_routines (pet_id,type,title,time_of_day,days_of_week,assigned_to,created_by,start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [pet.id,v.type,v.title.trim(),v.time,v.daysOfWeek,v.assignedToId ?? null,req.user.id,v.startDate],
  )
  res.status(201).json({ routine: { id:Number(result.rows[0].id), petId:pet.id, petName:pet.name, ...v, active:true } })
})
routinesRouter.patch('/:routineId', async (req, res) => {
  const id = paramId(req.params.routineId, 'Routine')
  if (typeof req.body.active === 'boolean' && Object.keys(req.body).length === 1) {
    const result = await query(
      `UPDATE care_routines r SET active=$2
        FROM pets p WHERE r.pet_id=p.id AND r.id=$1
        AND p.household_id IN (SELECT household_id FROM household_members WHERE user_id=$3)
        RETURNING r.id,r.active`, [id, req.body.active, req.user.id])
    if (!result.rowCount) throw notFound('Routine not found')
    return res.json({ routine: { id: Number(result.rows[0].id), active: result.rows[0].active } })
  }
  const v = routineValues(req.body)
  const pet = await loadAccessiblePet(v.petId, req.user.id)
  if (v.assignedToId) await assertAllMembers(pet.householdId, [v.assignedToId], 'assignedToId')
  const result = await query(
    `UPDATE care_routines r SET pet_id=$2,type=$3,title=$4,time_of_day=$5,days_of_week=$6,assigned_to=$7,start_date=$9
      WHERE r.id=$1 AND EXISTS (
        SELECT 1 FROM pets p WHERE p.id=r.pet_id
        AND p.household_id IN (SELECT household_id FROM household_members WHERE user_id=$8)
      ) RETURNING r.id`,
    [id, pet.id, v.type, v.title.trim(), v.time, v.daysOfWeek, v.assignedToId ?? null, req.user.id,v.startDate])
  if (!result.rowCount) throw notFound('Routine not found')
  res.json({ routine: { id, petId: pet.id, petName: pet.name, ...v } })
})
routinesRouter.delete('/:routineId', async (req, res) => {
  const id = paramId(req.params.routineId, 'Routine')
  const result = await query(
    `DELETE FROM care_routines r USING pets p
      WHERE r.pet_id=p.id AND r.id=$1
      AND p.household_id IN (SELECT household_id FROM household_members WHERE user_id=$2)
      RETURNING r.id`, [id, req.user.id])
  if (!result.rowCount) throw notFound('Routine not found')
  res.status(204).end()
})
