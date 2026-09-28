import { isPermanentFdiToothCode } from '@dental-tech/domain'
import type {
  ApplicationArchivedOrder,
  ApplicationDebtRecord,
  ApplicationExportDataset,
  ApplicationFinancialSummary,
  ApplicationOrderDetail,
  ApplicationOrderExpenseInput,
  ApplicationOrderExpenseRecord,
  ApplicationPort,
  ApplicationStatistics,
  ApplicationWorkItemInput,
  ApplicationWorkItemRecord,
  ApplicationWorkItemStatus,
  CalendarStartupDoctor,
  CalendarStartupNamedValue,
  CalendarStartupOrder,
  CalendarStartupPricingItem,
  CalendarStartupRequiredField,
  CalendarStartupSnapshot,
  CloseOrderCommand,
  CreateOrderCommand,
  SaveDoctorCommand,
  SaveNamedValueCommand,
  SavePricingCommand,
  UpdateOrderCommand,
} from '@dental-tech/application'
import { androidSqlite, type SqliteStatement, type SqliteValue } from './android-sqlite.ts'

type SqlRow = Record<string, string | number | null>
type SqlArgument = SqliteValue
type SqlResult = { changes: number; lastInsertRowId: number }
type SqlStep = SqliteStatement & { kind: 'query' | 'execute' }
type TransactionOutput = { results: Array<{ rows: SqlRow[] } | SqlResult> }
type OrderStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED'
type UnitMode = 'TOOTH_COUNT' | 'FIXED' | 'OTHER'
type WorkStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

const schemaVersion = 10
let initialization: Promise<void> | undefined

async function ready(): Promise<void> {
  initialization ??= androidSqlite.initialize().then(({ schemaVersion: actual }) => {
    if (actual !== schemaVersion) throw new Error(`Ожидалась схема базы ${schemaVersion}, получена ${actual}.`)
  })
  await initialization
}

async function query<T extends SqlRow = SqlRow>(sql: string, args: SqlArgument[] = []): Promise<T[]> {
  await ready()
  const result = await androidSqlite.query({ sql, args })
  return result.rows as T[]
}

async function one<T extends SqlRow = SqlRow>(sql: string, args: SqlArgument[] = []): Promise<T | undefined> {
  return (await query<T>(sql, args))[0]
}

async function execute(sql: string, args: SqlArgument[] = []): Promise<SqlResult> {
  await ready()
  return androidSqlite.execute({ sql, args })
}

async function transaction(steps: SqlStep[]): Promise<TransactionOutput['results']> {
  await ready()
  return (await androidSqlite.transaction({ steps })).results
}

export async function getAndroidAppSetting(settingKey: string, fallback: string): Promise<string> {
  const setting = await one('SELECT setting_value FROM app_settings WHERE setting_key = ?', [settingKey])
  return setting ? asString(setting.setting_value) : fallback
}

export async function setAndroidAppSettings(settings: Record<string, string>): Promise<void> {
  const updatedAt = nowIso()
  await transaction(Object.entries(settings).map(([settingKey, settingValue]) => x(`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `, [settingKey, settingValue, updatedAt])))
}

function q(sql: string, args: SqlArgument[] = []): SqlStep {
  return { kind: 'query', sql, args }
}

function x(sql: string, args: SqlArgument[] = []): SqlStep {
  return { kind: 'execute', sql, args }
}

function asString(value: unknown): string {
  return value == null ? '' : String(value)
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value)
}

function asNumber(value: unknown): number {
  return value == null ? 0 : Number(value)
}

function asNullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}

function asBoolean(value: unknown): boolean {
  return Number(value) === 1 || value === true
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return globalThis.crypto.randomUUID()
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function nullableText(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value.trim() || null
}

function optionalText(value: unknown, label: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`)
  return value
}

function positiveNumber(value: unknown, label: string): number {
  const result = optionalNumber(value, label)
  if (result === null || result <= 0) throw new Error(`${label} must be greater than zero`)
  return result
}

function positiveUnits(value: unknown, label: string): number {
  const result = value ?? 1
  if (typeof result !== 'number' || !Number.isFinite(result) || result <= 0) throw new Error(`${label} must be greater than zero`)
  return result
}

function bool(value: unknown, fallback = true): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error('active must be a boolean')
  return value
}

function businessDate(value: unknown, label: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label} is required`)
    return null
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD format`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid date`)
  return value
}

function isoDateTime(value: unknown, label: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label} is required`)
    return null
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid date`)
  return new Date(value).toISOString()
}

function todayBusinessDate(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function parseTeeth(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const codes = value.map((code, index) => {
    if (!isPermanentFdiToothCode(code)) throw new Error(`${label}[${index}] must be a permanent FDI tooth code`)
    return code
  })
  if (new Set(codes).size !== codes.length) throw new Error(`${label} must not contain duplicate teeth`)
  return codes
}

function parseStoredTeeth(value: unknown, label: string): string[] {
  if (value == null || value === '') return []
  if (typeof value !== 'string') throw new Error(`${label} must be comma-separated text`)
  return parseTeeth(value.split(',').map((code) => code.trim()), label)
}

function storedTeeth(codes: readonly string[]): string | null {
  return codes.length ? [...codes].sort().join(',') : null
}

function mapDoctor(row: SqlRow): CalendarStartupDoctor {
  return {
    id: asString(row.id),
    firstName: asString(row.first_name),
    lastName: asString(row.last_name),
    phone: asString(row.phone),
    comment: asString(row.comment),
    active: asBoolean(row.active),
  }
}

function mapNamedValue(row: SqlRow): CalendarStartupNamedValue {
  return { id: asString(row.id), name: asString(row.name), active: asBoolean(row.active) }
}

function mapPricing(row: SqlRow, itemType: 'WORK' | 'EXPENSE'): CalendarStartupPricingItem {
  return {
    id: asString(row.id),
    itemType,
    name: asString(row.name),
    calculationMode: itemType === 'EXPENSE' ? 'PER_UNIT' : asString(row.calculation_mode) as CalendarStartupPricingItem['calculationMode'],
    unitPrice: asNullableNumber(row.unit_price),
    fixedPrice: itemType === 'EXPENSE' ? null : asNullableNumber(row.fixed_price),
    active: asBoolean(row.active),
    metadata: itemType === 'EXPENSE' ? {} : JSON.parse(asString(row.metadata_json)) as Record<string, unknown>,
    updatedAt: asString(row.updated_at),
  }
}

function mapOrder(row: SqlRow): Omit<CalendarStartupOrder, 'workTypes' | 'financialSummary'> {
  return {
    id: asString(row.id),
    patientLabel: nullableString(row.patient_label),
    doctorName: asString(row.doctor_name_snapshot),
    deadlineAt: nullableString(row.deadline_at),
    status: asString(row.status) as CalendarStartupOrder['status'],
  }
}

const zeroSummary = (): ApplicationFinancialSummary => ({
  expectedIncome: 0,
  income: 0,
  expenses: 0,
  debt: 0,
  receivedAmount: 0,
  debtRepaid: 0,
  balance: 0,
})

async function listRequiredFields(): Promise<CalendarStartupRequiredField[]> {
  const rows = await query('SELECT field_key, required FROM required_field_settings ORDER BY field_key')
  return rows.map((row) => ({ fieldKey: asString(row.field_key), required: asBoolean(row.required) }))
}

async function getRequiredMap(): Promise<Map<string, boolean>> {
  return new Map((await listRequiredFields()).map((field) => [field.fieldKey, field.required]))
}

async function workAmount(pricingItemId: string | null, units: number, requireActive = true): Promise<number | null> {
  if (!pricingItemId) return null
  const row = await one(
    `SELECT calculation_mode, unit_price, fixed_price FROM pricing_items WHERE id = ?${requireActive ? ' AND active = 1' : ''}`,
    [pricingItemId],
  )
  if (!row) throw new Error(`Pricing item not found: ${pricingItemId}`)
  return asString(row.calculation_mode) === 'PER_UNIT' ? asNumber(row.unit_price) * units : asNullableNumber(row.fixed_price)
}

interface ExpenseDraft {
  id: string
  amount: number
  pricingItemId: string | null
  name: string
  unitPrice: number
  quantity: number
  category: string | null
  comment: string | null
}

async function parseExpenses(value: unknown, allowInactive = false): Promise<ExpenseDraft[]> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('expenses must be an array')
  const result: ExpenseDraft[] = []
  for (const [index, raw] of value.entries()) {
    const entry = record(raw, `expenses[${index}]`)
    const hasSnapshots = ['pricingItemId', 'name', 'unitPrice', 'quantity'].some((key) => Object.hasOwn(entry, key))
    const suppliedAmount = positiveNumber(entry.amount, `expenses[${index}].amount`)
    const pricingItemId = nullableText(entry.pricingItemId, `expenses[${index}].pricingItemId`)
    const pricing = pricingItemId
      ? await one('SELECT name, unit_price, active FROM expense_pricing_items WHERE id = ?', [pricingItemId])
      : undefined
    if (pricingItemId && (!pricing || (!allowInactive && !asBoolean(pricing.active)))) {
      throw new Error(`Expense Pricing item not found or unavailable: ${pricingItemId}`)
    }
    const quantity = positiveUnits(entry.quantity, `expenses[${index}].quantity`)
    const explicitUnitPrice = optionalNumber(entry.unitPrice, `expenses[${index}].unitPrice`)
    const unitPrice = explicitUnitPrice ?? asNullableNumber(pricing?.unit_price) ?? (hasSnapshots ? null : suppliedAmount)
    if (unitPrice === null || unitPrice <= 0) throw new Error(`expenses[${index}].unitPrice must be greater than zero`)
    const amount = Math.round(unitPrice * quantity * 100) / 100
    if (hasSnapshots && Math.abs(suppliedAmount - amount) > 0.000001) {
      throw new Error(`expenses[${index}].amount must equal unitPrice multiplied by quantity`)
    }
    const category = nullableText(entry.category, `expenses[${index}].category`)
    const name = requiredString(entry.name ?? pricing?.name ?? category ?? 'Расход', `expenses[${index}].name`)
    result.push({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : newId(),
      amount: hasSnapshots ? amount : suppliedAmount,
      pricingItemId,
      name,
      unitPrice,
      quantity,
      category,
      comment: nullableText(entry.comment, `expenses[${index}].comment`),
    })
  }
  return result
}

