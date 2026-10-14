import axios from 'axios'

// Auth uses Member 1's httpOnly session cookie (sent automatically)
export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Reads both error formats: { error: {...} } (Pet & Care) and { error: "..." } (Member 1)
export function apiError(error) {
  if (error?.code && error?.message && 'fields' in error) return error
  const response = error?.response
  const raw = response?.data?.error
  const body = typeof raw === 'string' ? { message: raw } : raw
  let message = body?.message
  if (!message) {
    // No JSON body: the API is not reachable
    message =
      !response || response.status >= 500
        ? 'Cannot reach the API server. Check the terminal running "npm run dev" and the database.'
        : 'Something went wrong. Please try again.'
  }
  return {
    status: response?.status ?? null,
    code: body?.code ?? (response ? 'HTTP_ERROR' : 'NETWORK_ERROR'),
    message,
    details: body?.details ?? null,
    fields: body?.details?.fields ?? {},
  }
}
