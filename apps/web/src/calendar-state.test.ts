import { describe, expect, it } from 'vitest'
import {
  getDeadlinePresentation,
  getOpenCalendarOrders,
  getOrdersDueOnDate,
  summarizeCalendarOrders,
  type CalendarOrder,
} from './calendar-state.ts'

describe('getDeadlinePresentation', () => {
  const todayAtNoon = new Date(2026, 8, 24, 12)

  it('marks an active deadline later today as due today', () => {
    const deadline = new Date(2026, 8, 24, 18).toISOString()

    expect(getDeadlinePresentation(deadline, 'ACTIVE', todayAtNoon)).toEqual({
      dueToday: true,
      overdue: false,
    })
  })

  it('marks a passed active deadline as overdue', () => {
    const deadline = new Date(2026, 8, 23, 18).toISOString()

    expect(getDeadlinePresentation(deadline, 'ACTIVE', todayAtNoon)).toEqual({
      dueToday: false,
      overdue: true,
    })
  })

  it('keeps the due-today indication when an active deadline has passed today', () => {
    const deadline = new Date(2026, 8, 24, 9).toISOString()

    expect(getDeadlinePresentation(deadline, 'ACTIVE', todayAtNoon)).toEqual({
      dueToday: true,
      overdue: true,
    })
  })

  it('does not mark an inactive Order as overdue', () => {
    const deadline = new Date(2026, 8, 23, 18).toISOString()

    expect(getDeadlinePresentation(deadline, 'CLOSED', todayAtNoon)).toEqual({
      dueToday: false,
      overdue: false,
    })
  })

  it('does not classify an invalid deadline', () => {
    expect(getDeadlinePresentation('not-a-date', 'ACTIVE', todayAtNoon)).toEqual({
      dueToday: false,
      overdue: false,
    })
  })
})

describe('Calendar order lists', () => {
  const orders: CalendarOrder[] = [
    {
      id: 'due', label: 'Пациент по сроку', patientLabel: 'Пациент по сроку', doctorName: 'Анна',
      deadlineAt: new Date(2026, 8, 24, 12).toISOString(), status: 'ACTIVE', workTypes: ['Коронка'],
      financialSummary: { income: 10000, expenses: 1500, balance: 8500 },
    },
    {
      id: 'another-day', label: 'Другой день', deadlineAt: new Date(2026, 8, 25, 12).toISOString(), status: 'ACTIVE',
      financialSummary: { income: 2000, expenses: 500, balance: 1500 },
    },
    { id: 'closed', label: 'Закрыт', deadlineAt: new Date(2026, 8, 24, 10).toISOString(), status: 'CLOSED' },
    { id: 'no-deadline', label: 'Без срока', deadlineAt: null, status: 'ACTIVE' },
  ]

  it('shows all open Orders without a selected date and keeps Orders without a deadline', () => {
    expect(getOpenCalendarOrders(orders).map((order) => order.id)).toEqual(['due', 'another-day', 'no-deadline'])
  })

  it('matches only open Orders with an exact local deadline date', () => {
    expect(getOrdersDueOnDate(orders, '2026-09-24').map((order) => order.id)).toEqual(['due'])
  })

  it('sums selected-day income and expenses without debt', () => {
    expect(summarizeCalendarOrders(getOrdersDueOnDate(orders, '2026-09-24'))).toEqual({
      count: 1,
      income: 10000,
      expenses: 1500,
      balance: 8500,
    })
  })
})
