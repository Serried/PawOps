// Member 1's session cookie -> req.user = { id, name, email }
import { sessionUser } from '../auth.js'
import { query } from '../db.js'
import { unauthorized } from '../lib/http-error.js'
import { userName } from '../lib/user-name.js'

export async function requireAuth(request, response, next) {
  response.set('Cache-Control', 'no-store')
  const user = await sessionUser(query, request)
  if (!user) throw unauthorized('Please log in.')
  request.user = { id: Number(user.id), name: userName(user), email: user.email }
  next()
}