function mapExpense(row: SqlRow): ApplicationOrderExpenseRecord {
  return {
    id: asString(row.id),
    orderId: asString(row.order_id),
    amount: asNumber(row.amount),
    pricingItemId: nullableString(row.pricing_item_id),
    name: asString(row.name_snapshot),
    unitPrice: asNumber(row.unit_price_snapshot),
    quantity: asNumber(row.quantity),
    category: nullableString(row.category),
    comment: nullableString(row.comment),
  }
}

async function orderFinancialSummary(order: SqlRow, workItems: ApplicationWorkItemRecord[], expenses: ApplicationOrderExpenseRecord[]) {
  const debt = await one('SELECT id, amount FROM order_debts WHERE order_id = ?', [asString(order.id)])
  const financial = await one('SELECT final_total, received_amount, expenses, debt FROM order_financials WHERE order_id = ?', [asString(order.id)])
  const payments = debt
    ? await query('SELECT amount FROM order_debt_payments WHERE debt_id = ? ORDER BY received_at, id', [asString(debt.id)])
    : []
  const debtRepaid = payments.reduce((sum, payment) => sum + asNumber(payment.amount), 0)
  const liveExpected = workItems.filter((item) => item.status === 'COMPLETED').reduce((sum, item) => sum + (item.acceptedAmount ?? 0), 0)
  const liveExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const savedSnapshot = asString(order.status) !== 'ACTIVE' && financial !== undefined
  const expectedIncome = asString(order.status) === 'CANCELLED' ? 0 : liveExpected
  const receivedAmount = savedSnapshot ? asNumber(financial.received_amount) : asString(order.status) === 'CLOSED' ? liveExpected : 0
  const income = asString(order.status) === 'CANCELLED' ? 0 : receivedAmount + debtRepaid
  const expensesTotal = liveExpenses
  const debtAmount = asNumber(debt?.amount ?? financial?.debt)
  return {
    expectedIncome,
    income,
    expenses: expensesTotal,
    debt: Math.max(0, debtAmount - debtRepaid),
    receivedAmount,
    debtRepaid,
    balance: income - expensesTotal,
  }
}

async function getOrderDetail(orderId: string): Promise<ApplicationOrderDetail> {
  const order = await one(`
    SELECT id, patient_label, doctor_id, doctor_name_snapshot, order_date, deadline_at, status,
      general_comment, closure_date, closure_type, archived_at
    FROM orders WHERE id = ?
  `, [orderId])
  if (!order) throw new Error('Заказ не найден.')
  const [workRows, expenseRows] = await Promise.all([
    query(`SELECT id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units, shade, comment,
      started_at, completed_at, cancelled_at, accepted_amount, tooth_codes
      FROM work_items WHERE order_id = ? ORDER BY created_at, id`, [orderId]),
    query(`SELECT id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment
      FROM order_expenses WHERE order_id = ? ORDER BY rowid`, [orderId]),
  ])
  const debt = await one('SELECT id FROM order_debts WHERE order_id = ?', [orderId])
  const paymentRows = debt
    ? await query('SELECT id, debt_id, amount, received_at FROM order_debt_payments WHERE debt_id = ? ORDER BY received_at, id', [asString(debt.id)])
    : []
  const workItems: ApplicationWorkItemRecord[] = workRows.map((row) => ({
    id: asString(row.id),
    orderId: asString(row.order_id),
    pricingItemId: nullableString(row.pricing_item_id),
    workType: asString(row.work_type_snapshot),
    unitMode: asString(row.unit_mode) as UnitMode,
    units: asNumber(row.units),
    toothCodes: parseStoredTeeth(row.tooth_codes, `WorkItem ${asString(row.id)} tooth_codes`),
    shade: nullableString(row.shade),
    comment: nullableString(row.comment),
    status: asString(row.status) as WorkStatus,
    startedAt: nullableString(row.started_at),
    completedAt: nullableString(row.completed_at),
    cancelledAt: nullableString(row.cancelled_at),
    acceptedAmount: asNullableNumber(row.accepted_amount),
  }))
  const expenses = expenseRows.map(mapExpense)
  return {
    id: asString(order.id),
    patientLabel: nullableString(order.patient_label),
    doctorId: nullableString(order.doctor_id),
    doctorName: asString(order.doctor_name_snapshot),
    orderDate: asString(order.order_date),
    deadlineAt: nullableString(order.deadline_at),
    status: asString(order.status) as OrderStatus,
    closureDate: nullableString(order.closure_date),
    closureType: nullableString(order.closure_type),
    archivedAt: nullableString(order.archived_at),
    generalComment: nullableString(order.general_comment),
    workItems,
    expenses,
    debtPayments: paymentRows.map((payment) => ({
      id: asString(payment.id),
      debtId: asString(payment.debt_id),
      orderId,
      amount: asNumber(payment.amount),
      receivedAt: asString(payment.received_at),
    })),
    financialSummary: await orderFinancialSummary(order, workItems, expenses),
  }
}

function workCodes(input: ApplicationWorkItemInput, oldCodes: string[] = []): { codes: string[]; units: number; mode: UnitMode } {
  const mode = input.unitMode ?? 'OTHER'
  if (!['TOOTH_COUNT', 'FIXED', 'OTHER'].includes(mode)) throw new Error('unitMode is invalid')
  const codes = input.toothCodes === undefined ? oldCodes : parseTeeth(input.toothCodes, 'toothCodes')
  if (mode === 'TOOTH_COUNT' && input.toothCodes !== undefined && codes.length === 0) throw new Error('At least one tooth must be selected')
  if (!['TOOTH_COUNT', 'OTHER'].includes(mode) && codes.length > 0) throw new Error('Teeth can only be assigned to FDI or manual-number work')
  if (mode === 'OTHER' && codes.length > 0 && Number(input.units ?? codes.length) !== codes.length) {
    throw new Error('units must equal the entered tooth count')
  }
  const units = (mode === 'TOOTH_COUNT' || mode === 'OTHER') && codes.length > 0 ? codes.length : positiveUnits(input.units, 'units')
  return { codes, units, mode }
}

