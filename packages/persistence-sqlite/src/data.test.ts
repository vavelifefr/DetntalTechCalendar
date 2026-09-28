import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addOrderExpense,
  addOrderDebtPayment,
  closeOrder,
  createOrder,
  exportDoctorDirectory,
  exportFullDatabase,
  exportPricing,
  forgiveOrderDebt,
  getOrderStatistics,
  getDoctors,
  getOrder,
  getPricing,
  importDataset,
  listOrders,
  listCalendarOrders,
  listArchivedOrders,
  listDebts,
  migrateDatabase,
  openDatabase,
  replacePricing,
  restoreFullDatabase,
  removeOrderExpense,
  recalculateOrderFinancials,
  removeOrder,
  seedTestDatabase,
  setWorkItemStatus,
  updateOrderExpense,
  updateAcceptedWorkItemAmount,
  updateWorkItem,
  type SqliteDatabase,
} from './index.ts'

const fixturePath = (fileName: string) => join(process.cwd(), 'database', 'fixtures', fileName)
const doctorsFixture = JSON.parse(readFileSync(fixturePath('doctors.demo.json'), 'utf8')) as Record<string, unknown>
const pricingFixture = JSON.parse(readFileSync(fixturePath('pricing.demo.json'), 'utf8')) as Record<string, unknown>
const legacyFullDatabaseFixture = JSON.parse(readFileSync(fixturePath('database.demo.json'), 'utf8')) as {
  schemaVersion: number
  database: {
    workItems: Array<{ id: string; order_id: string; tooth_codes: string | null }>
  }
}

