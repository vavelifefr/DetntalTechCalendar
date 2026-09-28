import { describe, expect, it } from 'vitest'
import { formatLocalDate, formatLocalNumericDate } from './date-display.ts'

describe('local date display', () => {
  it('formats an ISO timestamp using the local calendar day', () => {
    const timestamp = '2026-09-25T22:00:00.000Z'
    const originalTimeZone = process.env.TZ
    process.env.TZ = 'Europe/Moscow'
    try {
      const localDate = new Date(timestamp)
      const expectedNumeric = `${String(localDate.getDate()).padStart(2, '0')}.${String(localDate.getMonth() + 1).padStart(2, '0')}.${localDate.getFullYear()}`
      const expectedLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(localDate)

      expect(expectedNumeric).toBe('26.09.2026')
      expect(formatLocalNumericDate(timestamp)).toBe(expectedNumeric)
      expect(formatLocalDate(timestamp)).toBe(expectedLong)
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
    }
  })

  it('keeps a date-only value on its calendar day', () => {
    const dateOnly = '2026-09-26'
    const localDate = new Date(2026, 8, 26, 12)
    const expectedLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(localDate)

    expect(formatLocalDate(dateOnly)).toBe(expectedLong)
    expect(formatLocalNumericDate(dateOnly)).toBe('26.09.2026')
  })
})
