import { listCareEvents } from './careEvents.js'
import { listPets } from './pets.js'

export function localDayBounds(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export async function getDashboard(householdId, now = new Date()) {
  const bounds = localDayBounds(now)
  const [pets, today, recentActivity, activeAlerts] = await Promise.all([
    listPets(householdId),
    listCareEvents({ householdId, ...bounds, limit: 200 }),
    listCareEvents({ householdId, status: 'done', limit: 8 }),
    listCareEvents({ householdId, status: 'overdue', limit: 50 }),
  ])

  return {
    pets,
    today: [...today].sort((left, right) => new Date(left.scheduledAt) - new Date(right.scheduledAt)),
    recentActivity,
    activeAlerts,
  }
}

