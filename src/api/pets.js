import { api } from './client.js'

export async function listPets(householdId) {
  const { data } = await api.get('/pets', { params: householdId ? { householdId } : {} })
  return data.pets
}

export async function getPet(petId) {
  const { data } = await api.get(`/pets/${petId}`)
  return data.pet
}

export async function createPet(values) {
  const { data } = await api.post('/pets', values)
  return data.pet
}

export async function updatePet(petId, values) {
  const { data } = await api.patch(`/pets/${petId}`, values)
  return data.pet
}

export async function removePet(petId) {
  await api.delete(`/pets/${petId}`)
}

export async function uploadPetPhoto(petId, file) {
  const form = new FormData()
  form.append('photo', file)
  const { data } = await api.post(`/pets/${petId}/photo`, form)
  return data.pet
}
