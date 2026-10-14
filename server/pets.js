import { Router } from 'express'
import { sessionUser } from './auth.js'

export function petHandlers(query) {
  return {
    authenticate: async (req, res, next) => {
      res.set('Cache-Control', 'no-store')
      try {
        req.user = await sessionUser(query, req)
        if (!req.user) return res.status(401).json({ error: 'Please log in.' })
        next()
      } catch (error) { next(error) }
    },
    list: async (req, res, next) => {
      try {
        const result = await query(`SELECT p.* FROM pets p
          JOIN household_members m ON m.household_id = p.household_id
          WHERE m.user_id = $1 ORDER BY p.id`, [req.user.id])
        res.json({ pets: result.rows })
      } catch (error) { next(error) }
    },
    detail: async (req, res, next) => {
      const id = req.params.petId
      if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
        return res.status(400).json({ error: 'Invalid pet ID.' })
      }
      try {
        const result = await query(`SELECT p.* FROM pets p
          JOIN household_members m ON m.household_id = p.household_id
          WHERE p.id = $1 AND m.user_id = $2`, [id, req.user.id])
        if (!result.rows[0]) return res.status(403).json({ error: 'Pet access denied.' })
        res.json({ pet: result.rows[0] })
      } catch (error) { next(error) }
    },
  }
}

export function createPetRouter(query) {
  const router = Router()
  const handlers = petHandlers(query)
  router.use(handlers.authenticate)
  router.get('/', handlers.list)
  router.get('/:petId', handlers.detail)
  return router
}
