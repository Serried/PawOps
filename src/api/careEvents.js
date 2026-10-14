import { api } from './client.js'

// Add Care Event types (the design has no "water")
export const CARE_TYPES = [
  { value: 'feeding', label: 'Feeding' },
  { value: 'walk', label: 'Walk' },
  { value: 'medication', label: 'Medication' },
  { value: 'vet_visit', label: 'Vet visit' },
  { value: 'grooming', label: 'Grooming' },
]

export function careTypeLabel(type) {
  return CARE_TYPES.find((item) => item.value === type)?.label ?? type
}

export async function listPetEvents(petId, params = {}) {
  const { data } = await api.get(`/pets/${petId}/events`, { params })
  return data.events
}

export async function listCareEvents(params = {}) {
  const { data } = await api.get('/care-events', { params })
  return data.events
}

export async function createCareEvent(petId, values) {
  const { data } = await api.post(`/pets/${petId}/events`, values)
  return data.event
}

export async function completeCareEvent(eventId, { override = false } = {}) {
  const { data } = await api.post(`/care-events/${eventId}/complete`, { override })
  return data.event
}
