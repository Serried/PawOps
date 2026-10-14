import { badRequest } from './http-error.js'

export class Validator {
  constructor(body) {
    this.body = body && typeof body === 'object' ? body : {}
    this.errors = {}
    this.values = {}
  }

  has(field) {
    return Object.prototype.hasOwnProperty.call(this.body, field)
  }

  fail(field, message) {
    this.errors[field] = message
  }

  string(field, { required = false, max = 255, as = field } = {}) {
    if (!this.has(field) || this.body[field] === null || this.body[field] === '') {
      if (required) this.fail(field, 'is required')
      else if (this.has(field)) this.values[as] = null
      return this
    }
    const value = this.body[field]
    if (typeof value !== 'string') return this.fail(field, 'must be text'), this
    const trimmed = value.trim()
    if (required && trimmed === '') return this.fail(field, 'is required'), this
    if (trimmed.length > max) return this.fail(field, `must be at most ${max} characters`), this
    this.values[as] = trimmed === '' ? null : trimmed
    return this
  }

  oneOf(field, allowed, { required = false, as = field } = {}) {
    if (!this.has(field) || this.body[field] === null || this.body[field] === '') {
      if (required) this.fail(field, 'is required')
      return this
    }
    if (!allowed.includes(this.body[field])) {
      this.fail(field, `must be one of: ${allowed.join(', ')}`)
      return this
    }
    this.values[as] = this.body[field]
    return this
  }

  number(field, { min, max, as = field } = {}) {
    if (!this.has(field)) return this
    const raw = this.body[field]
    if (raw === null || raw === '') {
      this.values[as] = null
      return this
    }
    const value = typeof raw === 'string' ? Number(raw) : raw
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(field, 'must be a number')
    } else if (min !== undefined && value <= min) {
      this.fail(field, `must be greater than ${min}`)
    } else if (max !== undefined && value > max) {
      this.fail(field, `must be at most ${max}`)
    } else {
      this.values[as] = value
    }
    return this
  }

  pastDate(field, { as = field } = {}) {
    if (!this.has(field)) return this
    const raw = this.body[field]
    if (raw === null || raw === '') {
      this.values[as] = null
      return this
    }
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      this.fail(field, 'must be a date in YYYY-MM-DD format')
      return this
    }
    const date = new Date(`${raw}T00:00:00Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
      this.fail(field, 'is not a valid date')
    } else if (date.getTime() > Date.now()) {
      this.fail(field, 'cannot be in the future')
    } else {
      this.values[as] = raw
    }
    return this
  }

  timestamp(field, { required = false, as = field } = {}) {
    if (!this.has(field) || this.body[field] === null || this.body[field] === '') {
      if (required) this.fail(field, 'is required')
      return this
    }
    const raw = this.body[field]
    const date = typeof raw === 'string' ? new Date(raw) : null
    if (!date || Number.isNaN(date.getTime())) {
      this.fail(field, 'must be an ISO date-time')
    } else {
      this.values[as] = date.toISOString()
    }
    return this
  }

  id(field, { required = false, as = field } = {}) {
    if (!this.has(field) || this.body[field] === null || this.body[field] === '') {
      if (required) this.fail(field, 'is required')
      else if (this.has(field)) this.values[as] = null
      return this
    }
    const value = toId(this.body[field])
    if (value === null) this.fail(field, 'must be a positive integer id')
    else this.values[as] = value
    return this
  }

  idList(field, { as = field, max = 50 } = {}) {
    if (!this.has(field)) return this
    const raw = this.body[field]
    if (!Array.isArray(raw)) return this.fail(field, 'must be a list of ids'), this
    if (raw.length > max) return this.fail(field, `must contain at most ${max} ids`), this
    const ids = raw.map(toId)
    if (ids.some((value) => value === null)) {
      this.fail(field, 'must contain only positive integer ids')
    } else {
      this.values[as] = [...new Set(ids)]
    }
    return this
  }

  boolean(field, { as = field, fallback = false } = {}) {
    if (!this.has(field)) {
      this.values[as] = fallback
      return this
    }
    if (typeof this.body[field] !== 'boolean') this.fail(field, 'must be true or false')
    else this.values[as] = this.body[field]
    return this
  }

  result() {
    if (Object.keys(this.errors).length > 0) {
      throw badRequest('Please check the highlighted fields', { fields: this.errors })
    }
    return this.values
  }
}

export function toId(value) {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !/^[1-9]\d{0,15}$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) ? id : null
}

export function paramId(value, label = 'Resource') {
  const id = toId(value)
  if (id === null) throw badRequest(`Invalid ${label.toLowerCase()} ID.`)
  return id
}
