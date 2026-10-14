const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const dayMonthFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const longDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function startOfDay(date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// 0 = today, 1 = yesterday, -1 = tomorrow ...
function daysAgo(date, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY)
}

export function isToday(value) {
  return daysAgo(new Date(value)) === 0
}

export function formatTime(value) {
  return timeFormat.format(new Date(value))
}

// "Today, 18:30" / "Yesterday, 19:15" / "Tomorrow, 08:00" / "9 Oct, 18:05"
export function formatDayTime(value) {
  const date = new Date(value)
  const offset = daysAgo(date)
  const day =
    offset === 0
      ? 'Today'
      : offset === 1
        ? 'Yesterday'
        : offset === -1
          ? 'Tomorrow'
          : dayMonthFormat.format(date)
  return `${day}, ${formatTime(date)}`
}

// "5 min ago" / "14:10" / "Yesterday 19:15" / "9 Oct 18:05"
export function formatTimelineTime(value) {
  const date = new Date(value)
  const now = new Date()
  const minutes = Math.round((now - date) / MINUTE)
  const offset = daysAgo(date, now)
  if (offset === 0 && minutes >= 0 && minutes < 60) {
    return minutes < 1 ? 'just now' : `${minutes} min ago`
  }
  if (offset === 0) return formatTime(date)
  if (offset === 1) return `Yesterday ${formatTime(date)}`
  return `${dayMonthFormat.format(date)} ${formatTime(date)}`
}

export function groupByDay(events, getDate) {
  const groups = []
  for (const event of events) {
    const date = new Date(getDate(event))
    const offset = daysAgo(date)
    const label =
      offset === 0 ? 'Today' : offset === 1 ? 'Yesterday' : longDateFormat.format(date)
    const last = groups.at(-1)
    if (last?.label === label) last.events.push(event)
    else groups.push({ label, events: [event] })
  }
  return groups
}

// "2022-03-14" -> "4 yrs 6 mos"
export function formatAge(birthDate) {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  const now = new Date()
  let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
  if (now.getDate() < day) months -= 1
  if (months < 0) return null
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = []
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`)
  if (rest > 0 || years === 0) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mos'}`)
  return parts.join(' ')
}

export function formatBirthDate(birthDate) {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  return longDateFormat.format(new Date(year, month - 1, day))
}

export function todayISODate() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Today at the next half hour
export function defaultSchedule() {
  const next = new Date(Date.now() + 30 * MINUTE)
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
    time: `${pad(next.getHours())}:${pad(next.getMinutes())}`,
  }
}

export function toISODateTime(date, time) {
  if (!date || !time) return null
  const value = new Date(`${date}T${time}`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

export function initial(name) {
  return (name?.trim()?.[0] ?? '?').toUpperCase()
}

const TIMELINE_MIDDLE = {
  feeding: ' was fed by ',
  water: "'s water was refilled by ",
  walk: ' went for a walk with ',
  medication: ' was given medication by ',
  vet_visit: ' visited the vet with ',
  grooming: ' was groomed by ',
}

export function timelineSentence(type, petName, userName) {
  return { pet: petName, middle: TIMELINE_MIDDLE[type] ?? ' was cared for by ', user: userName }
}
