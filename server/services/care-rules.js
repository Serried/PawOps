import {
  DUPLICATE_CHECK_TYPES,
  DUPLICATE_WINDOW_MINUTES,
  OVERDUE_GRACE_MINUTES,
} from '../config.js'

const MINUTE = 60 * 1000

export function needsDuplicateCheck(type) {
  return DUPLICATE_CHECK_TYPES.includes(type)
}

// TODO(Member 3): use the routine's duplicate_window_minutes
export function duplicateWindowMinutes() {
  return DUPLICATE_WINDOW_MINUTES
}

export function isWithinDuplicateWindow(previousCompletedAt, now, windowMinutes) {
  const previous = new Date(previousCompletedAt).getTime()
  const current = new Date(now).getTime()
  const elapsed = current - previous
  return elapsed >= 0 && elapsed < windowMinutes * MINUTE
}

// Only upcoming/done are stored; overdue is derived. Done never becomes overdue (BR-04).
export function displayStatus(event, now = new Date(), graceMinutes = OVERDUE_GRACE_MINUTES) {
  if (event.status === 'done') return 'done'
  const dueBy = new Date(event.scheduledAt).getTime() + graceMinutes * MINUTE
  return new Date(now).getTime() > dueBy ? 'overdue' : 'upcoming'
}

const PAST_TENSE = {
  feeding: (pet) => `${pet} was fed`,
  water: (pet) => `${pet}'s water was refilled`,
  walk: (pet) => `${pet} went for a walk`,
  medication: (pet) => `${pet} was given medication`,
  vet_visit: (pet) => `${pet} visited the vet`,
  grooming: (pet) => `${pet} was groomed`,
}

export function describeCompletedCare(type, petName) {
  const describe = PAST_TENSE[type] ?? ((pet) => `${pet} was cared for`)
  return describe(petName)
}

export function formatElapsed(fromDate, now = new Date()) {
  const minutes = Math.max(0, Math.round((new Date(now) - new Date(fromDate)) / MINUTE))
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 minute ago'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

// e.g. "Mochi was fed 5 minutes ago by Tanakrit"
export function duplicateWarningMessage({ type, petName, completedAt, completedByName, now }) {
  return `${describeCompletedCare(type, petName)} ${formatElapsed(completedAt, now)} by ${completedByName}`
}