async function saveExpense(orderId: string, input: ApplicationOrderExpenseInput, expenseId?: string): Promise<void> {
  const drafts = await parseExpenses([{ ...input, id: expenseId ?? input.id }], Boolean(expenseId))
  const expense = drafts[0]
  const args = [expense.amount, expense.pricingItemId, expense.name, expense.unitPrice, expense.quantity, expense.category, expense.comment]
  if (expenseId) {
    const result = await execute(`UPDATE order_expenses SET amount = ?, pricing_item_id = ?, name_snapshot = ?, unit_price_snapshot = ?, quantity = ?, category = ?, comment = ? WHERE id = ? AND order_id = ?`, [...args, expenseId, orderId])
    if (!result.changes) throw new Error('Expense not found')
  } else {
    await execute(`INSERT INTO order_expenses (id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [expense.id, orderId, ...args])
  }
}

function serializedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseWorkDraft(input: ApplicationWorkItemInput, requireSelection: boolean): {
  id: string
  pricingItemId: string | null
  workType: string
  unitMode: UnitMode
  units: number
  toothCodes: string[]
  acceptedAmount: number | null
  shade: string | null
  comment: string | null
} {
  const workType = requiredString(input.workType, 'workType')
  const { codes, units, mode } = workCodes(input)
  if (requireSelection && mode === 'TOOTH_COUNT' && codes.length === 0) throw new Error('At least one tooth must be selected')
  const pricingItemId = input.pricingItemId || null
  return {
    id: input.id?.trim() || newId(),
    pricingItemId,
    workType,
    unitMode: mode,
    units,
    toothCodes: codes,
    acceptedAmount: null,
    shade: nullableText(input.shade, 'shade'),
    comment: nullableText(input.comment, 'comment'),
  }
}

async function getOrderStatus(orderId: string): Promise<OrderStatus> {
  const order = await one('SELECT status FROM orders WHERE id = ?', [orderId])
  if (!order) throw new Error('Order not found')
  return asString(order.status) as OrderStatus
}

async function requireActiveOrder(orderId: string): Promise<void> {
  if (await getOrderStatus(orderId) !== 'ACTIVE') throw new Error('Only active Orders can be edited')
}

async function listCalendarOrders(): Promise<CalendarStartupOrder[]> {
  const [orders, workRows, incomeRows, expenseRows] = await Promise.all([
    query(`SELECT id, patient_label, doctor_name_snapshot, deadline_at, status FROM orders
      WHERE status = 'ACTIVE' ORDER BY deadline_at, order_date, id`),
    query(`SELECT w.order_id, w.work_type_snapshot FROM work_items w JOIN orders o ON o.id = w.order_id
      WHERE o.status = 'ACTIVE' ORDER BY w.rowid`),
    query(`SELECT order_id, COALESCE(SUM(accepted_amount), 0) AS amount FROM work_items
      WHERE status <> 'CANCELLED' GROUP BY order_id`),
    query('SELECT order_id, COALESCE(SUM(amount), 0) AS amount FROM order_expenses GROUP BY order_id'),
  ])
  const workTypes = new Map<string, string[]>()
  for (const row of workRows) {
    const orderId = asString(row.order_id)
    workTypes.set(orderId, [...(workTypes.get(orderId) ?? []), asString(row.work_type_snapshot)])
  }
  const incomes = new Map(incomeRows.map((row) => [asString(row.order_id), asNumber(row.amount)]))
  const expenses = new Map(expenseRows.map((row) => [asString(row.order_id), asNumber(row.amount)]))
  return orders.map((row) => {
    const order = mapOrder(row)
    const income = incomes.get(order.id) ?? 0
    const expense = expenses.get(order.id) ?? 0
    return {
      ...order,
      workTypes: workTypes.get(order.id) ?? [],
      financialSummary: { expectedIncome: income, income, expenses: expense, debt: 0, receivedAmount: 0, debtRepaid: 0, balance: income - expense },
    }
  })
}

async function listArchivedOrders(useFinancialSnapshot = false): Promise<ApplicationArchivedOrder[]> {
  const liveExpected = `CASE WHEN o.status='CANCELLED' THEN 0 ELSE (SELECT COALESCE(SUM(w.accepted_amount),0) FROM work_items w WHERE w.order_id=o.id AND w.status='COMPLETED') END`
  const liveExpenses = `(SELECT COALESCE(SUM(e.amount),0) FROM order_expenses e WHERE e.order_id=o.id)`
  const liveDebt = `(SELECT COALESCE(d.amount,0) FROM order_debts d WHERE d.order_id=o.id)`
  const debtRepaid = `(SELECT COALESCE(SUM(p.amount),0) FROM order_debt_payments p JOIN order_debts d ON d.id=p.debt_id WHERE d.order_id=o.id)`
  const expectedIncome = useFinancialSnapshot ? `COALESCE(f.final_total,${liveExpected})` : liveExpected
  const expensesValue = useFinancialSnapshot ? `COALESCE(f.expenses,${liveExpenses})` : liveExpenses
  const debtValue = useFinancialSnapshot ? `MAX(0,COALESCE(f.debt,${liveDebt},0)-${debtRepaid})` : `MAX(0,${liveDebt}-${debtRepaid})`
  const rows = await query(`
    SELECT o.id, o.patient_label, o.doctor_id, o.doctor_name_snapshot, o.order_date, o.deadline_at,
      o.status, o.closure_date, o.closure_type,
      ${expectedIncome} AS expected_income,
      CASE WHEN o.status='CANCELLED' THEN 0 ELSE COALESCE(f.received_amount,
        (SELECT COALESCE(SUM(w.accepted_amount),0) FROM work_items w WHERE w.order_id=o.id AND w.status='COMPLETED')) END AS received_amount,
      CASE WHEN o.status='CANCELLED' THEN 0 ELSE COALESCE((SELECT SUM(p.amount) FROM order_debt_payments p
        JOIN order_debts d ON d.id=p.debt_id WHERE d.order_id=o.id),0) END AS debt_repaid,
      ${expensesValue} AS expenses,
      ${debtValue} AS debt,
      (SELECT group_concat(work_type_snapshot, ', ') FROM (SELECT DISTINCT work_type_snapshot FROM work_items
        WHERE order_id=o.id ORDER BY work_type_snapshot)) AS work_types,
      o.archived_at
    FROM orders o LEFT JOIN order_financials f ON f.order_id=o.id
    WHERE o.status IN ('CLOSED','CANCELLED') ORDER BY o.closure_date DESC, o.archived_at DESC, o.id
  `)
  return rows.map((row) => {
    const received = asNumber(row.received_amount)
    const repaid = asNumber(row.debt_repaid)
    const expenses = asNumber(row.expenses)
    const income = asString(row.status) === 'CANCELLED' ? 0 : received + repaid
    return {
      id: asString(row.id),
      patientLabel: nullableString(row.patient_label),
      doctorId: nullableString(row.doctor_id),
      doctorName: asString(row.doctor_name_snapshot),
      orderDate: asString(row.order_date),
      deadlineAt: nullableString(row.deadline_at),
      status: asString(row.status) as Exclude<OrderStatus, 'ACTIVE'>,
      closureDate: nullableString(row.closure_date),
      closureType: nullableString(row.closure_type),
      workTypes: row.work_types ? asString(row.work_types).split(', ') : [],
      financialSummary: {
        expectedIncome: asNumber(row.expected_income),
        income,
        receivedAmount: received,
        debtRepaid: repaid,
        expenses,
        debt: asNumber(row.debt),
        balance: income - expenses,
      },
    }
  })
}

async function listDebts(): Promise<ApplicationDebtRecord[]> {
  const rows = await query(`
    SELECT d.id, d.order_id, d.amount AS original_amount, COALESCE(SUM(p.amount),0) AS paid_amount,
      MAX(0,d.amount-COALESCE(SUM(p.amount),0)) AS amount, d.comment, o.status, o.patient_label,
      o.doctor_id, o.doctor_name_snapshot, o.closure_date,
      (SELECT group_concat(work_type_snapshot, ', ') FROM (SELECT DISTINCT work_type_snapshot FROM work_items
        WHERE order_id=o.id ORDER BY work_type_snapshot)) AS work_types
    FROM order_debts d JOIN orders o ON o.id=d.order_id
    LEFT JOIN order_debt_payments p ON p.debt_id=d.id
    WHERE d.amount>0 AND o.status IN ('CLOSED','CANCELLED')
    GROUP BY d.id,d.order_id,d.amount,d.comment,o.status,o.patient_label,o.doctor_id,o.doctor_name_snapshot,o.closure_date,o.archived_at
    HAVING MAX(0,d.amount-COALESCE(SUM(p.amount),0))>0 ORDER BY o.closure_date DESC,o.archived_at DESC,d.id
  `)
  return rows.map((row) => ({
    id: asString(row.id),
    orderId: asString(row.order_id),
    status: asString(row.status) as Exclude<OrderStatus, 'ACTIVE'>,
    patientLabel: nullableString(row.patient_label),
    doctorId: nullableString(row.doctor_id),
    doctorName: asString(row.doctor_name_snapshot),
    closureDate: nullableString(row.closure_date),
    amount: asNumber(row.amount),
    originalAmount: asNumber(row.original_amount),
    paidAmount: asNumber(row.paid_amount),
    comment: nullableString(row.comment),
    workTypes: row.work_types ? asString(row.work_types).split(', ') : [],
  }))
}

async function statistics(fromValue: string | null, toValue: string | null): Promise<ApplicationStatistics> {
  const fromDate = businessDate(fromValue, 'fromDate', false)
  const toDate = businessDate(toValue, 'toDate', false)
  if (fromDate && toDate && fromDate > toDate) throw new Error('fromDate cannot be after toDate')
  const orders = (await listArchivedOrders(true)).filter((order) => order.closureDate !== null
    && (!fromDate || order.closureDate >= fromDate) && (!toDate || order.closureDate <= toDate))
  const summary = zeroSummary()
  const byDoctor = new Map<string, ApplicationStatistics['byDoctor'][number]>()
  for (const order of orders) {
    const values = order.financialSummary
    summary.expectedIncome += values.expectedIncome
    summary.income += values.income
    summary.expenses += values.expenses
    summary.debt += values.debt
    summary.receivedAmount += values.receivedAmount
    summary.debtRepaid += values.debtRepaid
    summary.balance += values.balance
    const key = order.doctorId ?? ''
    const doctor = byDoctor.get(key) ?? {
      doctorId: order.doctorId,
      doctorName: order.doctorName || 'Без врача',
      orderCount: 0,
      expectedIncome: 0,
      income: 0,
      receivedAmount: 0,
      debtRepaid: 0,
      expenses: 0,
      debt: 0,
      balance: 0,
    }
    doctor.orderCount += 1
    doctor.expectedIncome += values.expectedIncome
    doctor.income += values.income
    doctor.receivedAmount += values.receivedAmount
    doctor.debtRepaid += values.debtRepaid
    doctor.expenses += values.expenses
    doctor.debt += values.debt
    doctor.balance += values.balance
    byDoctor.set(key, doctor)
  }
  return {
    ...summary,
    fromDate,
    toDate,
    orderCount: orders.length,
    byDoctor: [...byDoctor.values()].sort((left, right) => left.doctorName.localeCompare(right.doctorName, 'ru')),
  }
}

export function createAndroidApplicationPort(): ApplicationPort {
  return {
    async loadStartupSnapshot(): Promise<CalendarStartupSnapshot> {
      await ready()
      const [orders, doctors, colors, expenseRows, workRows, expensePricingRows, requiredFields] = await Promise.all([
        listCalendarOrders(),
        query('SELECT id, first_name, last_name, phone, comment, active FROM doctors ORDER BY last_name, first_name, id'),
        query('SELECT id, name, active FROM colors ORDER BY name COLLATE NOCASE, id'),
        query('SELECT id, name, active FROM expense_pricing_items ORDER BY name COLLATE NOCASE, id'),
        query('SELECT id, name, calculation_mode, unit_price, fixed_price, active, metadata_json, updated_at FROM pricing_items ORDER BY name, id'),
        query('SELECT id, name, unit_price, active, updated_at FROM expense_pricing_items ORDER BY name, id'),
        listRequiredFields(),
      ])
      return {
        orders,
        doctors: doctors.map(mapDoctor),
        colors: colors.map(mapNamedValue),
        expenseCategories: expenseRows.map(mapNamedValue),
        pricingItems: [
          ...workRows.map((row) => mapPricing(row, 'WORK')),
          ...expensePricingRows.map((row) => mapPricing(row, 'EXPENSE')),
        ].sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.id.localeCompare(right.id)),
        requiredFields,
      }
    },

    async createOrder(command: CreateOrderCommand): Promise<void> {
      const input = record(command, 'Order')
      const required = await getRequiredMap()
      const patientLabel = nullableText(input.patientLabel, 'patientLabel')
      const doctorId = nullableText(input.doctorId, 'doctorId')
      const orderDate = businessDate(input.orderDate ?? todayBusinessDate(), 'orderDate', true)!
      const deadlineAt = isoDateTime(input.deadlineAt, 'deadlineAt', required.get('deadline_at') === true)
      const generalComment = nullableText(input.generalComment, 'generalComment')
      if (required.get('patient_label') && !patientLabel) throw new Error('patientLabel is required')
      if (required.get('doctor_id') && !doctorId) throw new Error('doctorId is required')
      if (deadlineAt && deadlineAt.slice(0, 10) < orderDate) throw new Error('deadlineAt cannot be earlier than orderDate')
      if (!Array.isArray(input.workItems) || input.workItems.length === 0) throw new Error('At least one WorkItem is required')
      if (doctorId && !(await one('SELECT id FROM doctors WHERE id = ? AND active = 1', [doctorId]))) {
        throw new Error('Selected Doctor is unavailable')
      }
      const doctor = doctorId ? await one('SELECT first_name, last_name FROM doctors WHERE id = ?', [doctorId]) : undefined
      const workDrafts = []
      for (const [index, raw] of (input.workItems as unknown[]).entries()) {
        const item = record(raw, `workItems[${index}]`) as unknown as ApplicationWorkItemInput
        const work = parseWorkDraft(item, true)
        const calculated = await workAmount(work.pricingItemId, work.units)
        work.acceptedAmount = item.acceptedAmount === undefined ? calculated : optionalNumber(item.acceptedAmount, `workItems[${index}].acceptedAmount`)
        workDrafts.push(work)
      }
      const expenses = await parseExpenses(input.expenses)
      const id = newId()
      const now = nowIso()
      const steps: SqlStep[] = [x(`INSERT INTO orders (id, patient_label, doctor_id, doctor_name_snapshot, order_date, updated_at, deadline_at, status, general_comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`, [id, patientLabel, doctorId, doctor ? `${asString(doctor.first_name)} ${asString(doctor.last_name)}` : '', orderDate, now, deadlineAt, generalComment])]
      for (const item of workDrafts) {
        steps.push(x(`INSERT INTO work_items (id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units,
          unit_price_snapshot, total_price_snapshot, accepted_amount, tooth_codes, shade, comment, started_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, id, item.pricingItemId, item.workType, item.unitMode, item.units, item.acceptedAmount, storedTeeth(item.toothCodes), item.shade, item.comment, now, now, now]))
      }
      for (const expense of expenses) {
        steps.push(x(`INSERT INTO order_expenses (id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [expense.id, id, expense.amount, expense.pricingItemId, expense.name, expense.unitPrice, expense.quantity, expense.category, expense.comment]))
      }
      await transaction(steps)
    },

    getOrder: getOrderDetail,

    async updateOrder(orderId: string, command: UpdateOrderCommand): Promise<void> {
      const current = await one('SELECT status, order_date, closure_date, doctor_id FROM orders WHERE id = ?', [orderId])
      if (!current) throw new Error('Order not found')
      const required = await getRequiredMap()
      const patientLabel = nullableText(command.patientLabel, 'patientLabel')
      const doctorId = nullableText(command.doctorId, 'doctorId')
      const generalComment = nullableText(command.generalComment, 'generalComment')
      const orderDate = businessDate(command.orderDate ?? current.order_date, 'orderDate', true)!
      const deadlineAt = isoDateTime(command.deadlineAt, 'deadlineAt', required.get('deadline_at') === true)
      if (required.get('patient_label') && !patientLabel) throw new Error('patientLabel is required')
      if (required.get('doctor_id') && !doctorId) throw new Error('doctorId is required')
      if (deadlineAt && deadlineAt.slice(0, 10) < orderDate) throw new Error('deadlineAt cannot be earlier than orderDate')
      if (doctorId && doctorId !== nullableString(current.doctor_id)
        && !(await one('SELECT id FROM doctors WHERE id = ? AND active = 1', [doctorId]))) {
        throw new Error('Selected Doctor is unavailable')
      }
      let closureDate = nullableString(current.closure_date)
      if (asString(current.status) !== 'ACTIVE') {
        closureDate = businessDate(command.closureDate ?? closureDate, 'closureDate', true)
        if (closureDate! < orderDate) throw new Error('closureDate cannot be earlier than orderDate')
      }
      const doctor = doctorId ? await one('SELECT first_name, last_name FROM doctors WHERE id = ?', [doctorId]) : undefined
      await execute(`UPDATE orders SET patient_label = ?, doctor_id = ?, doctor_name_snapshot = ?, order_date = ?,
        deadline_at = ?, general_comment = ?, closure_date = ?, updated_at = ? WHERE id = ?`,
      [patientLabel, doctorId, doctor ? `${asString(doctor.first_name)} ${asString(doctor.last_name)}` : '', orderDate, deadlineAt, generalComment, closureDate, nowIso(), orderId])
    },

    async deleteOrder(orderId: string): Promise<void> {
      const result = await execute('DELETE FROM orders WHERE id = ?', [orderId])
      if (!result.changes) throw new Error('Order not found')
    },

    async deleteAllOrders(): Promise<number> {
      const results = await transaction([q('SELECT COUNT(*) AS count FROM orders'), x('DELETE FROM orders')])
      const rows = (results[0] as { rows: SqlRow[] }).rows
      return asNumber(rows[0]?.count)
    },

    async createWorkItem(orderId: string, input: ApplicationWorkItemInput): Promise<void> {
      if (!(await one('SELECT id FROM orders WHERE id = ?', [orderId]))) throw new Error('Order not found')
      const item = parseWorkDraft(input, true)
      const calculated = await workAmount(item.pricingItemId, item.units)
      item.acceptedAmount = input.acceptedAmount === undefined ? calculated : optionalNumber(input.acceptedAmount, 'acceptedAmount')
      const now = nowIso()
      await execute(`INSERT INTO work_items (id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units,
        unit_price_snapshot, total_price_snapshot, accepted_amount, tooth_codes, shade, comment, started_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, orderId, item.pricingItemId, item.workType, item.unitMode, item.units, item.acceptedAmount, storedTeeth(item.toothCodes), item.shade, item.comment, now, now, now])
    },

    async updateWorkItem(orderId: string, itemId: string, input: ApplicationWorkItemInput): Promise<void> {
      const orderStatus = await getOrderStatus(orderId)
      const current = await one(`SELECT units, tooth_codes, pricing_item_id, accepted_amount, status,
        started_at, completed_at, cancelled_at FROM work_items WHERE id = ? AND order_id = ?`, [itemId, orderId])
      if (!current) throw new Error('WorkItem not found')
      const hasHistory = input.status !== undefined || input.startedAt !== undefined || input.completedAt !== undefined || input.cancelledAt !== undefined
      if (orderStatus === 'ACTIVE' && hasHistory) throw new Error('WorkItem status and production dates can only be edited after Order closure')
      const workType = requiredString(input.workType, 'workType')
      const mode = input.unitMode ?? 'OTHER'
      const oldCodes = parseStoredTeeth(current.tooth_codes, 'tooth_codes')
      const { codes, units } = workCodes(input, oldCodes)
      const pricingItemId = input.pricingItemId === undefined ? nullableString(current.pricing_item_id) : input.pricingItemId || null
      const acceptedAmount = input.acceptedAmount === undefined ? asNullableNumber(current.accepted_amount) : optionalNumber(input.acceptedAmount, 'acceptedAmount')
      let status = asString(current.status) as WorkStatus
      let startedAt = nullableString(current.started_at)
      let completedAt = nullableString(current.completed_at)
      let cancelledAt = nullableString(current.cancelled_at)
      if (hasHistory) {
        if (input.status !== undefined && !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(input.status)) throw new Error('WorkItem status is invalid')
        status = input.status ?? status
        startedAt = input.startedAt === undefined ? startedAt : isoDateTime(input.startedAt, 'startedAt', false)
        completedAt = input.completedAt === undefined ? completedAt : isoDateTime(input.completedAt, 'completedAt', false)
        cancelledAt = input.cancelledAt === undefined ? cancelledAt : isoDateTime(input.cancelledAt, 'cancelledAt', false)
        if (status === 'ACTIVE' && (completedAt || cancelledAt)) throw new Error('Active WorkItems cannot have completion or cancellation dates')
        if (status === 'COMPLETED' && (!completedAt || cancelledAt)) throw new Error('Completed WorkItems require a completion date and cannot have a cancellation date')
        if (status === 'CANCELLED' && (!cancelledAt || completedAt)) throw new Error('Cancelled WorkItems require a cancellation date and cannot have a completion date')
      }
      const stored = ['TOOTH_COUNT', 'OTHER'].includes(mode) ? storedTeeth(codes) : null
      const result = await execute(`UPDATE work_items SET pricing_item_id = ?, work_type_snapshot = ?, unit_mode = ?, units = ?,
        unit_price_snapshot = NULL, total_price_snapshot = NULL, accepted_amount = ?, tooth_codes = ?, shade = ?, comment = ?,
        status = ?, started_at = ?, completed_at = ?, cancelled_at = ?, updated_at = ? WHERE id = ? AND order_id = ?`,
      [pricingItemId, workType, mode, units, acceptedAmount, stored, nullableText(input.shade, 'shade'), nullableText(input.comment, 'comment'), status, startedAt, completedAt, cancelledAt, nowIso(), itemId, orderId])
      if (!result.changes) throw new Error('WorkItem not found')
    },

    async setWorkItemStatus(orderId: string, itemId: string, status: ApplicationWorkItemStatus): Promise<void> {
      await requireActiveOrder(orderId)
      if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) throw new Error('WorkItem status is invalid')
      const current = await one('SELECT status FROM work_items WHERE id = ? AND order_id = ?', [itemId, orderId])
      if (!current) throw new Error('WorkItem not found')
      if (asString(current.status) === status) return
      const now = nowIso()
      const result = await execute(`UPDATE work_items SET status = ?, completed_at = ?, cancelled_at = ?, updated_at = ?
        WHERE id = ? AND order_id = ? AND status = ?`,
      [status, status === 'COMPLETED' ? now : null, status === 'CANCELLED' ? now : null, now, itemId, orderId, asString(current.status)])
      if (!result.changes) throw new Error('WorkItem status changed before the update could be applied')
    },

    async updateAcceptedWorkItemAmount(orderId: string, itemId: string, acceptedAmount: number | null): Promise<void> {
      await getOrderStatus(orderId)
      const amount = optionalNumber(acceptedAmount, 'acceptedAmount')
      const result = await execute('UPDATE work_items SET accepted_amount = ?, updated_at = ? WHERE id = ? AND order_id = ?', [amount, nowIso(), itemId, orderId])
      if (!result.changes) throw new Error('WorkItem not found')
    },

    async deleteWorkItem(orderId: string, itemId: string): Promise<void> {
      if (!(await one('SELECT id FROM orders WHERE id = ?', [orderId]))) throw new Error('Order not found')
      const count = await one('SELECT COUNT(*) AS count FROM work_items WHERE order_id = ?', [orderId])
      if (asNumber(count?.count) <= 1) throw new Error('An Order must keep at least one WorkItem')
      const result = await execute('DELETE FROM work_items WHERE id = ? AND order_id = ?', [itemId, orderId])
      if (!result.changes) throw new Error('WorkItem not found')
    },

    async createOrderExpense(orderId: string, input: ApplicationOrderExpenseInput): Promise<void> {
      await getOrderStatus(orderId)
      await saveExpense(orderId, input)
    },

    async updateOrderExpense(orderId: string, expenseId: string, input: ApplicationOrderExpenseInput): Promise<void> {
      await getOrderStatus(orderId)
      await saveExpense(orderId, input, expenseId)
    },

    async deleteOrderExpense(orderId: string, expenseId: string): Promise<void> {
      await getOrderStatus(orderId)
      const result = await execute('DELETE FROM order_expenses WHERE id = ? AND order_id = ?', [expenseId, orderId])
      if (!result.changes) throw new Error('Expense not found')
    },

    async closeOrder(orderId: string, input: CloseOrderCommand): Promise<void> {
      const order = await one('SELECT status, order_date FROM orders WHERE id = ?', [orderId])
      if (!order) throw new Error('Order not found')
      if (asString(order.status) !== 'ACTIVE') throw new Error('Only active Orders can be closed')
      const closureDate = businessDate(input.closureDate, 'closureDate', true)!
      if (closureDate < asString(order.order_date)) throw new Error('closureDate cannot be earlier than orderDate')
      if (!['NORMAL', 'WITH_DEBT', 'CANCELLED'].includes(input.mode)) throw new Error('Closure mode is invalid')
      const received = optionalNumber(input.receivedAmount, 'receivedAmount')
      if (received === null) throw new Error('receivedAmount is required')
      const debtAmount = input.mode === 'WITH_DEBT' ? optionalNumber(input.debtAmount, 'debtAmount') : 0
      const debtComment = input.mode === 'WITH_DEBT' ? nullableText(input.debtComment, 'debtComment') : null
      if (input.mode === 'WITH_DEBT' && (debtAmount === null || debtAmount <= 0)) throw new Error('debtAmount must be greater than zero when closing with debt')
      if (input.mode === 'CANCELLED' && received !== 0) throw new Error('Cancelled Orders must have a received amount of zero')
      const unfinished = await one("SELECT COUNT(*) AS count FROM work_items WHERE order_id = ? AND status = 'ACTIVE'", [orderId])
      if (asNumber(unfinished?.count) > 0) throw new Error('Перед закрытием отметьте незавершённые работы выполненными или удалите их')
      const existingDebt = await one('SELECT amount FROM order_debts WHERE order_id = ?', [orderId])
      if (input.mode !== 'WITH_DEBT' && existingDebt && asNumber(existingDebt.amount) > 0) {
        throw new Error('This Order has an outstanding debt; close it with debt or resolve the debt first')
      }
      const incomeRow = await one("SELECT COALESCE(SUM(accepted_amount),0) AS total FROM work_items WHERE order_id = ? AND status = 'COMPLETED'", [orderId])
      const expensesRow = await one('SELECT COALESCE(SUM(amount),0) AS total FROM order_expenses WHERE order_id = ?', [orderId])
      const expected = input.mode === 'CANCELLED' ? 0 : asNumber(incomeRow?.total)
      if (input.mode === 'WITH_DEBT' && received >= expected) throw new Error('Полученная сумма должна быть меньше ожидаемой для закрытия заказа с долгом')
      const debt = input.mode === 'WITH_DEBT' ? debtAmount ?? expected - received : 0
      const expenses = asNumber(expensesRow?.total)
      const now = nowIso()
      const status = input.mode === 'CANCELLED' ? 'CANCELLED' : 'CLOSED'
      const steps: SqlStep[] = [x(`UPDATE orders SET status = ?, closure_type = ?, closure_date = ?, archived_at = ?, updated_at = ?
        WHERE id = ? AND status = 'ACTIVE'`, [status, input.mode, closureDate, now, now, orderId])]
      if (input.mode === 'WITH_DEBT') {
        if (existingDebt) steps.push(x('UPDATE order_debts SET amount = ?, comment = ? WHERE order_id = ?', [debt, debtComment, orderId]))
        else steps.push(x('INSERT INTO order_debts (id, order_id, amount, comment) VALUES (?, ?, ?, ?)', [newId(), orderId, debt, debtComment]))
      }
      steps.push(x(`INSERT INTO order_financials (order_id, final_total, received_amount, expenses, debt, financial_result, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET final_total=excluded.final_total,
        received_amount=excluded.received_amount, expenses=excluded.expenses, debt=excluded.debt,
        financial_result=excluded.financial_result, confirmed_at=excluded.confirmed_at`,
      [orderId, expected, received, expenses, debt, received - expenses, now]))
      await transaction(steps)
    },

    async recordDebtPayment(orderId: string, amountValue: number): Promise<void> {
      if (await getOrderStatus(orderId) !== 'CLOSED') throw new Error('Погашать долг можно только у закрытого заказа')
      const debt = await one('SELECT id, amount FROM order_debts WHERE order_id = ?', [orderId])
      if (!debt) throw new Error('У этого заказа нет долга для погашения')
      const amount = positiveNumber(amountValue, 'amount')
      const paid = await one('SELECT COALESCE(SUM(amount),0) AS total FROM order_debt_payments WHERE debt_id = ?', [asString(debt.id)])
      const remaining = Math.max(0, asNumber(debt.amount) - asNumber(paid?.total))
      if (remaining <= 0) throw new Error('Этот долг уже погашен')
      if (amount > remaining) throw new Error('Сумма погашения не может превышать остаток долга')
      const receivedAt = nowIso()
      const financial = await one('SELECT received_amount FROM order_financials WHERE order_id = ?', [orderId])
      const expenses = await one('SELECT COALESCE(SUM(amount),0) AS total FROM order_expenses WHERE order_id = ?', [orderId])
      await transaction([
        x('INSERT INTO order_debt_payments (id, debt_id, amount, received_at) VALUES (?, ?, ?, ?)', [newId(), asString(debt.id), amount, receivedAt]),
        x('UPDATE order_financials SET financial_result = ? WHERE order_id = ?', [asNumber(financial?.received_amount) + asNumber(paid?.total) + amount - asNumber(expenses?.total), orderId]),
      ])
    },

    async forgiveOrderDebt(orderId: string): Promise<void> {
      if (await getOrderStatus(orderId) !== 'CLOSED') throw new Error('Списать долг можно только у закрытого заказа')
      const debt = await one('SELECT id, amount FROM order_debts WHERE order_id = ?', [orderId])
      if (!debt) throw new Error('У этого заказа нет долга для списания')
      const paid = await one('SELECT COALESCE(SUM(amount),0) AS total FROM order_debt_payments WHERE debt_id = ?', [asString(debt.id)])
      const paidAmount = asNumber(paid?.total)
      const remaining = Math.max(0, asNumber(debt.amount) - paidAmount)
      if (remaining <= 0) throw new Error('Этот долг уже погашен')
      if (paidAmount - asNumber(debt.amount) > 0.000001) throw new Error('Сумма платежей превышает сумму долга')
      await transaction([
        x('UPDATE order_debts SET amount = ? WHERE id = ?', [paidAmount, asString(debt.id)]),
        x('UPDATE order_financials SET debt = ? WHERE order_id = ?', [paidAmount, orderId]),
      ])
    },

    listArchivedOrders,
    listDebts,
    getStatistics: statistics,

    async recalculateStatistics(fromValue: string | null, toValue: string | null): Promise<number> {
      const fromDate = businessDate(fromValue, 'fromDate', false)
      const toDate = businessDate(toValue, 'toDate', false)
      if (fromDate && toDate && fromDate > toDate) throw new Error('fromDate cannot be after toDate')
      const clauses = ["status IN ('CLOSED','CANCELLED')", 'closure_date IS NOT NULL']
      const args: SqlArgument[] = []
      if (fromDate) { clauses.push('closure_date >= ?'); args.push(fromDate) }
      if (toDate) { clauses.push('closure_date <= ?'); args.push(toDate) }
      const orders = await query(`SELECT id,status FROM orders WHERE ${clauses.join(' AND ')} ORDER BY closure_date,id`, args)
      const steps: SqlStep[] = []
      for (const order of orders) {
        const id = asString(order.id)
        const [financial, total, expenses, debt, repaid] = await Promise.all([
          one('SELECT received_amount, confirmed_at FROM order_financials WHERE order_id = ?', [id]),
          one("SELECT COALESCE(SUM(accepted_amount),0) AS total FROM work_items WHERE order_id = ? AND status = 'COMPLETED'", [id]),
          one('SELECT COALESCE(SUM(amount),0) AS total FROM order_expenses WHERE order_id = ?', [id]),
          one('SELECT COALESCE(amount,0) AS amount FROM order_debts WHERE order_id = ?', [id]),
          one('SELECT COALESCE(SUM(p.amount),0) AS total FROM order_debt_payments p JOIN order_debts d ON d.id=p.debt_id WHERE d.order_id = ?', [id]),
        ])
        const expected = asString(order.status) === 'CANCELLED' ? 0 : asNumber(total?.total)
        const income = asString(order.status) === 'CANCELLED' ? 0 : asNumber(financial?.received_amount) + asNumber(repaid?.total)
        const cost = asNumber(expenses?.total)
        steps.push(x(`INSERT INTO order_financials (order_id,final_total,received_amount,expenses,debt,financial_result,confirmed_at)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET final_total=excluded.final_total,
          expenses=excluded.expenses,debt=excluded.debt,financial_result=excluded.financial_result`,
        [id, expected, asNumber(financial?.received_amount), cost, asNumber(debt?.amount), income - cost, asString(financial?.confirmed_at) || nowIso()]))
      }
      if (steps.length) await transaction(steps)
      return orders.length
    },

    async savePricingItem(itemId: string | null, input: SavePricingCommand): Promise<void> {
      const name = requiredString(input.name, 'name')
      const itemType = input.itemType
      if (itemType !== 'WORK' && itemType !== 'EXPENSE') throw new Error('itemType is invalid')
      const calculationMode = input.calculationMode
      if (!['PER_UNIT', 'FIXED', 'COMPOSITE'].includes(calculationMode)) throw new Error('calculationMode is invalid')
      const unitPrice = optionalNumber(input.unitPrice, 'unitPrice')
      const fixedPrice = optionalNumber(input.fixedPrice, 'fixedPrice')
      if (itemType === 'EXPENSE' && (calculationMode !== 'PER_UNIT' || fixedPrice !== null)) throw new Error('Expense items must use PER_UNIT pricing')
      if (itemType === 'WORK' && calculationMode === 'PER_UNIT' && (unitPrice === null || fixedPrice !== null)) throw new Error('PER_UNIT requires unitPrice only')
      if (itemType === 'WORK' && calculationMode === 'FIXED' && (fixedPrice === null || unitPrice !== null)) throw new Error('FIXED requires fixedPrice only')
      if (itemType === 'WORK' && calculationMode === 'COMPOSITE' && unitPrice === null && fixedPrice === null) throw new Error('COMPOSITE requires a configured price')
      const active = bool(input.active) ? 1 : 0
      const id = itemId?.trim() || newId()
      const updatedAt = nowIso()
      const otherTypeTable = itemType === 'EXPENSE' ? 'pricing_items' : 'expense_pricing_items'
      if (await one(`SELECT 1 AS found FROM ${otherTypeTable} WHERE id = ?`, [id])) {
        throw new Error(`Pricing item id is already used by a ${itemType === 'EXPENSE' ? 'work' : 'expense'} position`)
      }
      if (itemType === 'EXPENSE') {
        await execute(`INSERT INTO expense_pricing_items (id,name,unit_price,active,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,unit_price=excluded.unit_price,active=excluded.active,updated_at=excluded.updated_at`,
        [id, name, unitPrice, active, updatedAt])
      } else {
        if (typeof input.metadata !== 'object' || input.metadata === null || Array.isArray(input.metadata)) throw new Error('metadata must be an object')
        await execute(`INSERT INTO pricing_items (id,name,calculation_mode,unit_price,fixed_price,active,metadata_json,updated_at)
          VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,calculation_mode=excluded.calculation_mode,
          unit_price=excluded.unit_price,fixed_price=excluded.fixed_price,active=excluded.active,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`,
        [id, name, calculationMode, unitPrice, fixedPrice, active, JSON.stringify(input.metadata), updatedAt])
      }
    },

    async deletePricingItem(itemId: string): Promise<void> {
      const expense = await execute('DELETE FROM expense_pricing_items WHERE id = ?', [itemId])
      if (expense.changes) {
        await execute('UPDATE order_expenses SET pricing_item_id = NULL WHERE pricing_item_id = ?', [itemId])
        return
      }
      const work = await execute('DELETE FROM pricing_items WHERE id = ?', [itemId])
      if (!work.changes) throw new Error('Pricing item not found')
    },

    async saveDoctor(doctorId: string | null, input: SaveDoctorCommand): Promise<void> {
      const firstName = requiredString(input.firstName, 'firstName')
      const lastName = requiredString(input.lastName, 'lastName')
      const phone = optionalText(input.phone, 'phone')
      const comment = optionalText(input.comment, 'comment')
      const active = bool(input.active) ? 1 : 0
      const id = doctorId?.trim() || newId()
      const existing = await one('SELECT id FROM doctors WHERE id = ?', [id])
      const now = nowIso()
      if (existing) {
        await transaction([
          x('UPDATE doctors SET first_name=?,last_name=?,phone=?,comment=?,active=?,updated_at=? WHERE id=?', [firstName, lastName, phone, comment, active, now, id]),
          x("UPDATE orders SET doctor_name_snapshot=? WHERE doctor_id=? AND status='ACTIVE'", [`${firstName} ${lastName}`, id]),
        ])
      } else {
        await execute('INSERT INTO doctors (id,first_name,last_name,phone,comment,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [id, firstName, lastName, phone, comment, active, now, now])
      }
    },

    async deleteDoctor(doctorId: string): Promise<void> {
      const result = await execute('DELETE FROM doctors WHERE id = ?', [doctorId])
      if (!result.changes) throw new Error('Doctor not found')
    },

    async saveColor(colorId: string | null, input: SaveNamedValueCommand): Promise<void> {
      const name = requiredString(input.name, 'name')
      const active = bool(input.active) ? 1 : 0
      const id = colorId?.trim() || newId()
      const entries = await query('SELECT id,name FROM colors')
      const duplicate = entries.find((entry) => asString(entry.id) !== id && asString(entry.name).trim().toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))
      if (duplicate) throw new Error('A color with this name already exists')
      const existing = await one('SELECT id FROM colors WHERE id=?', [id])
      const now = nowIso()
      if (existing) await execute('UPDATE colors SET name=?,active=?,updated_at=? WHERE id=?', [name, active, now, id])
      else await execute('INSERT INTO colors (id,name,active,created_at,updated_at) VALUES (?,?,?,?,?)', [id, name, active, now, now])
    },

    async deleteColor(colorId: string): Promise<void> {
      const result = await execute('DELETE FROM colors WHERE id = ?', [colorId])
      if (!result.changes) throw new Error('Color not found')
    },

    async setRequiredFields(fields: CalendarStartupRequiredField[]): Promise<void> {
      if (!Array.isArray(fields)) throw new Error('requiredFields must be an array')
      const allowed = new Set(['patient_label', 'doctor_id', 'deadline_at'])
      const seen = new Set<string>()
      const now = nowIso()
      const steps: SqlStep[] = []
      for (const [index, raw] of fields.entries()) {
        const field = record(raw, `requiredFields[${index}]`)
        const fieldKey = requiredString(field.fieldKey, `requiredFields[${index}].fieldKey`)
        if (!allowed.has(fieldKey)) throw new Error(`Unsupported required field: ${fieldKey}`)
        if (typeof field.required !== 'boolean') throw new Error(`requiredFields[${index}].required must be a boolean`)
        if (seen.has(fieldKey)) throw new Error('Duplicate required field setting')
        seen.add(fieldKey)
        steps.push(x(`INSERT INTO required_field_settings (field_key,required,updated_at) VALUES (?,?,?)
          ON CONFLICT(field_key) DO UPDATE SET required=excluded.required,updated_at=excluded.updated_at`, [fieldKey, field.required ? 1 : 0, now]))
      }
      if (steps.length) await transaction(steps)
    },

    async exportDataset(dataset: ApplicationExportDataset): Promise<string> {
      let envelope: Record<string, unknown>
      if (dataset === 'doctor-directory') {
        const rows = await query('SELECT id,first_name,last_name,phone,comment,active FROM doctors ORDER BY last_name,first_name,id')
        envelope = { format: 'dental-tech-calendar', dataset, formatVersion: 1, doctors: rows.map(mapDoctor) }
      } else if (dataset === 'directory') {
        const [doctors, colors] = await Promise.all([
          query('SELECT id,first_name,last_name,phone,comment,active FROM doctors ORDER BY last_name,first_name,id'),
          query('SELECT id,name,active FROM colors ORDER BY name COLLATE NOCASE,id'),
        ])
        envelope = { format: 'dental-tech-calendar', dataset, formatVersion: 1, doctors: doctors.map(mapDoctor), colors: colors.map(mapNamedValue) }
      } else if (dataset === 'pricing') {
        const [work, expense] = await Promise.all([
          query('SELECT id,name,calculation_mode,unit_price,fixed_price,active,metadata_json,updated_at FROM pricing_items ORDER BY name,id'),
          query('SELECT id,name,unit_price,active,updated_at FROM expense_pricing_items ORDER BY name,id'),
        ])
        const items = [...work.map((row) => mapPricing(row, 'WORK')), ...expense.map((row) => mapPricing(row, 'EXPENSE'))]
          .sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.id.localeCompare(right.id))
        envelope = { format: 'dental-tech-calendar', dataset, formatVersion: 1, pricingVersion: 2, items }
      } else if (dataset === 'full-database') {
        const tables = [
          ['doctors', 'id'], ['colors', 'id'], ['expense_pricing_items', 'id'], ['pricing_items', 'id'],
          ['orders', 'id'], ['work_items', 'id'], ['order_financials', 'order_id'], ['order_expenses', 'order_id,id'],
          ['order_debts', 'order_id'], ['order_debt_payments', 'debt_id,received_at,id'],
          ['required_field_settings', 'field_key'], ['app_settings', 'setting_key'],
        ] as const
        const tableData: Record<string, SqlRow[]> = {}
        for (const [table, order] of tables) {
          tableData[table] = await query(`SELECT * FROM ${table} ORDER BY ${order}`)
        }
        const omitCurrency = (rows: SqlRow[]) => rows.map(({ currency_code: _ignored, ...row }) => row)
        envelope = {
          format: 'dental-tech-calendar',
          dataset,
          formatVersion: 1,
          schemaVersion,
          exportedAt: nowIso(),
          database: {
            doctors: tableData.doctors,
            colors: tableData.colors,
            expensePricingItems: tableData.expense_pricing_items,
            pricingItems: omitCurrency(tableData.pricing_items),
            orders: tableData.orders,
            workItems: tableData.work_items,
            orderFinancials: omitCurrency(tableData.order_financials),
            orderExpenses: tableData.order_expenses,
            orderDebts: tableData.order_debts,
            orderDebtPayments: tableData.order_debt_payments,
            requiredFieldSettings: tableData.required_field_settings,
            appSettings: tableData.app_settings.filter((row) => row.setting_key !== 'default_currency_code'),
          },
        }
      } else {
        throw new Error('Unsupported dataset')
      }
      return serializedJson(envelope)
    },

    async importDataset(payload: unknown): Promise<{ count: number }> {
      const envelope = record(payload, 'JSON root')
      if (envelope.format !== 'dental-tech-calendar' || envelope.formatVersion !== 1) throw new Error('Unsupported file format')
      if (envelope.dataset === 'doctor-directory') return { count: await importDoctors(envelope, false) }
      if (envelope.dataset === 'directory') return { count: await importDoctors(envelope, true) }
      if (envelope.dataset === 'pricing') return { count: await importPricing(envelope) }
      if (envelope.dataset === 'full-database') return { count: await importFullDatabase(envelope) }
      throw new Error('Unsupported dataset')
    },
  }
}

