import { describe, expect, it } from 'vitest'
import { parseIsoTimestamp } from '../../server/lib/timestamp.js'

describe('strict ISO timestamps', () => {
  it.each([
    '2026-02-30T12:00:00+07:00', '2025-02-29T00:00:00Z', '2026-04-31T00:00:00Z',
    '2026-00-01T00:00:00Z', '2026-01-00T00:00:00Z', '0000-01-01T00:00:00Z',
    '2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z', '2026-01-01T12:00:60Z',
    '2026-01-01T12:00:00+24:00', '2026-01-01T12:00:00+07:60',
    '2026-01-01T12:00:00', '2026-01-01', 'March 2, 2026', null,
  ])('rejects invalid or ambiguous timestamp %s', value => {
    expect(parseIsoTimestamp(value)).toBeNull()
  })
  it('preserves real leap days and correctly converts explicit offsets', () => {
    expect(parseIsoTimestamp('2024-02-29T12:00:00+07:00')).toBe('2024-02-29T05:00:00.000Z')
    expect(parseIsoTimestamp('2000-02-29T00:30:00-01:00')).toBe('2000-02-29T01:30:00.000Z')
    expect(parseIsoTimestamp('2026-11-12T12:00:00.123Z')).toBe('2026-11-12T12:00:00.123Z')
  })
})
