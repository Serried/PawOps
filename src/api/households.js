import { api } from './client.js'

export function displayName(user) {
  return user?.display_name?.trim() || String(user?.email ?? '').split('@')[0]
}

export async function listMembers(householdId) {
  const { data } = await api.get(`/households/${householdId}/members`)
  return data.members.map((member) => ({
    id: Number(member.id),
    name: displayName(member),
    email: member.email,
    role: member.role,
  }))
}
