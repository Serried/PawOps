import { api } from './client.js'

export async function getAlertsPage({ householdId, status = 'all', limit = 100, offset = 0 } = {}) {
  const { data } = await api.get('/alerts', { params: { householdId, status, limit, offset } })
  return data
}

export async function listAlerts(filters = {}) {
  return (await getAlertsPage(filters)).alerts
}

export async function acknowledgeAlert(alertId) {
  const { data } = await api.post(`/alerts/${alertId}/acknowledge`)
  return data.alert
}
