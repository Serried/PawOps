export function validatePetValues(values, today = new Date()) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'is required'
  if (!values.species.trim()) errors.species = 'is required'
  if (values.weightKg !== '' && Number(values.weightKg) <= 0) errors.weightKg = 'must be greater than 0'
  if (values.birthDate) {
    const birthDate = new Date(`${values.birthDate}T00:00:00`)
    const endOfToday = new Date(today)
    endOfToday.setHours(23, 59, 59, 999)
    if (Number.isNaN(birthDate.getTime()) || birthDate > endOfToday) {
      errors.birthDate = 'must be today or earlier'
    }
  }
  return errors
}

