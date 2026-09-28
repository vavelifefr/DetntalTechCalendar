import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { currentSchemaVersion, migrateDatabase, openDatabase, seedTestDatabase } from '@dental-tech/persistence-sqlite'

describe('local Fastify API', () => {
  it('reports the API and SQLite schema as ready', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    const app = createApp({ database })

    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        status: 'ok',
        database: 'ok',
        schemaVersion: currentSchemaVersion(database),
      })
    } finally {
      await app.close()
    }
  })

  it('creates Orders from configured required fields and serves deadline data to Calendar', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    seedTestDatabase(database)
    const app = createApp({ database })

    try {
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: { workItems: [{ workType: 'Коронка' }] },
      })
      expect(invalid.statusCode).toBe(400)
      expect(invalid.json()).toMatchObject({ error: 'patientLabel is required' })

      const created = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          patientLabel: 'Новый пациент',
          doctorId: 'demo-doctor-001',
          orderDate: '2026-09-29',
          deadlineAt: '2026-10-01T12:00:00.000Z',
          workItems: [{ workType: 'Коронка', units: 1 }],
        },
      })
      expect(created.statusCode).toBe(201)
      expect(created.json()).toMatchObject({
        patientLabel: 'Новый пациент',
        doctorName: 'Анна Тестова',
        orderDate: '2026-09-29',
        status: 'ACTIVE',
      })
      const orderId = created.json().id as string

      const details = await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })
      expect(details.json().workItems).toHaveLength(1)
      expect(details.json().workItems[0].startedAt).toBeTruthy()

      const invalidDates = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          patientLabel: 'Слишком ранний срок',
          doctorId: 'demo-doctor-001',
          orderDate: '2026-10-05',
          deadlineAt: '2026-10-04T12:00:00.000Z',
          workItems: [{ workType: 'Починка' }],
        },
      })
      expect(invalidDates.statusCode).toBe(400)
      expect(invalidDates.json()).toMatchObject({ error: 'deadlineAt cannot be earlier than orderDate' })

      const expenseResponse = await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/expenses`,
        payload: { amount: 1200, comment: 'Материал' },
      })
      expect(expenseResponse.statusCode).toBe(201)
      const expense = expenseResponse.json() as { id: string }
      const editedExpense = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/expenses/${expense.id}`,
        payload: { amount: 1500, comment: 'Материал и доставка' },
      })
      expect(editedExpense.json()).toMatchObject({ amount: 1500, comment: 'Материал и доставка' })
      expect((await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })).json().financialSummary)
        .toMatchObject({ expenses: 1500, balance: -1500 })
      const deletedExpense = await app.inject({ method: 'DELETE', url: `/api/orders/${orderId}/expenses/${expense.id}` })
      expect(deletedExpense.statusCode).toBe(204)

      const calendar = await app.inject({ method: 'GET', url: '/api/calendar/orders' })
      expect(calendar.json()).toHaveLength(11)
      expect(calendar.json().every((order: { status: string }) => order.status === 'ACTIVE')).toBe(true)
      expect(calendar.json().find((order: { id: string }) => order.id === orderId)).toMatchObject({
        workTypes: ['Коронка'],
        financialSummary: { income: 0, expenses: 0, debt: 0, balance: 0 },
      })
    } finally {
      await app.close()
    }
  })

  it('allows WorkItem status transitions in an active Order without closing the Order', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    seedTestDatabase(database)
    const app = createApp({ database })

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          patientLabel: 'Проверка статуса работы',
          doctorId: 'demo-doctor-001',
          orderDate: '2026-09-24',
          deadlineAt: '2026-10-01T15:00:00.000Z',
          workItems: [{ workType: 'Коронка' }, { workType: 'Починка' }],
        },
      })
      const orderId = created.json().id as string
      const details = await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })
      const [completedItem, cancelledItem] = details.json().workItems as Array<{ id: string; startedAt: string }>

      const completed = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/work-items/${completedItem.id}/status`,
        payload: { status: 'COMPLETED' },
      })
      expect(completed.statusCode).toBe(200)
      expect(completed.json()).toMatchObject({ id: completedItem.id, status: 'COMPLETED' })

      const cancelled = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/work-items/${cancelledItem.id}/status`,
        payload: { status: 'CANCELLED' },
      })
      expect(cancelled.statusCode).toBe(200)
      expect(cancelled.json()).toMatchObject({ id: cancelledItem.id, status: 'CANCELLED' })

      const detail = await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })
      expect(detail.json()).toMatchObject({ status: 'ACTIVE' })
      expect(detail.json().workItems[0]).toMatchObject({ status: 'COMPLETED', startedAt: completedItem.startedAt, cancelledAt: null })
      expect(detail.json().workItems[0].completedAt).toBeTruthy()
      expect(detail.json().workItems[1]).toMatchObject({ status: 'CANCELLED', startedAt: cancelledItem.startedAt, completedAt: null })
      expect(detail.json().workItems[1].cancelledAt).toBeTruthy()

      const reopened = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/work-items/${completedItem.id}/status`,
        payload: { status: 'ACTIVE' },
      })
      expect(reopened.statusCode).toBe(200)
      const reopenedDetail = await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })
      expect(reopenedDetail.json().workItems[0]).toMatchObject({
        status: 'ACTIVE',
        startedAt: completedItem.startedAt,
        completedAt: null,
        cancelledAt: null,
      })

      const invalid = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/work-items/${completedItem.id}/status`,
        payload: { status: 'INVALID' },
      })
      expect(invalid.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('manually closes an Order with a business closure date and a separate debt record', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    seedTestDatabase(database)
    const app = createApp({ database })

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          patientLabel: 'Закрытие через API',
          doctorId: 'demo-doctor-001',
          orderDate: '2026-07-01',
          deadlineAt: '2026-07-20T15:00:00.000Z',
          expenses: [{ amount: 3000, comment: 'Литьё' }],
          workItems: [{ workType: 'Мост', acceptedAmount: 10000 }],
        },
      })
      const orderId = created.json().id as string
      const createdDetails = await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })
      const workItemId = createdDetails.json().workItems[0].id as string
      const completed = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/work-items/${workItemId}/status`,
        payload: { status: 'COMPLETED' },
      })
      expect(completed.statusCode).toBe(200)

      const closed = await app.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/close`,
        payload: {
          closureDate: '2026-08-15',
          mode: 'WITH_DEBT',
          receivedAmount: 4000,
          debtAmount: 6000,
          debtComment: 'Остаток не оплачен',
        },
      })
      expect(closed.statusCode).toBe(200)
      expect(closed.json()).toMatchObject({
        status: 'CLOSED',
        closureDate: '2026-08-15',
        financialSummary: { expectedIncome: 10000, income: 4000, expenses: 3000, debt: 6000, receivedAmount: 4000, balance: 1000 },
      })
      expect((await app.inject({ method: 'GET', url: '/api/orders?status=ACTIVE' })).json())
        .not.toContainEqual(expect.objectContaining({ id: orderId }))
      expect((await app.inject({ method: 'GET', url: '/api/orders?status=CLOSED' })).json())
        .toContainEqual(expect.objectContaining({ id: orderId }))
      expect(database.prepare('SELECT amount, comment FROM order_debts WHERE order_id = ?').get(orderId))
        .toEqual({ amount: 6000, comment: 'Остаток не оплачен' })
      expect((await app.inject({ method: 'GET', url: '/api/archive/orders' })).json())
        .toContainEqual(expect.objectContaining({ id: orderId, status: 'CLOSED', closureDate: '2026-08-15' }))
      expect((await app.inject({ method: 'GET', url: '/api/debts' })).json())
        .toContainEqual(expect.objectContaining({ orderId, amount: 6000, comment: 'Остаток не оплачен' }))
      const statistics = await app.inject({ method: 'GET', url: '/api/statistics?from=2026-08-15&to=2026-08-15' })
      expect(statistics.statusCode).toBe(200)
      expect(statistics.json()).toMatchObject({ orderCount: 1, income: 4000, expenses: 3000, debt: 6000, balance: 1000 })
      const closedOrder = closed.json() as { workItems: Array<{ id: string }>; expenses: Array<{ id: string }> }
      const workItemEdit = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/work-items/${closedOrder.workItems[0].id}/accepted-amount`,
        payload: { acceptedAmount: 12000 },
      })
      expect(workItemEdit.statusCode).toBe(200)
      const expenseEdit = await app.inject({
        method: 'PATCH',
        url: `/api/orders/${orderId}/expenses/${closedOrder.expenses[0].id}`,
        payload: { amount: 3500, comment: 'Исправленный расход' },
      })
      expect(expenseEdit.statusCode).toBe(200)
      expect((await app.inject({ method: 'GET', url: '/api/statistics?from=2026-08-15&to=2026-08-15' })).json())
        .toMatchObject({ income: 4000, expenses: 3000, balance: 1000 })
      const recalculated = await app.inject({
        method: 'POST',
        url: '/api/statistics/recalculate',
        payload: { fromDate: '2026-08-15', toDate: '2026-08-15' },
      })
      expect(recalculated.statusCode).toBe(200)
      expect(recalculated.json()).toEqual({ orderCount: 1 })
      expect((await app.inject({ method: 'GET', url: '/api/statistics?from=2026-08-15&to=2026-08-15' })).json())
        .toMatchObject({ income: 4000, receivedAmount: 4000, expenses: 3500, debt: 6000, balance: 500 })
    } finally {
      await app.close()
    }
  })

  it('exports and selectively imports JSON data without replacing other datasets', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    seedTestDatabase(database)
    const app = createApp({ database })

    try {
      const exported = await app.inject({ method: 'GET', url: '/api/export/pricing' })
      expect(exported.statusCode).toBe(200)
      expect(exported.json().items).toHaveLength(26)

      const replacement = {
        format: 'dental-tech-calendar',
        dataset: 'doctor-directory',
        formatVersion: 1,
        doctors: [{ id: 'new-doctor', firstName: 'Тест', lastName: 'Импорт', phone: '', comment: '', active: true }],
      }
      const imported = await app.inject({ method: 'POST', url: '/api/import', payload: replacement })
      expect(imported.statusCode).toBe(200)
      expect(imported.json().count).toBe(1)
      expect((await app.inject({ method: 'GET', url: '/api/doctors' })).json()).toHaveLength(1)
      expect((await app.inject({ method: 'GET', url: '/api/pricing' })).json()).toHaveLength(26)
      expect((await app.inject({ method: 'GET', url: '/api/orders?status=CLOSED' })).json()).toHaveLength(20)
    } finally {
      await app.close()
    }
  })

  it('uses the fresh-database required-field defaults in Settings', async () => {
    const database = openDatabase(':memory:')
    migrateDatabase(database)
    const app = createApp({ database })

    try {
      const settings = await app.inject({ method: 'GET', url: '/api/settings' })
      expect(settings.json().requiredFields).toEqual([
        { fieldKey: 'deadline_at', required: true },
        { fieldKey: 'doctor_id', required: true },
        { fieldKey: 'patient_label', required: true },
      ])
      const saved = await app.inject({
        method: 'PUT',
        url: '/api/settings/required-fields',
        payload: { requiredFields: [
          { fieldKey: 'patient_label', required: false },
          { fieldKey: 'doctor_id', required: false },
          { fieldKey: 'deadline_at', required: false },
        ] },
      })
      expect(saved.statusCode).toBe(200)
      const created = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: { workItems: [{ workType: 'Свободная работа' }] },
      })
      expect(created.statusCode).toBe(201)
      expect(created.json()).toMatchObject({ patientLabel: null, doctorId: null, deadlineAt: null })
    } finally {
      await app.close()
    }
  })
})
