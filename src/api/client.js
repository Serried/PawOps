import axios from 'axios'

export const SESSION_EXPIRED_EVENT = 'pawops:session-expired'

// Auth uses Member 1's httpOnly session cookie (sent automatically)
export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/me']

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const path = error?.config?.url ?? ''
    if (
      error?.response?.status === 401 &&
      !PUBLIC_AUTH_PATHS.some((publicPath) => path.endsWith(publicPath)) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    }
    return Promise.reject(error)
  },
)

// Reads both error formats: { error: {...} } (Pet & Care) and { error: "..." } (Member 1)
export function apiError(error) {
  if (error?.isApiError) return error
  const response = error?.response
  const raw = response?.data?.error
  const body = typeof raw === 'string' ? { message: raw } : raw
  const status = response?.status ?? null
  const fallbackCode = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    429: 'RATE_LIMITED',
  }[status]

  let message = body?.message
  if (!response) message = 'Unable to connect to PawOps. Check your connection and try again.'
  else if (status >= 500) message = 'Something went wrong while contacting PawOps. Please try again.'
  else if (!message) message = 'Something went wrong. Please try again.'

  return {
    isApiError: true,
    status,
    code: body?.code ?? fallbackCode ?? (response ? 'HTTP_ERROR' : 'NETWORK_ERROR'),
    message,
    details: body?.details ?? null,
    fields: body?.details?.fields ?? {},
  }
}

export function isRecoverableError(error) {
  return error?.code === 'NETWORK_ERROR' || error?.status >= 500
}
