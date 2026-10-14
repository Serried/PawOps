import { describe, expect, it } from 'vitest'
import {
  displayStatus,
  duplicateWarningMessage,
  formatElapsed,
  isWithinDuplicateWindow,
  needsDuplicateCheck,
} from '../../server/services/care-rules.js'

const at = (time) => new Date(`2026-10-09T${time}:00+07:00`)

describe('BR-03 duplicate window', () => {
  it('checks feeding and medication only', () => {
    expect(needsDuplicateCheck('feeding')).toBe(true)
    expect(needsDuplicateCheck('medication')).toBe(true)
    expect(needsDuplicateCheck('walk')).toBe(false)
    expect(needsDuplicateCheck('water')).toBe(false)
  })

  it('treats an event 5 minutes earlier as inside a 30 minute window', () => {
    expect(isWithinDuplicateWindow(at('18:00'), at('18:05'), 30)).toBe(true)
  })

  it('treats the exact window boundary as outside', () => {
    expect(isWithinDuplicateWindow(at('18:00'), at('18:30'), 30)).toBe(false)
  })

  it('ignores events in the future', () => {
    expect(isWithinDuplicateWindow(at('18:10'), at('18:05'), 30)).toBe(false)
  })
})

describe('displayStatus (BR-04, overdue derivation)', () => {
  it('keeps done events done even long after their time', () => {
    expect(displayStatus({ status: 'done', scheduledAt: at('08:00') }, at('23:00'), 15)).toBe('done')
  })

  it('is upcoming before the grace period ends', () => {
    expect(displayStatus({ status: 'upcoming', scheduledAt: at('18:00') }, at('18:15'), 15)).toBe(
      'upcoming',
    )
  })

  it('becomes overdue after the grace period', () => {
    expect(displayStatus({ status: 'upcoming', scheduledAt: at('18:00') }, at('18:16'), 15)).toBe(
      'overdue',
    )
  })
})

describe('duplicate warning text (AC-03)', () => {
  it('names the pet, the elapsed time and who did it', () => {
    expect(
      duplicateWarningMessage({
        type: 'feeding',
        petName: 'Mochi',
        completedAt: at('18:00'),
        completedByName: 'Tanakrit',
        now: at('18:05'),
      }),
    ).toBe('Mochi was fed 5 minutes ago by Tanakrit')
  })

  it('formats short durations', () => {
    expect(formatElapsed(at('18:00'), at('18:00'))).toBe('just now')
    expect(formatElapsed(at('18:00'), at('18:01'))).toBe('1 minute ago')
    expect(formatElapsed(at('17:00'), at('18:10'))).toBe('1 hour ago')
  })
})
