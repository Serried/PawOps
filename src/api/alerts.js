import { api } from './client.js'

export async function listAlerts({ householdId, status = 'all' } = {}) {
  const { data } = await api.get('/alerts', { params: { householdId, status } })
  return data.alerts
}

export async function acknowledgeAlert(alertId) {
  const { data } = await api.post(`/alerts/${alertId}/acknowledge`)
  return data.alert
}