describe('SQLite product data', () => {
  let database: SqliteDatabase | undefined

  afterEach(() => {
    database?.close()
    database = undefined
  })

  function createSeededDatabase() {
    database = openDatabase(':memory:')
    migrateDatabase(database)
    seedTestDatabase(database)
    return database
  }

  it('validates required fields and creates an Order with a started WorkItem', () => {
    const db = createSeededDatabase()
    expect(() => createOrder(db, { workItems: [{ workType: 'Коронка' }] })).toThrow('patientLabel is required')
    expect(() => createOrder(db, {
      patientLabel: 'Тестовый пациент',
      doctorId: 'demo-doctor-001',
      workItems: [{ workType: 'Коронка' }],
    })).toThrow('deadlineAt is required')

    const order = createOrder(db, {
      patientLabel: 'Тестовый пациент',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-09-29',
      deadlineAt: '2026-10-01T15:00:00.000Z',
      workItems: [{ workType: 'Коронка', pricingItemId: 'demo-price-001', units: 2 }],
    })

    expect(order.status).toBe('ACTIVE')
    expect(order.orderDate).toBe('2026-09-29')
    expect(order.doctorName).toBe('Анна Тестова')
    const item = db.prepare('SELECT started_at, unit_price_snapshot, total_price_snapshot FROM work_items WHERE order_id = ?').get(order.id)
    expect(item).toMatchObject({ unit_price_snapshot: null, total_price_snapshot: null })
    expect((item as { started_at: string }).started_at).toBeTruthy()
  })

  it('rejects a deadline earlier than the Order acceptance date', () => {
    const db = createSeededDatabase()
    expect(() => createOrder(db, {
      patientLabel: 'Заказ с некорректным сроком',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-10-05',
      deadlineAt: '2026-10-04T14:00:00.000Z',
      workItems: [{ workType: 'Коронка' }],
    })).toThrow('deadlineAt cannot be earlier than orderDate')

    const oneDayOrder = createOrder(db, {
      patientLabel: 'Однодневный заказ',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-10-05',
      deadlineAt: '2026-10-05T14:00:00.000Z',
      workItems: [{ workType: 'Починка' }],
    })
    expect(oneDayOrder.orderDate).toBe('2026-10-05')
  })

  it('provides Calendar rows with WorkItems and provisional income, expenses, and balance', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Календарная сводка',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-09-24',
      deadlineAt: '2026-10-01T15:00:00.000Z',
      expenses: [{ amount: 200, comment: 'Материал' }],
      workItems: [
        { workType: 'Коронка', acceptedAmount: 1000 },
        { workType: 'Починка', acceptedAmount: 300 },
      ],
    })

    expect(listCalendarOrders(db).find((entry) => entry.id === order.id)).toMatchObject({
      patientLabel: 'Календарная сводка',
      doctorName: 'Анна Тестова',
      workTypes: ['Коронка', 'Починка'],
      financialSummary: { income: 1300, expenses: 200, debt: 0, balance: 1100 },
    })
  })

  it('tracks WorkItem completion and cancellation dates without closing or accounting for the Order', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Статусы работ',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-09-24',
      deadlineAt: '2026-10-01T15:00:00.000Z',
      workItems: [{ workType: 'Коронка', acceptedAmount: 12000 }, { workType: 'Починка', acceptedAmount: 3000 }],
    })
    const initialItems = getOrder(db, order.id)!.workItems
    const completedItem = initialItems.find((item) => item.workType === 'Коронка')!
    const cancelledItem = initialItems.find((item) => item.workType === 'Починка')!

    setWorkItemStatus(db, order.id, completedItem.id, 'COMPLETED')
    setWorkItemStatus(db, order.id, cancelledItem.id, 'CANCELLED')

    const updated = getOrder(db, order.id)!
    expect(updated.status).toBe('ACTIVE')
    expect(updated.workItems[0]).toMatchObject({ status: 'COMPLETED', startedAt: completedItem.startedAt, cancelledAt: null })
    expect(updated.workItems[0].completedAt).toBeTruthy()
    expect(updated.workItems[1]).toMatchObject({ status: 'CANCELLED', startedAt: cancelledItem.startedAt, completedAt: null })
    expect(updated.workItems[1].cancelledAt).toBeTruthy()
    expect(updated.financialSummary).toMatchObject({ expectedIncome: 12000, income: 0, expenses: 0, balance: 0 })

    setWorkItemStatus(db, order.id, completedItem.id, 'CANCELLED')
    const changedToCancelled = getOrder(db, order.id)!.workItems[0]
    expect(changedToCancelled).toMatchObject({ status: 'CANCELLED', startedAt: completedItem.startedAt, completedAt: null })
    expect(changedToCancelled.cancelledAt).toBeTruthy()

    setWorkItemStatus(db, order.id, completedItem.id, 'ACTIVE')
    const reopened = getOrder(db, order.id)!.workItems[0]
    expect(reopened).toMatchObject({ status: 'ACTIVE', startedAt: completedItem.startedAt, completedAt: null, cancelledAt: null })

    setWorkItemStatus(db, order.id, completedItem.id, 'COMPLETED')
    const completedAgain = getOrder(db, order.id)!.workItems[0]
    expect(completedAgain).toMatchObject({ status: 'COMPLETED', startedAt: completedItem.startedAt, cancelledAt: null })
    expect(completedAgain.completedAt).toBeTruthy()
  })

  it('does not persist calculated WorkItem hints and sums editable Order expenses', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Финансовая проверка',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-10-01',
      deadlineAt: '2026-10-08T14:00:00.000Z',
      expenses: [{ amount: 1200, comment: 'Материал' }],
      workItems: [{
        workType: 'Коронка циркониевая',
        pricingItemId: 'demo-price-001',
        unitMode: 'TOOTH_COUNT',
        toothCodes: ['11', '12'],
        acceptedAmount: 25000,
      }],
    })
    const item = getOrder(db, order.id)!.workItems[0]
    expect(item).not.toHaveProperty('totalPriceSnapshot')
    expect(item.acceptedAmount).toBe(25000)
    const additionalExpense = addOrderExpense(db, order.id, { amount: 500 })
    updateOrderExpense(db, order.id, additionalExpense.id, { amount: 350, comment: 'Доставка' })
    updateWorkItem(db, order.id, item.id, {
      pricingItemId: 'demo-price-001',
      workType: 'Коронка циркониевая',
      unitMode: 'TOOTH_COUNT',
      toothCodes: ['11', '12', '13'],
      acceptedAmount: 35000,
    })
    removeOrderExpense(db, order.id, additionalExpense.id)

    const updated = getOrder(db, order.id)!
    expect(updated.workItems[0]).toMatchObject({ units: 3, acceptedAmount: 35000 })
    expect(updated.workItems[0]).not.toHaveProperty('totalPriceSnapshot')
    expect(updated.expenses).toHaveLength(1)
    expect(updated.financialSummary).toMatchObject({ expectedIncome: 0, income: 0, expenses: 1200, debt: 0, receivedAmount: 0, balance: -1200 })

    const backup = exportFullDatabase(db)
    const restored = openDatabase(':memory:')
    migrateDatabase(restored)
    try {
      restoreFullDatabase(restored, backup)
      expect(getOrder(restored, order.id)?.workItems[0].acceptedAmount).toBe(35000)
      const restoredExpense = getOrder(restored, order.id)?.expenses[0]
      expect(restoredExpense).toMatchObject({
        id: updated.expenses[0].id,
        amount: 1200,
        name: 'Расход',
        unitPrice: 1200,
        quantity: 1,
        comment: 'Материал',
      })
      expect(getOrder(restored, order.id)?.financialSummary).toMatchObject(updated.financialSummary)
    } finally {
      restored.close()
    }
  })

  it('closes an Order with debt using its business date and writes the final financial snapshot', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Закрытие с долгом',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-07-01',
      deadlineAt: '2026-07-20T15:00:00.000Z',
      expenses: [{ amount: 3000, comment: 'Литьё и доставка' }],
      workItems: [{ workType: 'Мост', acceptedAmount: 10000 }],
    })
    const workItem = getOrder(db, order.id)!.workItems[0]
    setWorkItemStatus(db, order.id, workItem.id, 'COMPLETED')

    const closed = closeOrder(db, order.id, {
      closureDate: '2026-08-15',
      mode: 'WITH_DEBT',
      receivedAmount: 4000,
      debtAmount: 6000,
      debtComment: 'Пациент отказался доплатить',
    })

    expect(closed).toMatchObject({ status: 'CLOSED', closureDate: '2026-08-15' })
    expect(closed.archivedAt).toBeTruthy()
    expect(closed.financialSummary).toEqual({ expectedIncome: 10000, income: 4000, expenses: 3000, debt: 6000, receivedAmount: 4000, debtRepaid: 0, balance: 1000 })
    expect(db.prepare('SELECT amount, comment FROM order_debts WHERE order_id = ?').get(order.id)).toEqual({
      amount: 6000,
      comment: 'Пациент отказался доплатить',
    })
    expect(db.prepare('SELECT final_total, received_amount, expenses, debt, financial_result FROM order_financials WHERE order_id = ?').get(order.id))
      .toEqual({ final_total: 10000, received_amount: 4000, expenses: 3000, debt: 6000, financial_result: 1000 })
    const followUpExpense = addOrderExpense(db, order.id, { amount: 10, comment: 'Уточнение после закрытия' })
    expect(followUpExpense).toMatchObject({ orderId: order.id, amount: 10, comment: 'Уточнение после закрытия' })
  })

  it('closes normally below the expected amount without creating debt', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Скидка без долга',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-07-01',
      deadlineAt: '2026-07-20T15:00:00.000Z',
      expenses: [{ amount: 3000, comment: 'Расходы по заказу' }],
      workItems: [{ workType: 'Мост', acceptedAmount: 10000 }],
    })
    const workItem = getOrder(db, order.id)!.workItems[0]
    setWorkItemStatus(db, order.id, workItem.id, 'COMPLETED')

    const closed = closeOrder(db, order.id, {
      closureDate: '2026-08-15',
      mode: 'NORMAL',
      receivedAmount: 4000,
    })

    expect(closed).toMatchObject({ status: 'CLOSED', closureDate: '2026-08-15', closureType: 'NORMAL' })
    expect(closed.financialSummary).toMatchObject({ income: 4000, expenses: 3000, debt: 0, receivedAmount: 4000, balance: 1000 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM order_debts WHERE order_id = ?').get(order.id)).toEqual({ count: 0 })
  })

  it('keeps a refused payment out of income and balance while retaining expenses, then clears forgiven debt', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Пациент отказался платить',
      doctorId: 'demo-doctor-001',
      orderDate: '2042-01-01',
      deadlineAt: '2042-01-10T15:00:00.000Z',
      expenses: [{ amount: 5000, comment: 'Издержки по выполненной работе' }],
      workItems: [{ workType: 'Мост', acceptedAmount: 20000 }],
    })
    const workItem = getOrder(db, order.id)!.workItems[0]
    setWorkItemStatus(db, order.id, workItem.id, 'COMPLETED')

    const closed = closeOrder(db, order.id, {
      closureDate: '2042-01-10',
      mode: 'WITH_DEBT',
      receivedAmount: 0,
      debtAmount: 20000,
    })
    expect(closed.financialSummary).toMatchObject({ expectedIncome: 20000, income: 0, expenses: 5000, debt: 20000, balance: -5000 })

    const forgiven = forgiveOrderDebt(db, order.id)
    expect(forgiven.financialSummary).toMatchObject({ income: 0, expenses: 5000, debt: 0, balance: -5000 })
    expect(forgiven.closureType).toBe('WITH_DEBT')
    expect(listDebts(db)).toHaveLength(0)
  })

  it('adds only received debt payments to income and refreshes saved Archive details after edits', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Погашение и правка архива',
      doctorId: 'demo-doctor-001',
      orderDate: '2042-02-01',
      deadlineAt: '2042-02-10T15:00:00.000Z',
      expenses: [{ amount: 5000, comment: 'Исходные издержки' }],
      workItems: [{ workType: 'Коронка', acceptedAmount: 20000 }],
    })
    const initial = getOrder(db, order.id)!
    const workItem = initial.workItems[0]
    const expense = initial.expenses[0]
    setWorkItemStatus(db, order.id, workItem.id, 'COMPLETED')
    closeOrder(db, order.id, {
      closureDate: '2042-02-10',
      mode: 'WITH_DEBT',
      receivedAmount: 10000,
      debtAmount: 10000,
    })

    const partPaid = addOrderDebtPayment(db, order.id, { amount: 4000 })
    expect(partPaid.financialSummary).toMatchObject({ income: 14000, debtRepaid: 4000, debt: 6000, balance: 9000 })

    updateAcceptedWorkItemAmount(db, order.id, workItem.id, 24000)
    updateOrderExpense(db, order.id, expense.id, { amount: 7000, comment: 'Уточнённые издержки' })
    const edited = getOrder(db, order.id)!
    expect(edited.financialSummary).toMatchObject({
      expectedIncome: 24000,
      income: 14000,
      expenses: 7000,
      debtRepaid: 4000,
      debt: 6000,
      balance: 7000,
    })
    expect(getOrderStatistics(db, '2042-02-10', '2042-02-10')).toMatchObject({
      expectedIncome: 20000,
      income: 14000,
      expenses: 5000,
      debt: 6000,
      balance: 9000,
    })

    const forgiven = forgiveOrderDebt(db, order.id)
    expect(forgiven.financialSummary).toMatchObject({ income: 14000, debtRepaid: 4000, expenses: 7000, debt: 0, balance: 7000 })
    expect(db.prepare('SELECT amount FROM order_debts WHERE order_id = ?').get(order.id)).toEqual({ amount: 4000 })
    expect(listDebts(db).some((debt) => debt.orderId === order.id)).toBe(false)
  })

  it('deletes one Order and all linked financial records from the archive dataset', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Заказ для удаления из архива',
      doctorId: 'demo-doctor-001',
      orderDate: '2043-03-01',
      deadlineAt: '2043-03-10T15:00:00.000Z',
      expenses: [{ amount: 5000, comment: 'Издержки' }],
      workItems: [{ workType: 'Коронка', acceptedAmount: 20000 }],
    })
    const workItem = getOrder(db, order.id)!.workItems[0]
    setWorkItemStatus(db, order.id, workItem.id, 'COMPLETED')
    closeOrder(db, order.id, {
      closureDate: '2043-03-10',
      mode: 'WITH_DEBT',
      receivedAmount: 10000,
      debtAmount: 10000,
    })
    addOrderDebtPayment(db, order.id, { amount: 2000 })
    const debt = db.prepare('SELECT id FROM order_debts WHERE order_id = ?').get(order.id) as { id: string }

    removeOrder(db, order.id)

    expect(getOrder(db, order.id)).toBeUndefined()
    expect(listArchivedOrders(db).some((archived) => archived.id === order.id)).toBe(false)
    expect(getOrderStatistics(db, '2043-03-10', '2043-03-10')).toMatchObject({
      orderCount: 0,
      income: 0,
      expenses: 0,
      debt: 0,
      balance: 0,
    })
    for (const [table, column, id] of [
      ['work_items', 'order_id', order.id],
      ['order_expenses', 'order_id', order.id],
      ['order_debts', 'order_id', order.id],
      ['order_debt_payments', 'debt_id', debt.id],
      ['order_financials', 'order_id', order.id],
    ]) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(id)).toEqual({ count: 0 })
    }
  })

  it('rejects a closure date before the Order start date and records cancelled Orders with zero income', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Отмена с расходом',
      doctorId: 'demo-doctor-001',
      orderDate: '2026-07-10',
      deadlineAt: '2026-07-20T15:00:00.000Z',
      expenses: [{ amount: 450, comment: 'Материалы' }],
      workItems: [{ workType: 'Примерка', acceptedAmount: 5000 }],
    })
    const workItem = getOrder(db, order.id)!.workItems[0]

    expect(() => closeOrder(db, order.id, {
      closureDate: '2026-07-09',
      mode: 'NORMAL',
      receivedAmount: 5000,
    })).toThrow('closureDate cannot be earlier than orderDate')

    setWorkItemStatus(db, order.id, workItem.id, 'CANCELLED')
    const cancelled = closeOrder(db, order.id, {
      closureDate: '2026-07-10',
      mode: 'CANCELLED',
      receivedAmount: 0,
    })
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.financialSummary).toMatchObject({ income: 0, expenses: 450, debt: 0, receivedAmount: 0, balance: -450 })
    expect(db.prepare('SELECT final_total, received_amount, expenses, debt, financial_result FROM order_financials WHERE order_id = ?').get(order.id))
      .toEqual({ final_total: 0, received_amount: 0, expenses: 450, debt: 0, financial_result: -450 })
  })

  it('filters Archive and Debts and aggregates Statistics by the business closure date', () => {
    const db = createSeededDatabase()
    const debtOrder = createOrder(db, {
      patientLabel: 'Архивный пациент',
      doctorId: 'demo-doctor-001',
      orderDate: '2040-11-01',
      deadlineAt: '2040-11-20T15:00:00.000Z',
      expenses: [{ amount: 3000, comment: 'Расход' }],
      workItems: [{ workType: 'Мост', acceptedAmount: 10000 }],
    })
    const cancelledOrder = createOrder(db, {
      patientLabel: 'Отменённый пациент',
      doctorId: 'demo-doctor-001',
      orderDate: '2040-11-02',
      deadlineAt: '2040-11-20T15:00:00.000Z',
      expenses: [{ amount: 450, comment: 'Материалы' }],
      workItems: [{ workType: 'Примерка', acceptedAmount: 5000 }],
    })
    const debtWorkItem = getOrder(db, debtOrder.id)!.workItems[0]
    const cancelledWorkItem = getOrder(db, cancelledOrder.id)!.workItems[0]
    setWorkItemStatus(db, debtOrder.id, debtWorkItem.id, 'COMPLETED')
    setWorkItemStatus(db, cancelledOrder.id, cancelledWorkItem.id, 'CANCELLED')
    closeOrder(db, debtOrder.id, {
      closureDate: '2040-11-15',
      mode: 'WITH_DEBT',
      receivedAmount: 4000,
      debtAmount: 6000,
      debtComment: 'Остаток',
    })
    closeOrder(db, cancelledOrder.id, {
      closureDate: '2040-11-15',
      mode: 'CANCELLED',
      receivedAmount: 0,
    })

    const archive = listArchivedOrders(db).filter((order) => order.closureDate === '2040-11-15')
    expect(archive.map((order) => order.status).sort()).toEqual(['CANCELLED', 'CLOSED'])
    expect(listDebts(db)).toMatchObject([{
      orderId: debtOrder.id,
      patientLabel: 'Архивный пациент',
      doctorName: 'Анна Тестова',
      closureDate: '2040-11-15',
      amount: 6000,
      comment: 'Остаток',
      workTypes: ['Мост'],
    }])

    const statistics = getOrderStatistics(db, '2040-11-15', '2040-11-15')
    expect(statistics).toMatchObject({
      fromDate: '2040-11-15',
      toDate: '2040-11-15',
      orderCount: 2,
      income: 4000,
      receivedAmount: 4000,
      expenses: 3450,
      debt: 6000,
      balance: 550,
      byDoctor: [{ doctorId: 'demo-doctor-001', doctorName: 'Анна Тестова', orderCount: 2, balance: 550 }],
    })
    expect(() => getOrderStatistics(db, '2040-11-16', '2040-11-15')).toThrow('fromDate cannot be after toDate')
  })

  it('allows archived cost/expense edits and recalculates Statistics only from saved Order values', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Пересчёт архива',
      doctorId: 'demo-doctor-001',
      orderDate: '2041-04-01',
      deadlineAt: '2041-04-20T15:00:00.000Z',
      expenses: [{ amount: 3000, comment: 'Исходный расход' }],
      workItems: [{ workType: 'Коронка', pricingItemId: 'demo-price-001', units: 2, acceptedAmount: 10000 }],
    })
    const workItemId = getOrder(db, order.id)!.workItems[0].id
    const expenseId = getOrder(db, order.id)!.expenses[0].id
    setWorkItemStatus(db, order.id, workItemId, 'COMPLETED')
    closeOrder(db, order.id, {
      closureDate: '2041-04-18',
      mode: 'WITH_DEBT',
      receivedAmount: 4000,
      debtAmount: 6000,
      debtComment: 'Долг сохраняется',
    })

    updateAcceptedWorkItemAmount(db, order.id, workItemId, 12000)
    updateOrderExpense(db, order.id, expenseId, { amount: 3500, comment: 'Исправленный расход' })
    expect(getOrderStatistics(db, '2041-04-18', '2041-04-18')).toMatchObject({
      income: 4000,
      expenses: 3000,
      debt: 6000,
      receivedAmount: 4000,
      balance: 1000,
    })
    expect(listArchivedOrders(db)[0].financialSummary).toEqual({
      expectedIncome: 12000,
      income: 4000,
      receivedAmount: 4000,
      debtRepaid: 0,
      expenses: 3500,
      debt: 6000,
      balance: 500,
    })

    expect(recalculateOrderFinancials(db, '2041-04-18', '2041-04-18')).toEqual({ orderCount: 1 })
    expect(getOrderStatistics(db, '2041-04-18', '2041-04-18')).toMatchObject({
      income: 4000,
      expenses: 3500,
      debt: 6000,
      receivedAmount: 4000,
      balance: 500,
    })
    expect(getOrder(db, order.id)?.workItems[0].acceptedAmount).toBe(12000)
    expect(getOrder(db, order.id)?.expenses[0]).toMatchObject({ amount: 3500, comment: 'Исправленный расход' })
  })

  it('stores FDI selections as comma-separated text and reads them back for the odontogram', () => {
    const db = createSeededDatabase()
    const order = createOrder(db, {
      patientLabel: 'Пациент с выбранными зубами',
      doctorId: 'demo-doctor-001',
      deadlineAt: '2026-10-01T15:00:00.000Z',
      workItems: [{ workType: 'Циркон', unitMode: 'TOOTH_COUNT', toothCodes: ['28', '11', '13'] }],
    })
    const item = getOrder(db, order.id)!.workItems[0]

    expect(db.prepare('SELECT tooth_codes, units FROM work_items WHERE id = ?').get(item.id)).toEqual({
      tooth_codes: '11,13,28',
      units: 3,
    })
    expect(item.toothCodes).toEqual(['11', '13', '28'])

    updateWorkItem(db, order.id, item.id, {
      workType: 'Переделка',
      unitMode: 'TOOTH_COUNT',
      toothCodes: ['14', '12'],
    })
    expect(db.prepare('SELECT tooth_codes, units FROM work_items WHERE id = ?').get(item.id)).toEqual({
      tooth_codes: '12,14',
      units: 2,
    })

    updateWorkItem(db, order.id, item.id, {
      workType: 'Починка',
      unitMode: 'FIXED',
      units: 1,
      toothCodes: [],
    })
    expect(db.prepare('SELECT tooth_codes, units FROM work_items WHERE id = ?').get(item.id)).toEqual({
      tooth_codes: null,
      units: 1,
    })
  })

  it('replaces Pricing without changing existing WorkItem price snapshots or unrelated data', () => {
    const db = createSeededDatabase()
    const originalPrice = db.prepare('SELECT unit_price_snapshot FROM work_items WHERE id = ?').get('demo-work-001-1') as { unit_price_snapshot: number }
    const changed = JSON.parse(JSON.stringify(pricingFixture)) as { items: Array<Record<string, unknown>> }
    changed.items[0] = { ...changed.items[0], unitPrice: 17777 }

    expect(replacePricing(db, changed)).toBe(20)
    expect(getPricing(db).find((item) => item.id === 'demo-price-001')?.unitPrice).toBe(17777)
    expect(db.prepare('SELECT unit_price_snapshot FROM work_items WHERE id = ?').get('demo-work-001-1')).toEqual(originalPrice)
    expect(db.prepare('SELECT COUNT(*) AS count FROM orders').get()).toEqual({ count: 30 })
    expect(getDoctors(db)).toHaveLength(5)
  })

  it('replaces only the imported dataset and rejects an invalid file without partial changes', () => {
    const db = createSeededDatabase()
    const smallerDirectory = {
      ...doctorsFixture,
      doctors: (doctorsFixture.doctors as Array<Record<string, unknown>>).slice(0, 3),
    }
    expect(importDataset(db, smallerDirectory)).toBe(3)
    expect(getDoctors(db)).toHaveLength(3)
    expect(getPricing(db)).toHaveLength(26)
    expect(db.prepare('SELECT COUNT(*) AS count FROM orders').get()).toEqual({ count: 30 })

    const broken = { ...pricingFixture, items: [{ id: 'bad', name: '', calculationMode: 'PER_UNIT', unitPrice: -1 }] }
    expect(() => importDataset(db, broken)).toThrow()
    expect(getPricing(db)).toHaveLength(26)
  })

  it('exports and restores a complete JSON database backup', () => {
    const source = createSeededDatabase()
    const backup = exportFullDatabase(source, '2026-09-24T12:00:00.000Z')
    const selectedTeeth = source.prepare('SELECT tooth_codes FROM work_items WHERE id = ?').get('demo-work-001-1')
    expect(backup).toMatchObject({ dataset: 'full-database', schemaVersion: 10 })
    expect(exportDoctorDirectory(source).dataset).toBe('doctor-directory')
    expect(exportPricing(source).dataset).toBe('pricing')

    const restored = openDatabase(':memory:')
    migrateDatabase(restored)
    try {
      restoreFullDatabase(restored, backup)
      expect(restored.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY status').all()).toEqual([
        { status: 'ACTIVE', count: 10 },
        { status: 'CLOSED', count: 20 },
      ])
      expect(getDoctors(restored)).toHaveLength(5)
      expect(getPricing(restored)).toHaveLength(26)
      expect(listOrders(restored, 'ACTIVE')).toHaveLength(10)
      expect(restored.prepare('SELECT tooth_codes FROM work_items WHERE id = ?').get('demo-work-001-1')).toEqual(selectedTeeth)
    } finally {
      restored.close()
    }
  })

  it('restores a schema-v9 full backup with comma-separated FDI codes', () => {
    const db = createSeededDatabase()
    const fixtureWorkItem = legacyFullDatabaseFixture.database.workItems.find((item) => item.tooth_codes)
    expect(fixtureWorkItem).toBeTruthy()
    const workItemId = fixtureWorkItem!.id
    const expectedCodes = fixtureWorkItem!.tooth_codes!.split(',').sort()
    expect(legacyFullDatabaseFixture.schemaVersion).toBe(9)

    restoreFullDatabase(db, legacyFullDatabaseFixture)

    expect(db.prepare('SELECT tooth_codes FROM work_items WHERE id = ?').get(workItemId)).toEqual({
      tooth_codes: expectedCodes.join(','),
    })
    expect(getOrder(db, fixtureWorkItem!.order_id)?.workItems.find((item) => item.id === workItemId)?.toothCodes).toEqual(expectedCodes)
  })

  it('restores a schema-v4 backup by converting legacy Order timestamps to business dates', () => {
    const db = createSeededDatabase()
    const payload = JSON.parse(JSON.stringify(exportFullDatabase(db))) as {
      schemaVersion: number
      database: { orders: Array<Record<string, unknown>> }
    }
    payload.schemaVersion = 4
    for (const order of payload.database.orders) {
      order.created_at = `${String(order.order_date)}T15:30:00.000Z`
      delete order.order_date
      delete order.closure_date
    }

    restoreFullDatabase(db, payload)

    expect(getOrder(db, 'demo-order-001')?.orderDate).toBe('2026-08-24')
    expect(db.prepare('PRAGMA table_info(orders)').all()).not.toContainEqual(expect.objectContaining({ name: 'created_at' }))
  })
})