function importArray(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = source[key]
  if (!Array.isArray(value) || value.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))) {
    throw new Error(`${key} must be an array of objects`)
  }
  return value as Record<string, unknown>[]
}

function databaseValue(value: unknown, label: string): SqlArgument {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  throw new Error(`${label} must be a SQLite scalar value`)
}

function activeInteger(value: unknown, label: string): number {
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  throw new Error(`${label} must be a boolean or 0/1`)
}

async function importDoctors(envelope: Record<string, unknown>, withColors: boolean): Promise<number> {
  const doctorsInput = importArray(envelope, 'doctors')
  const ids = new Set<string>()
  const doctors = doctorsInput.map((row, index) => {
    const id = requiredString(row.id, `doctors[${index}].id`)
    if (ids.has(id)) throw new Error(`Duplicate doctor id: ${id}`)
    ids.add(id)
    return {
      id,
      firstName: requiredString(row.firstName, `doctors[${index}].firstName`),
      lastName: requiredString(row.lastName, `doctors[${index}].lastName`),
      phone: optionalText(row.phone, `doctors[${index}].phone`),
      comment: optionalText(row.comment, `doctors[${index}].comment`),
      active: bool(row.active) ? 1 : 0,
    }
  })
  const colorsInput = withColors ? importArray(envelope, 'colors') : []
  const colorIds = new Set<string>()
  const colorNames = new Set<string>()
  const colors = colorsInput.map((row, index) => {
    const id = requiredString(row.id, `colors[${index}].id`)
    const name = requiredString(row.name, `colors[${index}].name`)
    const normalized = name.toLocaleLowerCase('ru')
    if (colorIds.has(id)) throw new Error(`Duplicate colors id: ${id}`)
    if (colorNames.has(normalized)) throw new Error(`Duplicate colors name: ${name}`)
    colorIds.add(id)
    colorNames.add(normalized)
    return { id, name, active: bool(row.active) ? 1 : 0 }
  })
  const incomingIds = new Set(doctors.map((doctor) => doctor.id))
  const oldRefs = await query('SELECT id, doctor_id FROM orders WHERE doctor_id IS NOT NULL')
  const now = nowIso()
  const steps: SqlStep[] = [x('DELETE FROM doctors')]
  if (withColors) steps.unshift(x('DELETE FROM colors'))
  for (const doctor of doctors) {
    steps.push(x('INSERT INTO doctors (id,first_name,last_name,phone,comment,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [doctor.id, doctor.firstName, doctor.lastName, doctor.phone, doctor.comment, doctor.active, now, now]))
  }
  for (const color of colors) {
    steps.push(x('INSERT INTO colors (id,name,active,created_at,updated_at) VALUES (?,?,?,?,?)', [color.id, color.name, color.active, now, now]))
  }
  for (const ref of oldRefs) {
    const doctorId = nullableString(ref.doctor_id)
    if (doctorId && incomingIds.has(doctorId)) steps.push(x('UPDATE orders SET doctor_id=? WHERE id=?', [doctorId, asString(ref.id)]))
  }
  await transaction(steps)
  return doctors.length + colors.length
}

async function importPricing(envelope: Record<string, unknown>): Promise<number> {
  const items = importArray(envelope, 'items')
  if (envelope.pricingVersion !== undefined && envelope.pricingVersion !== 2) throw new Error('Unsupported pricing version')
  const ids = new Set<string>()
  const parsed = items.map((raw, index) => {
    const id = requiredString(raw.id, `items[${index}].id`)
    if (ids.has(id)) throw new Error(`Duplicate Pricing id: ${id}`)
    ids.add(id)
    const itemType = raw.itemType === undefined ? 'WORK' : raw.itemType
    if (itemType !== 'WORK' && itemType !== 'EXPENSE') throw new Error(`items[${index}].itemType is invalid`)
    const mode = raw.calculationMode
    if (!['PER_UNIT', 'FIXED', 'COMPOSITE'].includes(String(mode))) throw new Error(`items[${index}].calculationMode is invalid`)
    const unitPrice = optionalNumber(raw.unitPrice, `items[${index}].unitPrice`)
    const fixedPrice = optionalNumber(raw.fixedPrice, `items[${index}].fixedPrice`)
    if (itemType === 'EXPENSE' && (mode !== 'PER_UNIT' || fixedPrice !== null)) throw new Error(`items[${index}] expense items must use PER_UNIT pricing`)
    if (itemType === 'WORK' && mode === 'PER_UNIT' && (unitPrice === null || fixedPrice !== null)) throw new Error(`items[${index}] needs only unitPrice for PER_UNIT`)
    if (itemType === 'WORK' && mode === 'FIXED' && (fixedPrice === null || unitPrice !== null)) throw new Error(`items[${index}] needs only fixedPrice for FIXED`)
    if (itemType === 'WORK' && mode === 'COMPOSITE' && unitPrice === null && fixedPrice === null) throw new Error(`items[${index}] needs a configured price for COMPOSITE`)
    const metadata = raw.metadata === undefined ? {} : raw.metadata
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) throw new Error(`items[${index}].metadata must be an object`)
    const updatedAt = raw.updatedAt === undefined ? '2026-09-24T00:00:00.000Z' : requiredString(raw.updatedAt, `items[${index}].updatedAt`)
    return { id, itemType, name: requiredString(raw.name, `items[${index}].name`), mode: asString(mode), unitPrice, fixedPrice, active: bool(raw.active) ? 1 : 0, metadata, updatedAt }
  })
  const hasExpenseSection = envelope.pricingVersion === 2 || parsed.some((item) => item.itemType === 'EXPENSE')
  const steps: SqlStep[] = [x('DELETE FROM pricing_items')]
  if (hasExpenseSection) {
    steps.push(x('UPDATE order_expenses SET pricing_item_id=NULL'))
    steps.push(x('DELETE FROM expense_pricing_items'))
  }
  for (const item of parsed) {
    if (item.itemType === 'EXPENSE') {
      steps.push(x('INSERT INTO expense_pricing_items (id,name,unit_price,active,updated_at) VALUES (?,?,?,?,?)',
        [item.id, item.name, item.unitPrice, item.active, item.updatedAt]))
    } else {
      steps.push(x('INSERT INTO pricing_items (id,name,calculation_mode,unit_price,fixed_price,active,metadata_json,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [item.id, item.name, item.mode, item.unitPrice, item.fixedPrice, item.active, JSON.stringify(item.metadata), item.updatedAt]))
    }
  }
  await transaction(steps)
  return parsed.length
}

function requireFullRow(row: Record<string, unknown>, key: string, label: string): SqlArgument {
  if (!Object.hasOwn(row, key)) throw new Error(`${label}.${key} is required`)
  return databaseValue(row[key], `${label}.${key}`)
}

function normalizeFullDatabase(envelope: Record<string, unknown>): Record<string, SqlArgument>[][] {
  const version = envelope.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 2 || version > schemaVersion) {
    throw new Error(`Unsupported database schema version: ${String(version)}`)
  }
  const source = record(envelope.database, 'database')
  const doctors = importArray(source, 'doctors')
  const colors = version >= 7 ? importArray(source, 'colors') : []
  const legacyExpenses = version >= 7 && version < 10 ? importArray(source, 'expenseCategories') : []
  const expensePricing = version >= 10 ? importArray(source, 'expensePricingItems') : legacyExpenses
  const pricing = importArray(source, 'pricingItems')
  const orders = importArray(source, 'orders')
  const sourceWorkItems = importArray(source, 'workItems')
  const financials = importArray(source, 'orderFinancials')
  const requiredFields = importArray(source, 'requiredFieldSettings')
  const settings = importArray(source, 'appSettings')
  const workTeeth = version < 4 && !(version === 2 && source.workItemTeeth === undefined) ? importArray(source, 'workItemTeeth') : []
  const workMap = new Map<string, Record<string, unknown>>()
  for (const [index, row] of sourceWorkItems.entries()) {
    const id = requiredString(row.id, `database.workItems[${index}].id`)
    if (workMap.has(id)) throw new Error(`Duplicate WorkItem id: ${id}`)
    workMap.set(id, row)
  }
  const orderIds = new Set(orders.map((row, index) => requiredString(row.id, `database.orders[${index}].id`)))
  const toothMap = new Map<string, string[]>()
  if (version >= 4) {
    sourceWorkItems.forEach((row, index) => {
      if (!Object.hasOwn(row, 'tooth_codes')) throw new Error(`database.workItems[${index}].tooth_codes is required from schema version 4 onward`)
      toothMap.set(requiredString(row.id, `database.workItems[${index}].id`), parseStoredTeeth(row.tooth_codes, `database.workItems[${index}].tooth_codes`))
    })
  } else {
    workTeeth.forEach((row, index) => {
      if (!isPermanentFdiToothCode(row.tooth_code)) throw new Error(`database.workItemTeeth[${index}].tooth_code must be a permanent FDI tooth code`)
      const workId = requiredString(row.work_item_id, `database.workItemTeeth[${index}].work_item_id`)
      const work = workMap.get(workId)
      if (!work) throw new Error(`database.workItemTeeth[${index}] references an unknown WorkItem`)
      if (!['TOOTH_COUNT', 'OTHER'].includes(asString(work.unit_mode))) throw new Error(`database.workItemTeeth[${index}] must reference an FDI or manual-number WorkItem`)
      const values = toothMap.get(workId) ?? []
      if (values.includes(asString(row.tooth_code))) throw new Error(`database.workItemTeeth[${index}] duplicates a tooth code`)
      values.push(asString(row.tooth_code))
      toothMap.set(workId, values)
    })
  }
  const workItems = sourceWorkItems.map((row, index) => {
    const id = requiredString(row.id, `database.workItems[${index}].id`)
    const teeth = toothMap.get(id) ?? []
    if (teeth.length && !['TOOTH_COUNT', 'OTHER'].includes(asString(row.unit_mode))) throw new Error(`WorkItem ${id} must use FDI or manual-number mode when teeth are selected`)
    if (teeth.length && asNumber(row.units) !== teeth.length) throw new Error(`WorkItem ${id} units must equal its selected tooth count`)
    if (version >= 6 && !Object.hasOwn(row, 'accepted_amount')) throw new Error(`database.workItems[${index}].accepted_amount is required in schema version 6`)
    const accepted = version >= 6 ? optionalNumber(row.accepted_amount, `database.workItems[${index}].accepted_amount`)
      : optionalNumber(row.total_price_snapshot, `database.workItems[${index}].total_price_snapshot`)
    return { ...row, id, order_id: requiredString(row.order_id, `database.workItems[${index}].order_id`), unit_price_snapshot: null, total_price_snapshot: null,
      accepted_amount: accepted, tooth_codes: storedTeeth(teeth) }
  })
  const normalizedOrders = orders.map((row, index) => {
    const orderDate = version >= 5
      ? businessDate(row.order_date, `database.orders[${index}].order_date`, true)
      : businessDate(typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : row.created_at, `database.orders[${index}].created_at`, true)
    const closureDate = version >= 5 ? businessDate(row.closure_date, `database.orders[${index}].closure_date`, false) : null
    return { ...row, id: requiredString(row.id, `database.orders[${index}].id`), order_date: orderDate, closure_date: closureDate }
  })
  for (const work of workItems) if (!orderIds.has(asString(work.order_id))) throw new Error(`WorkItem ${asString(work.id)} references an unknown Order`)

  const rawExpenses: Record<string, unknown>[] = version >= 6 ? importArray(source, 'orderExpenses') : financials.flatMap((row) => asNumber(row.expenses) > 0
    ? [{ id: `legacy-expense-${asString(row.order_id)}`, order_id: row.order_id, amount: asNumber(row.expenses), comment: null }]
    : [])
  const rawDebts: Record<string, unknown>[] = version >= 6 ? importArray(source, 'orderDebts') : financials.flatMap((row) => asNumber(row.debt) > 0
    ? [{ id: `legacy-debt-${asString(row.order_id)}`, order_id: row.order_id, amount: asNumber(row.debt), comment: null }]
    : [])
  const normalizeLedger = (rows: Record<string, unknown>[], label: string, uniqueOrder: boolean) => {
    const ids = new Set<string>()
    const seenOrders = new Set<string>()
    return rows.map((row, index) => {
      const id = requiredString(row.id, `database.${label}[${index}].id`)
      const orderId = requiredString(row.order_id, `database.${label}[${index}].order_id`)
      const amount = positiveNumber(row.amount, `database.${label}[${index}].amount`)
      if (!orderIds.has(orderId)) throw new Error(`database.${label}[${index}] references an unknown Order`)
      if (ids.has(id)) throw new Error(`Duplicate ${label} id: ${id}`)
      if (uniqueOrder && seenOrders.has(orderId)) throw new Error(`${label} must contain at most one record per Order`)
      ids.add(id)
      seenOrders.add(orderId)
      return { ...row, id, order_id: orderId, amount, comment: nullableText(row.comment, `database.${label}[${index}].comment`) }
    })
  }
  const normalizedExpenses = normalizeLedger(rawExpenses, 'orderExpenses', false).map((row, index) => {
    const raw = rawExpenses[index]
    const category = nullableText(raw.category, `database.orderExpenses[${index}].category`)
    const name = version >= 10 ? requiredString(raw.name_snapshot, `database.orderExpenses[${index}].name_snapshot`) : category ?? 'Расход'
    const unitPrice = version >= 10 ? optionalNumber(raw.unit_price_snapshot, `database.orderExpenses[${index}].unit_price_snapshot`) : row.amount as number
    const quantity = version >= 10 ? positiveUnits(raw.quantity, `database.orderExpenses[${index}].quantity`) : 1
    if (unitPrice === null) throw new Error(`database.orderExpenses[${index}].unit_price_snapshot is required`)
    return { ...row, pricing_item_id: version >= 10 ? nullableText(raw.pricing_item_id, `database.orderExpenses[${index}].pricing_item_id`) : null,
      name_snapshot: name, unit_price_snapshot: unitPrice, quantity, category: version >= 10 ? category ?? name : category }
  })
  const normalizedDebts = normalizeLedger(rawDebts, 'orderDebts', true)
  const rawPayments = version >= 9 ? importArray(source, 'orderDebtPayments') : []
  const debtById = new Map(normalizedDebts.map((debt) => [asString(debt.id), asNumber(debt.amount)]))
  const paymentIds = new Set<string>()
  const paid = new Map<string, number>()
  const payments = rawPayments.map((row, index) => {
    const id = requiredString(row.id, `database.orderDebtPayments[${index}].id`)
    const debtId = requiredString(row.debt_id, `database.orderDebtPayments[${index}].debt_id`)
    const amount = positiveNumber(row.amount, `database.orderDebtPayments[${index}].amount`)
    const receivedAt = requiredString(row.received_at, `database.orderDebtPayments[${index}].received_at`)
    if (Number.isNaN(Date.parse(receivedAt))) throw new Error(`database.orderDebtPayments[${index}].received_at must be a valid date`)
    if (!debtById.has(debtId)) throw new Error(`database.orderDebtPayments[${index}] references an unknown debt`)
    if (paymentIds.has(id)) throw new Error(`Duplicate order debt payment id: ${id}`)
    paymentIds.add(id)
    const total = (paid.get(debtId) ?? 0) + amount
    if (total > debtById.get(debtId)!) throw new Error(`database.orderDebtPayments exceeds the recorded debt for ${debtId}`)
    paid.set(debtId, total)
    return { id, debt_id: debtId, amount, received_at: receivedAt }
  })

  const normalizeSimple = (rows: Record<string, unknown>[], label: string, columns: string[]) => rows.map((row, index) => {
    const result: Record<string, SqlArgument> = {}
    for (const column of columns) result[column] = requireFullRow(row, column, `database.${label}[${index}]`)
    return result
  })
  const normalizedDoctors = normalizeSimple(doctors, 'doctors', ['id','first_name','last_name','phone','comment','active','created_at','updated_at'])
  const normalizedColors = normalizeSimple(colors, 'colors', ['id','name','active','created_at','updated_at'])
  const normalizedExpensePricing = expensePricing.map((row, index) => ({
    id: requiredString(row.id, `database.expensePricingItems[${index}].id`),
    name: requiredString(row.name, `database.expensePricingItems[${index}].name`),
    unit_price: version >= 10 ? optionalNumber(row.unit_price, `database.expensePricingItems[${index}].unit_price`) : null,
    active: activeInteger(row.active, `database.expensePricingItems[${index}].active`),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '2026-09-24T00:00:00.000Z',
  }))
  const normalizedPricing = pricing.map((row, index) => {
    const metadata = row.metadata_json === undefined ? '{}' : requiredString(row.metadata_json, `database.pricingItems[${index}].metadata_json`)
    const parsedMetadata = JSON.parse(metadata) as unknown
    if (typeof parsedMetadata !== 'object' || parsedMetadata === null || Array.isArray(parsedMetadata)) throw new Error(`database.pricingItems[${index}].metadata_json must encode an object`)
    return {
      id: requiredString(row.id, `database.pricingItems[${index}].id`),
      name: requiredString(row.name, `database.pricingItems[${index}].name`),
      calculation_mode: requiredString(row.calculation_mode, `database.pricingItems[${index}].calculation_mode`),
      unit_price: optionalNumber(row.unit_price, `database.pricingItems[${index}].unit_price`),
      fixed_price: optionalNumber(row.fixed_price, `database.pricingItems[${index}].fixed_price`),
      active: activeInteger(row.active, `database.pricingItems[${index}].active`),
      metadata_json: metadata,
      updated_at: requiredString(row.updated_at, `database.pricingItems[${index}].updated_at`),
    }
  })
  const normalizedFinancials = normalizeSimple(financials, 'orderFinancials', ['order_id','final_total','received_amount','expenses','debt','financial_result','confirmed_at'])
  const normalizedRequiredFields = normalizeSimple(requiredFields, 'requiredFieldSettings', ['field_key','required','updated_at'])
  const normalizedSettings = settings.filter((row) => row.setting_key !== 'default_currency_code')
    .map((row, index) => ({ setting_key: requiredString(row.setting_key, `database.appSettings[${index}].setting_key`),
      setting_value: requiredString(row.setting_value, `database.appSettings[${index}].setting_value`),
      updated_at: requiredString(row.updated_at, `database.appSettings[${index}].updated_at`) }))
  const normalizedWorkItems = workItems.map((row, index) => {
    const sourceRow = row as Record<string, unknown>
    const result: Record<string, SqlArgument> = {}
    const columns = ['id','order_id','pricing_item_id','work_type_snapshot','status','unit_mode','units','unit_price_snapshot','total_price_snapshot',
      'accepted_amount','tooth_codes','shade','comment','started_at','completed_at','cancelled_at','created_at','updated_at']
    for (const column of columns) {
      result[column] = column === 'unit_price_snapshot' || column === 'total_price_snapshot' ? null
        : databaseValue(sourceRow[column], `database.workItems[${index}].${column}`)
    }
    return result
  })
  const normalizedOrdersSql = normalizedOrders.map((row, index) => {
    const sourceRow = row as Record<string, unknown>
    const columns = ['id','patient_label','doctor_id','doctor_name_snapshot','order_date','updated_at','deadline_at','status','closure_type','general_comment','archived_at','closure_date']
    const result: Record<string, SqlArgument> = {}
    for (const column of columns) result[column] = databaseValue(sourceRow[column], `database.orders[${index}].${column}`)
    return result
  })
  const normalizedExpensesSql = normalizedExpenses.map((row, index) => {
    const sourceRow = row as Record<string, unknown>
    const columns = ['id','order_id','amount','pricing_item_id','name_snapshot','unit_price_snapshot','quantity','category','comment']
    const result: Record<string, SqlArgument> = {}
    for (const column of columns) result[column] = databaseValue(sourceRow[column], `database.orderExpenses[${index}].${column}`)
    return result
  })
  const normalizedDebtsSql = normalizedDebts.map((row, index) => ({
    id: databaseValue(row.id, `database.orderDebts[${index}].id`),
    order_id: databaseValue(row.order_id, `database.orderDebts[${index}].order_id`),
    amount: databaseValue(row.amount, `database.orderDebts[${index}].amount`),
    comment: databaseValue(row.comment, `database.orderDebts[${index}].comment`),
  }))
  return [normalizedDoctors, normalizedColors, normalizedExpensePricing, normalizedPricing, normalizedOrdersSql, normalizedWorkItems,
    normalizedFinancials, normalizedExpensesSql, normalizedDebtsSql,
    payments.map((row) => ({ id: row.id, debt_id: row.debt_id, amount: row.amount, received_at: row.received_at })),
    normalizedRequiredFields, normalizedSettings]
}

async function importFullDatabase(envelope: Record<string, unknown>): Promise<number> {
  const tableRows = normalizeFullDatabase(envelope)
  const tables = [
    { name: 'doctors', columns: ['id','first_name','last_name','phone','comment','active','created_at','updated_at'] },
    { name: 'colors', columns: ['id','name','active','created_at','updated_at'] },
    { name: 'expense_pricing_items', columns: ['id','name','unit_price','active','updated_at'] },
    { name: 'pricing_items', columns: ['id','name','calculation_mode','unit_price','fixed_price','active','metadata_json','updated_at'] },
    { name: 'orders', columns: ['id','patient_label','doctor_id','doctor_name_snapshot','order_date','updated_at','deadline_at','status','closure_type','general_comment','archived_at','closure_date'] },
    { name: 'work_items', columns: ['id','order_id','pricing_item_id','work_type_snapshot','status','unit_mode','units','unit_price_snapshot','total_price_snapshot','accepted_amount','tooth_codes','shade','comment','started_at','completed_at','cancelled_at','created_at','updated_at'] },
    { name: 'order_financials', columns: ['order_id','final_total','received_amount','expenses','debt','financial_result','confirmed_at'] },
    { name: 'order_expenses', columns: ['id','order_id','amount','pricing_item_id','name_snapshot','unit_price_snapshot','quantity','category','comment'] },
    { name: 'order_debts', columns: ['id','order_id','amount','comment'] },
    { name: 'order_debt_payments', columns: ['id','debt_id','amount','received_at'] },
    { name: 'required_field_settings', columns: ['field_key','required','updated_at'] },
    { name: 'app_settings', columns: ['setting_key','setting_value','updated_at'] },
  ]
  const steps: SqlStep[] = [
    x('DELETE FROM order_debt_payments'), x('DELETE FROM order_debts'), x('DELETE FROM order_expenses'),
    x('DELETE FROM order_financials'), x('DELETE FROM work_items'), x('DELETE FROM orders'),
    x('DELETE FROM pricing_items'), x('DELETE FROM doctors'), x('DELETE FROM colors'),
    x('DELETE FROM expense_pricing_items'), x('DELETE FROM required_field_settings'), x('DELETE FROM app_settings'),
  ]
  for (const [tableIndex, table] of tables.entries()) {
    for (const row of tableRows[tableIndex]) {
      const args = table.columns.map((column) => {
        if (!Object.hasOwn(row, column)) throw new Error(`Missing normalized ${table.name}.${column}`)
        return row[column]
      })
      const marks = table.columns.map(() => '?').join(',')
      steps.push(x(`INSERT INTO ${table.name} (${table.columns.join(',')}) VALUES (${marks})`, args))
    }
  }
  await transaction(steps)
  return 1
}
