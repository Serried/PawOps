import { Router } from 'express'
import { randomBytes, createHash } from 'node:crypto'
import { hashPassword, verifyPassword } from './passwords.js'

const cookieName = 'pawops_session'
const lifetime = 7 * 24 * 60 * 60 * 1000
const digest = (token) => createHash('sha256').update(token).digest('hex')

export async function sessionUser(query, req) {
  const token = req.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (!token) return null
  const result = await query('SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()', [digest(token)])
  return result.rows[0] || null
}

export function createAuthRouter(query, { secure = process.env.NODE_ENV === 'production' } = {}) {
  const router = Router()
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/' }
  const dummyHash = hashPassword(randomBytes(32).toString('hex'))
  const attempts = new Map()
  const tokenFrom = (req) => req.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next()
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' })
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request denied.' })
    next()
  })

  router.post(['/register', '/login'], async (req, res, next) => {
    const now = Date.now()
    for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key)
    const attempt = attempts.get(req.ip) || { count: 0, reset: now + 15 * 60 * 1000 }
    attempts.set(req.ip, attempt)
    if (++attempt.count > 20) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
    const { email, password } = req.body || {}
    if (typeof email !== 'string' || typeof password !== 'string' ||
        email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Enter a valid email and a password between 8 and 128 characters.' })
    }
    const normalizedEmail = email.trim().toLowerCase()
    try {
      if (req.path === '/register') {
        const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : ''
        if (displayName.length > 100) return res.status(400).json({ error: 'Full name must be at most 100 characters.' })
        const passwordHash = await hashPassword(password)
        const result = await query('INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email', [normalizedEmail, passwordHash, displayName])
        return res.status(201).json({ user: result.rows[0] })
      }
      const result = await query('SELECT id, email, password_hash, display_name FROM users WHERE email = $1', [normalizedEmail])
      const user = result.rows[0]
      const valid = await verifyPassword(password, user?.password_hash || await dummyHash)
      if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password.' })
      const token = randomBytes(32).toString('hex')
      await query('DELETE FROM sessions WHERE expires_at <= NOW()', [])
      await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [digest(token), user.id, new Date(Date.now() + lifetime)])
      const previous = tokenFrom(req)
      if (previous) await query('DELETE FROM sessions WHERE token_hash = $1', [digest(previous)])
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetime })
      res.json({ user: { id: user.id, email: user.email, display_name: user.display_name } })
    } catch (error) {
      if (error.code === '23505' && req.path === '/register') return res.status(409).json({ error: 'An account with this email already exists.' })
      next(error)
    }
  })

  router.get('/me', async (req, res, next) => {
    try {
      const token = tokenFrom(req)
      if (!token) return res.status(401).json({ error: 'Please log in.' })
      const result = await query('SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()', [digest(token)])
      if (!result.rows[0]) return res.status(401).json({ error: 'Please log in.' })
      res.json({ user: result.rows[0] })
    } catch (error) { next(error) }
  })

  router.post('/logout', async (req, res, next) => {
    try {
      const token = tokenFrom(req)
      if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)])
      res.clearCookie(cookieName, cookieOptions)
      res.sendStatus(204)
    } catch (error) { next(error) }
  })
  return router
}

