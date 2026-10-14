import path from 'node:path'

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const CARE_EVENT_TYPES = [
  'feeding',
  'water',
  'walk',
  'medication',
  'vet_visit',
  'grooming',
]

// BR-03: only these types trigger the duplicate warning
export const DUPLICATE_CHECK_TYPES = ['feeding', 'medication']

// Used until routines (Member 3) provide their own window
export const DUPLICATE_WINDOW_MINUTES = positiveInt(
  process.env.DUPLICATE_WINDOW_MINUTES,
  30,
)

export const OVERDUE_GRACE_MINUTES = positiveInt(
  process.env.OVERDUE_GRACE_MINUTES,
  15,
)

export const PET_SEXES = ['male', 'female', 'unknown']

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads')
export const PET_PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const PET_PHOTO_MIME_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
}
