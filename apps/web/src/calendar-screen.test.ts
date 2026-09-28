import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ApplicationPort } from '@dental-tech/application'
import { CalendarScreen } from './CalendarScreen.tsx'

const applicationPort = { createOrder: async () => undefined } as unknown as ApplicationPort

describe('CalendarScreen', () => {
  it('renders due-today and overdue states for supplied active Orders', () => {
    const today = new Date()
    const dueToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59).toISOString()
    const overdue = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12).toISOString()

    const markup = renderToStaticMarkup(createElement(CalendarScreen, {
      orders: [
        {
          id: 'due-today', label: 'Срок сегодня', patientLabel: 'Пациент сегодня', doctorName: 'Анна',
          deadlineAt: dueToday, status: 'ACTIVE', workTypes: ['Коронка'],
          financialSummary: { income: 10000, expenses: 1000, balance: 9000 },
        },
        { id: 'overdue', label: 'Срок прошёл', deadlineAt: overdue, status: 'ACTIVE' },
      ],
      applicationPort,
    }))

    expect(markup).toContain('calendar-order-chip--due-today')
    expect(markup).toContain('calendar-order-chip--overdue')
    expect(markup).toContain('Сегодня')
    expect(markup).toContain('Просрочено')
    expect(markup).toContain('Сводка по текущим заказам')
    expect(markup).toContain('Пациент сегодня')
    expect(markup).toContain('Врач: Анна')
    expect(markup).toContain('Работы: Коронка')
    expect(markup).toContain('Сальдо:')
  })

  it('keeps the empty Calendar empty and hides New Order until a date is selected', () => {
    const markup = renderToStaticMarkup(createElement(CalendarScreen, { applicationPort }))

    expect(markup).toContain('Открытых заказов пока нет.')
    expect(markup).not.toContain('calendar-new-order-cta')
    expect(markup).not.toContain('Новый заказ')
    expect(markup).not.toContain('calendar-order-chip')
  })
})
