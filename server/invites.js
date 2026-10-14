import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { sessionUser } from './auth.js'

export function inviteHandlers(query) {
  return {
    owner: async (req, res, next) => {
      const id = req.params.householdId
      if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return res.status(400).json({ error: 'Invalid household ID.' })
      try {
        const result = await query('SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2', [id, req.user.id])
        if (result.rows[0]?.role !== 'owner') return res.status(403).json({ error: 'Only the household owner can manage invite codes.' })
        next()
      } catch (error) { next(error) }
    },
    read: async (req, res, next) => {
      try {
        const result = await query('SELECT code, expires_at FROM household_invites WHERE household_id = $1 AND expires_at > NOW()', [req.params.householdId])
        res.json({ invite: result.rows[0] || null })
      } catch (error) { next(error) }
    },
    generate: async (req, res, next) => {
      try {
        const code = `PAW-${randomBytes(8).toString('hex').toUpperCase()}`
        const result = await query(`INSERT INTO household_invites (household_id, code, expires_at)
          VALUES ($1, $2, NOW() + INTERVAL '7 days')
          ON CONFLICT (household_id) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at
          RETURNING code, expires_at`, [req.params.householdId, code])
        res.status(201).json({ invite: result.rows[0] })
      } catch (error) { next(error) }
    },
    join: async (req, res, next) => {
      const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : ''
      if (!/^PAW-[A-F0-9]{16}$/.test(code)) return res.status(400).json({ error: 'Enter a valid invite code.' })
      try {
        const result = await query(`WITH invitation AS (
          SELECT h.id, h.name, h.created_at FROM household_invites i
          JOIN households h ON h.id = i.household_id
          WHERE i.code = $1 AND i.expires_at > NOW() FOR SHARE OF i, h
        ), membership AS (
          INSERT INTO household_members (household_id, user_id, role)
          SELECT id, $2, 'member' FROM invitation
          ON CONFLICT (household_id, user_id) DO NOTHING RETURNING household_id
        ) SELECT invitation.*, EXISTS (SELECT 1 FROM membership) AS joined FROM invitation`, [code, req.user.id])
        const household = result.rows[0]
        if (!household) return res.status(404).json({ error: 'This invite code is invalid or expired.' })
        if (!household.joined) return res.status(409).json({ error: 'You already belong to this household.' })
        res.status(201).json({ household: { id: household.id, name: household.name, created_at: household.created_at, role: 'member' } })
      } catch (error) { next(error) }
    },
  }
}

export function createInviteRouter(query) {
  const router = Router()
  const handlers = inviteHandlers(query)
  const attempts = new Map()
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    try {
      req.user = await sessionUser(query, req)
      if (!req.user) return res.status(401).json({ error: 'Please log in.' })
      if (req.method === 'POST') {
        if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' })
        if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request denied.' })
        const now = Date.now()
        for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key)
        const attempt = attempts.get(req.user.id) || { count: 0, until: now + 900000 }
        attempts.set(req.user.id, attempt)
        if (++attempt.count > 30) return res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' })
      }
      next()
    } catch (error) { next(error) }
  })
  router.post('/join', handlers.join)
  router.get('/:householdId', handlers.owner, handlers.read)
  router.post('/:householdId', handlers.owner, handlers.generate)
  return router
}
