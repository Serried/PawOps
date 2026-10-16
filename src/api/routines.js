import { api } from './client.js'

export async function listRoutines(householdId) {
  const { data } = await api.get('/routines', { params: { householdId } })
  return data.routines
}

export async function createRoutine(values) {
  const { data } = await api.post('/routines', values)
  return data.routine
}

export async function updateRoutine(routineId, values) {
  const { data } = await api.patch(`/routines/${routineId}`, values)
  return data.routine
}

export function setRoutineActive(routineId, active) {
  return updateRoutine(routineId, { active })
}

export async function deleteRoutine(routineId) {
  await api.delete(`/routines/${routineId}`)
}
