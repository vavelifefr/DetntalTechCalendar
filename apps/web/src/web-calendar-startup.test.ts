import { describe, expect, it } from 'vitest'
import type { CreateOrderCommand } from '@dental-tech/application'
import { createWebCalendarStartupPort } from './web-calendar-startup.ts'

describe('web Calendar startup adapter', () => {
  it('loads the active Calendar data from the local API and accepts an empty Calendar', async () => {
    const doctors = [{ id: 'doctor-1', firstName: 'Анна', lastName: 'Тестова', phone: '', comment: '', active: true }]
    const colors = [{ id: 'color-1', name: 'A1', active: true }]
    const expenseCategories = [{ id: 'expense-category-1', name: 'Литьё', active: true }]
    const pricingItems = [{
      id: 'price-1', name: 'Коронка', calculationMode: 'PER_UNIT', unitPrice: 1000,
      fixedPrice: null, active: true, metadata: {}, updatedAt: '2026-09-24T00:00:00.000Z',
    }]
    const payloads: Record<string, unknown> = {
      '/api/health': { status: 'ok', database: 'ok', schemaVersion: 10 },
      '/api/calendar/orders': [],
      '/api/doctors': doctors,
      '/api/colors': colors,
      '/api/expense-categories': expenseCategories,
      '/api/pricing': pricingItems,
      '/api/settings': { requiredFields: [{ fieldKey: 'doctor_id', required: true }], values: {} },
    }
    const requestedUrls: string[] = []
    const request = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return new Response(JSON.stringify(payloads[String(input)]))
    }) as typeof fetch

    const result = await createWebCalendarStartupPort(request).loadStartupSnapshot()

    expect(result).toEqual({
      orders: [],
      doctors,
      colors,
      expenseCategories,
      pricingItems,
      requiredFields: [{ fieldKey: 'doctor_id', required: true }],
    })
    expect(requestedUrls).toEqual([
      '/api/health',
      '/api/calendar/orders',
      '/api/doctors',
      '/api/colors',
      '/api/expense-categories',
      '/api/pricing',
      '/api/settings',
    ])
  })

  it('reports an unavailable local database clearly', async () => {
    const requestedUrls: string[] = []
    const request = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input))
      return new Response(JSON.stringify({ status: 'ok', database: 'down' }))
    }) as typeof fetch

    await expect(createWebCalendarStartupPort(request).loadStartupSnapshot())
      .rejects.toThrow('Локальная база данных недоступна.')
    expect(requestedUrls).toEqual(['/api/health'])
  })

  it('creates a New Order through the local web adapter', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response(JSON.stringify({ id: 'created-order' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const command = {
      patientLabel: 'Пациент 1',
      doctorId: 'doctor-1',
      orderDate: '2026-09-24',
      deadlineAt: '2026-09-25T14:00:00.000Z',
      expenses: [],
      workItems: [{
        pricingItemId: 'price-1', workType: 'Коронка', unitMode: 'TOOTH_COUNT', units: 1,
        toothCodes: ['11'], acceptedAmount: 1000, comment: null,
      }],
    } satisfies CreateOrderCommand

    await createWebCalendarStartupPort(request).createOrder(command)

    expect(calls).toEqual([{
      url: '/api/orders',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
      },
    }])
  })

  it('returns the API validation message when New Order creation fails', async () => {
    const request = (async () => new Response(JSON.stringify({ error: 'patientLabel is required' }), { status: 400 })) as typeof fetch

    await expect(createWebCalendarStartupPort(request).createOrder({
      workItems: [{ workType: 'Коронка' }],
    })).rejects.toThrow('patientLabel is required')
  })
})
