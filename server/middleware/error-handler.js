import multer from 'multer'
import { HttpError } from '../lib/http-error.js'

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, request, response, _next) {
  if (error instanceof HttpError) {
    return response.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    })
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller' : error.message
    return response.status(400).json({ error: { code: 'INVALID_UPLOAD', message } })
  }

  if (error?.type === 'entity.parse.failed') {
    return response
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } })
  }

  // Errors raised by Express itself (static 404, body too large)
  const status = error?.status ?? error?.statusCode
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return response
      .status(status)
      .json({ error: { code: 'REQUEST_ERROR', message: error.expose ? error.message : 'Bad request' } })
  }

  // Tables missing: migrations were not run
  if (error?.code === '42P01') {
    console.error(`[api] ${request.method} ${request.originalUrl}: ${error.message} — run "npm run db:migrate"`)
    return response.status(503).json({
      error: {
        code: 'DATABASE_NOT_MIGRATED',
        message: 'The database is not set up yet. Run "npm run db:migrate" and "npm run db:seed".',
      },
    })
  }

  console.error(`[api] ${request.method} ${request.originalUrl} failed`, error)
  return response
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
}

export function apiNotFound(request, response) {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.path}` },
  })
}

// Member 1's original handler, kept for their routes
// eslint-disable-next-line no-unused-vars
export function memberOneErrorHandler(error, _request, response, _next) {
  const status = error.status === 400 || error.status === 413 ? error.status : 500
  if (status === 500) console.error('API request failed', error)
  response.status(status).json({
    error: status === 500 ? 'Something went wrong. Please try again.' : 'Invalid request body.',
  })
}
