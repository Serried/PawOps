import { Router } from 'express'
import { sessionUser } from './auth.js'

export function createHouseholdRouter(query) {
  const router = Router()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    try {
      req.user = await sessionUser(query, req)
      if (!req.user) return res.status(401).json({ error: 'Please log in.' })
      next()
    } catch (error) { next(error) }
  })

  router.get('/', async (req, res, next) => {
    try {
      const result = await query(`SELECT h.id, h.name, h.created_at, m.role
        FROM households h JOIN household_members m ON m.household_id = h.id
        WHERE m.user_id = $1 ORDER BY h.created_at, h.id`, [req.user.id])
      res.json({ households: result.rows })
    } catch (error) { next(error) }
  })

  router.post('/', async (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' })
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request denied.' })
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name || name.length > 100) return res.status(400).json({ error: 'Household name must be 1–100 characters.' })
    try {
      const result = await query(`WITH household AS (
        INSERT INTO households (name) VALUES ($1) RETURNING id, name, created_at
      ), membership AS (
        INSERT INTO household_members (household_id, user_id, role)
        SELECT id, $2, 'owner' FROM household RETURNING role
      ) SELECT household.*, membership.role FROM household CROSS JOIN membership`, [name, req.user.id])
      res.status(201).json({ household: result.rows[0] })
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'households_name_unique') {
        return res.status(409).json({ error: 'A household with this name already exists.' })
      }
      next(error)
    }
  })
  router.post('/:householdId/leave', async (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' })
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request denied.' })
    const id = req.params.householdId
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
      return res.status(400).json({ error: 'Invalid household ID.' })
    }
    try {
      const result = await query('SELECT * FROM leave_household($1, $2)', [id, req.user.id])
      if (!result.rows[0].left_household) return res.status(403).json({ error: 'You are not a member of this household.' })
      res.json({ householdDeleted: result.rows[0].household_deleted })
    } catch (error) { next(error) }
  })
  router.use('/:householdId/members', async (req, res, next) => {
    const id = req.params.householdId
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
      return res.status(400).json({ error: 'Invalid household ID.' })
    }
    try {
      const result = await query('SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2', [id, req.user.id])
      if (!result.rows[0] || (req.method === 'POST' && result.rows[0].role !== 'owner')) {
        return res.status(403).json({ error: 'You do not have permission to manage this household.' })
      }
      next()
    } catch (error) { next(error) }
  })

  router.get('/:householdId/members', async (req, res, next) => {
    try {
      const result = await query(`SELECT u.id, u.email, u.display_name, m.role FROM household_members m
        JOIN users u ON u.id = m.user_id WHERE m.household_id = $1
        ORDER BY m.role DESC, u.email`, [req.params.householdId])
      res.json({ members: result.rows })
    } catch (error) { next(error) }
  })

  router.post('/:householdId/members', async (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' })
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request denied.' })
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    try {
      const user = (await query('SELECT id, email FROM users WHERE email = $1', [email])).rows[0]
      if (!user) return res.status(404).json({ error: 'No registered user has this email. Ask them to register first.' })
      const result = await query(`INSERT INTO household_members (household_id, user_id, role)
        VALUES ($1, $2, 'member') ON CONFLICT (household_id, user_id) DO NOTHING
        RETURNING role`, [req.params.householdId, user.id])
      if (!result.rows[0]) return res.status(409).json({ error: 'This user is already a household member.' })
      res.status(201).json({ member: { ...user, role: 'member' } })
    } catch (error) { next(error) }
  })
  return router
}

