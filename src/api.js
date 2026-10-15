import { api as client, apiError } from './api/client.js'

// Compatibility wrapper for Member 1 screens. All requests now share normalization/session handling.
export async function api(path, body) {
  try {
    const response = body === undefined
      ? await client.get(`/${path}`)
      : await client.post(`/${path}`, body)
    return response.data || {}
  } catch (error) {
    throw apiError(error)
  }
}
