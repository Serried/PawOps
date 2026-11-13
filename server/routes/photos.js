import { Router } from 'express'
import { UPLOAD_DIR } from '../config.js'
import { query } from '../db.js'
import { forbidden } from '../lib/http-error.js'
import { requireAuth } from '../middleware/auth.js'

export const photosRouter = Router()
photosRouter.use(requireAuth)

photosRouter.get('/pets/:filename', async (req, res) => {
  const result = await query(
    `SELECT p.photo_path FROM pets p
      JOIN household_members m ON m.household_id = p.household_id
      WHERE p.photo_path = $1 AND p.archived_at IS NULL AND m.user_id = $2`,
    [`pets/${req.params.filename}`, req.user.id],
  )
  if (!result.rowCount) throw forbidden('Pet photo access denied.')
  // Membership is checked on every request, including after leaving a household.
  res.set('Cache-Control', 'private, no-store')
  res.sendFile(result.rows[0].photo_path, { root: UPLOAD_DIR, dotfiles: 'deny' })
})
