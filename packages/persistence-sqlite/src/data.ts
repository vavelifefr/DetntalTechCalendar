import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { isPermanentFdiToothCode, type PermanentFdiToothCode } from '@dental-tech/domain'
import { currentSchemaVersion } from './index.ts'

export type CalculationMode = 'PER_UNIT' | 'FIXED' | 'COMPOSITE'
export type WorkItemStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type UnitMode = 'TOOTH_COUNT' | 'FIXED' | 'OTHER'
export type OrderStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED'

export interface DoctorRecord {
  id: string
  firstName: string
  lastName: string
  phone: string
  comment: string
  active: boolean
}

export interface NamedDirectoryRecord {
  id: string
  name: string
  active: boolean
}

export type NamedDirectoryInput = Omit<NamedDirectoryRecord, 'id'> & { id?: string }

export interface PricingRecord {
  id: string
  itemType: 'WORK' | 'EXPENSE'
  name: string
  calculationMode: CalculationMode
  unitPrice: number | null
  fixedPrice: number | null
  active: boolean
  metadata: Record<string, unknown>
  updatedAt: string
}

export type DoctorInput = Omit<DoctorRecord, 'id'> & { id?: string }
export type PricingInput = Omit<PricingRecord, 'id' | 'updatedAt' | 'itemType'> & { id?: string; itemType?: PricingRecord['itemType'] }

export interface WorkItemInput {
  id?: string
  pricingItemId?: string | null
  workType: string
  unitMode?: UnitMode
  units?: number
  toothCodes?: string[]
  acceptedAmount?: number | null
  shade?: string | null
  comment?: string | null
  status?: WorkItemStatus
  startedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
}

export interface OrderExpenseInput {
  id?: string
  amount: number
  pricingItemId?: string | null
  name?: string | null
  unitPrice?: number | null
  quantity?: number
  category?: string | null
  comment?: string | null
}

export interface OrderExpenseRecord {
  id: string
  orderId: string
  amount: number
  pricingItemId: string | null
  name: string
  unitPrice: number
  quantity: number
  category: string | null
  comment: string | null
}

export interface OrderDebtPaymentInput {
  amount: number
}

export interface OrderDebtPaymentRecord {
  id: string
  debtId: string
  orderId: string
  amount: number
  receivedAt: string
}

export interface OrderFinancialSummary {
  expectedIncome: number
  income: number
  expenses: number
  debt: number
  receivedAmount: number
  debtRepaid: number
  balance: number
}

export type OrderClosureMode = 'NORMAL' | 'WITH_DEBT' | 'CANCELLED'

export interface CloseOrderInput {
  closureDate: string
  mode: OrderClosureMode
  receivedAmount: number
  debtAmount?: number
  debtComment?: string | null
}

export interface CreateOrderInput {
  patientLabel?: string | null
  doctorId?: string | null
  orderDate?: string | null
  deadlineAt?: string | null
  generalComment?: string | null
  expenses?: OrderExpenseInput[]
  workItems: WorkItemInput[]
}

export type UpdateOrderInput = Omit<CreateOrderInput, 'workItems'> & { closureDate?: string | null }

export interface OrderListRecord {
  id: string
  patientLabel: string | null
  doctorId: string | null
  doctorName: string
  orderDate: string
  deadlineAt: string | null
  status: OrderStatus
}

export interface CalendarOrderRecord extends OrderListRecord {
  workTypes: string[]
  financialSummary: OrderFinancialSummary
}

export interface WorkItemRecord extends Omit<WorkItemInput, 'toothCodes'> {
  toothCodes: PermanentFdiToothCode[]
  id: string
  orderId: string
  status: WorkItemStatus
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  acceptedAmount: number | null
}

export interface OrderDetailRecord extends OrderListRecord {
  generalComment: string | null
  closureDate: string | null
  closureType: string | null
  archivedAt: string | null
  workItems: WorkItemRecord[]
  expenses: OrderExpenseRecord[]
  debtPayments: OrderDebtPaymentRecord[]
  financialSummary: OrderFinancialSummary
}

export interface ArchivedOrderRecord extends OrderListRecord {
  closureDate: string | null
  closureType: string | null
  archivedAt: string | null
  workTypes: string[]
  financialSummary: OrderFinancialSummary
}

export interface DebtListRecord {
  id: string
  orderId: string
  status: Exclude<OrderStatus, 'ACTIVE'>
  patientLabel: string | null
  doctorId: string | null
  doctorName: string
  closureDate: string | null
  amount: number
  originalAmount: number
  paidAmount: number
  comment: string | null
  workTypes: string[]
}

export interface DoctorStatisticsRecord {
  doctorId: string | null
  doctorName: string
  orderCount: number
  expectedIncome: number
  income: number
  receivedAmount: number
  debtRepaid: number
  expenses: number
  debt: number
  balance: number
}

export interface OrderStatisticsRecord extends OrderFinancialSummary {
  fromDate: string | null
  toDate: string | null
  orderCount: number
  byDoctor: DoctorStatisticsRecord[]
}

export interface RequiredFieldRecord {
  fieldKey: string
  required: boolean
}

export interface ExchangeEnvelope {
  format: 'dental-tech-calendar'
  dataset: string
  formatVersion: number
  [key: string]: unknown
}

export class DataValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataValidationError'
  }
}

const formatVersion = 1
const currentSchema = 10
const allowedRequiredFields = new Set(['patient_label', 'doctor_id', 'deadline_at'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DataValidationError(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function optionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new DataValidationError(`${label} must be a string`)
  return value
}

function nullableText(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new DataValidationError(`${label} must be a string`)
  return value.trim() || null
}

function parseToothCodes(value: unknown, label: string): PermanentFdiToothCode[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new DataValidationError(`${label} must be an array`)
  const codes = value.map((code, index) => {
    if (!isPermanentFdiToothCode(code)) {
      throw new DataValidationError(`${label}[${index}] must be a permanent FDI tooth code`)
    }
    return code
  })
  if (new Set(codes).size !== codes.length) throw new DataValidationError(`${label} must not contain duplicate teeth`)
  return codes
}

function parseStoredToothCodes(value: unknown, label: string): PermanentFdiToothCode[] {
  if (value === undefined || value === null || value === '') return []
  if (typeof value !== 'string') throw new DataValidationError(`${label} must be comma-separated text`)
  return parseToothCodes(value.split(',').map((code) => code.trim()), label)
}

function serializeToothCodes(toothCodes: readonly string[]): string | null {
  return toothCodes.length === 0 ? null : [...toothCodes].sort().join(',')
}

function parseUnits(value: unknown, label: string): number {
  const units = value ?? 1
  if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0) {
    throw new DataValidationError(`${label} must be greater than zero`)
  }
  return units
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new DataValidationError(`${label} must be a non-negative number`)
  }
  return value
}

function booleanValue(value: unknown, fallback = true): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new DataValidationError('active must be a boolean')
  return value
}

function validateEnvelope(value: unknown, dataset: string): Record<string, unknown> {
  if (!isRecord(value)) throw new DataValidationError('JSON root must be an object')
  if (value.format !== 'dental-tech-calendar') throw new DataValidationError('Unsupported file format')
  if (value.dataset !== dataset) throw new DataValidationError(`Expected dataset ${dataset}`)
  if (value.formatVersion !== formatVersion) throw new DataValidationError('Unsupported format version')
  return value
}

function parseDoctors(payload: unknown): DoctorRecord[] {
  const envelope = validateEnvelope(payload, 'doctor-directory')
  if (!Array.isArray(envelope.doctors)) throw new DataValidationError('doctors must be an array')
  const ids = new Set<string>()
  return envelope.doctors.map((value, index) => {
    if (!isRecord(value)) throw new DataValidationError(`doctors[${index}] must be an object`)
    const id = nonEmptyString(value.id, `doctors[${index}].id`)
    if (ids.has(id)) throw new DataValidationError(`Duplicate doctor id: ${id}`)
    ids.add(id)
    return {
      id,
      firstName: nonEmptyString(value.firstName, `doctors[${index}].firstName`),
      lastName: nonEmptyString(value.lastName, `doctors[${index}].lastName`),
      phone: optionalString(value.phone, `doctors[${index}].phone`),
      comment: optionalString(value.comment, `doctors[${index}].comment`),
      active: booleanValue(value.active),
    }
  })
}

function parseNamedDirectoryEntries(value: unknown, label: string): NamedDirectoryRecord[] {
  if (!Array.isArray(value)) throw new DataValidationError(`${label} must be an array`)
  const ids = new Set<string>()
  const names = new Set<string>()
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new DataValidationError(`${label}[${index}] must be an object`)
    const id = nonEmptyString(entry.id, `${label}[${index}].id`)
    const name = nonEmptyString(entry.name, `${label}[${index}].name`)
    const normalizedName = name.toLocaleLowerCase('ru')
    if (ids.has(id)) throw new DataValidationError(`Duplicate ${label} id: ${id}`)
    if (names.has(normalizedName)) throw new DataValidationError(`Duplicate ${label} name: ${name}`)
    ids.add(id)
    names.add(normalizedName)
    return { id, name, active: booleanValue(entry.active) }
  })
}

function parsePricing(payload: unknown): PricingRecord[] {
  const envelope = validateEnvelope(payload, 'pricing')
  if (!Array.isArray(envelope.items)) throw new DataValidationError('items must be an array')
  const ids = new Set<string>()
  return envelope.items.map((value, index) => {
    if (!isRecord(value)) throw new DataValidationError(`items[${index}] must be an object`)
    const id = nonEmptyString(value.id, `items[${index}].id`)
    if (ids.has(id)) throw new DataValidationError(`Duplicate Pricing id: ${id}`)
    ids.add(id)
    const itemType = value.itemType === undefined ? 'WORK' : value.itemType
    if (itemType !== 'WORK' && itemType !== 'EXPENSE') {
      throw new DataValidationError(`items[${index}].itemType is invalid`)
    }
    const calculationMode = value.calculationMode
    if (!['PER_UNIT', 'FIXED', 'COMPOSITE'].includes(String(calculationMode))) {
      throw new DataValidationError(`items[${index}].calculationMode is invalid`)
    }
    const unitPrice = optionalNumber(value.unitPrice, `items[${index}].unitPrice`)
    const fixedPrice = optionalNumber(value.fixedPrice, `items[${index}].fixedPrice`)
    if (itemType === 'EXPENSE' && (calculationMode !== 'PER_UNIT' || fixedPrice !== null)) {
      throw new DataValidationError(`items[${index}] expense items must use PER_UNIT pricing`)
    }
    if (itemType === 'WORK' && calculationMode === 'PER_UNIT' && (unitPrice === null || fixedPrice !== null)) {
      throw new DataValidationError(`items[${index}] needs only unitPrice for PER_UNIT`)
    }
    if (itemType === 'WORK' && calculationMode === 'FIXED' && (fixedPrice === null || unitPrice !== null)) {
      throw new DataValidationError(`items[${index}] needs only fixedPrice for FIXED`)
    }
    if (itemType === 'WORK' && calculationMode === 'COMPOSITE' && unitPrice === null && fixedPrice === null) {
      throw new DataValidationError(`items[${index}] needs a configured price for COMPOSITE`)
    }
    const metadata = value.metadata === undefined ? {} : value.metadata
    if (!isRecord(metadata)) throw new DataValidationError(`items[${index}].metadata must be an object`)
    const updatedAt = value.updatedAt === undefined ? '2026-09-24T00:00:00.000Z' : nonEmptyString(value.updatedAt, `items[${index}].updatedAt`)
    return {
      id,
      itemType,
      name: nonEmptyString(value.name, `items[${index}].name`),
      calculationMode: calculationMode as CalculationMode,
      unitPrice,
      fixedPrice,
      active: booleanValue(value.active),
      metadata,
      updatedAt,
    }
  })
}

function doctorFromRow(row: Record<string, unknown>): DoctorRecord {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    phone: String(row.phone),
    comment: String(row.comment),
    active: Number(row.active) === 1,
  }
}

function pricingFromRow(row: Record<string, unknown>): PricingRecord {
  return {
    id: String(row.id),
    itemType: 'WORK',
    name: String(row.name),
    calculationMode: String(row.calculation_mode) as CalculationMode,
    unitPrice: row.unit_price === null ? null : Number(row.unit_price),
    fixedPrice: row.fixed_price === null ? null : Number(row.fixed_price),
    active: Number(row.active) === 1,
    metadata: JSON.parse(String(row.metadata_json)) as Record<string, unknown>,
    updatedAt: String(row.updated_at),
  }
}

function insertDoctor(database: Database.Database, doctor: DoctorRecord, now: string) {
  database.prepare(`
    INSERT INTO doctors (id, first_name, last_name, phone, comment, active, created_at, updated_at)
    VALUES (@id, @firstName, @lastName, @phone, @comment, @active, @now, @now)
  `).run({ ...doctor, active: doctor.active ? 1 : 0, now })
}

function insertPricing(database: Database.Database, item: PricingRecord) {
  if (item.itemType === 'EXPENSE') {
    database.prepare(`
      INSERT INTO expense_pricing_items (id, name, unit_price, active, updated_at)
      VALUES (@id, @name, @unitPrice, @active, @updatedAt)
    `).run({ id: item.id, name: item.name, unitPrice: item.unitPrice, active: item.active ? 1 : 0, updatedAt: item.updatedAt })
    return
  }
  database.prepare(`
    INSERT INTO pricing_items (
      id, name, calculation_mode, unit_price, fixed_price, active, metadata_json, updated_at
    ) VALUES (@id, @name, @calculationMode, @unitPrice, @fixedPrice, @active, @metadataJson, @updatedAt)
  `).run({
    id: item.id,
    name: item.name,
    calculationMode: item.calculationMode,
    unitPrice: item.unitPrice,
    fixedPrice: item.fixedPrice,
    active: item.active ? 1 : 0,
    metadataJson: JSON.stringify(item.metadata),
    updatedAt: item.updatedAt,
  })
}

export function getDoctors(database: Database.Database): DoctorRecord[] {
  const rows = database.prepare('SELECT * FROM doctors ORDER BY last_name, first_name, id').all() as Record<string, unknown>[]
  return rows.map(doctorFromRow)
}

type NamedDirectoryTable = 'colors'

function getNamedDirectory(database: Database.Database, table: NamedDirectoryTable): NamedDirectoryRecord[] {
  const rows = database.prepare(`SELECT id, name, active FROM ${table} ORDER BY name COLLATE NOCASE, id`).all() as Array<{ id: string; name: string; active: number }>
  return rows.map((row) => ({ id: row.id, name: row.name, active: row.active === 1 }))
}

export function getColors(database: Database.Database): NamedDirectoryRecord[] {
  return getNamedDirectory(database, 'colors')
}

export function getExpenseCategories(database: Database.Database): NamedDirectoryRecord[] {
  const rows = database.prepare('SELECT id, name, active FROM expense_pricing_items ORDER BY name COLLATE NOCASE, id').all() as Array<{ id: string; name: string; active: number }>
  return rows.map((row) => ({ id: row.id, name: row.name, active: row.active === 1 }))
}

export function getPricing(database: Database.Database): PricingRecord[] {
  const workRows = database.prepare('SELECT * FROM pricing_items ORDER BY name, id').all() as Record<string, unknown>[]
  const expenseRows = database.prepare('SELECT id, name, unit_price, active, updated_at FROM expense_pricing_items ORDER BY name, id').all() as Record<string, unknown>[]
  const expenses = expenseRows.map((row): PricingRecord => ({
    id: String(row.id),
    itemType: 'EXPENSE',
    name: String(row.name),
    calculationMode: 'PER_UNIT',
    unitPrice: row.unit_price === null ? null : Number(row.unit_price),
    fixedPrice: null,
    active: Number(row.active) === 1,
    metadata: {},
    updatedAt: String(row.updated_at),
  }))
  return [...workRows.map(pricingFromRow), ...expenses].sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id))
}

export function exportDoctorDirectory(database: Database.Database): ExchangeEnvelope {
  return {
    format: 'dental-tech-calendar',
    dataset: 'doctor-directory',
    formatVersion,
    doctors: getDoctors(database),
  }
}

export function exportDirectory(database: Database.Database): ExchangeEnvelope {
  return {
    format: 'dental-tech-calendar',
    dataset: 'directory',
    formatVersion,
    doctors: getDoctors(database),
    colors: getColors(database),
  }
}

export function exportPricing(database: Database.Database): ExchangeEnvelope {
  const items = getPricing(database)
  return {
    format: 'dental-tech-calendar',
    dataset: 'pricing',
    formatVersion,
    pricingVersion: 2,
    items,
  }
}

export function replaceDoctorDirectory(database: Database.Database, payload: unknown): number {
  const doctors = parseDoctors(payload)
  const now = new Date().toISOString()
  const oldRefs = database.prepare('SELECT id, doctor_id FROM orders WHERE doctor_id IS NOT NULL').all() as Array<{ id: string; doctor_id: string }>
  const incomingIds = new Set(doctors.map((doctor) => doctor.id))

  database.transaction(() => {
    database.prepare('DELETE FROM doctors').run()
    for (const doctor of doctors) insertDoctor(database, doctor, now)
    for (const ref of oldRefs) {
      if (incomingIds.has(ref.doctor_id)) {
        database.prepare('UPDATE orders SET doctor_id = ? WHERE id = ?').run(ref.doctor_id, ref.id)
      }
    }
  })()
  return doctors.length
}

export function replaceDirectory(database: Database.Database, payload: unknown): number {
  const envelope = validateEnvelope(payload, 'directory')
  const doctors = parseDoctors({ ...envelope, dataset: 'doctor-directory' })
  const colors = parseNamedDirectoryEntries(envelope.colors, 'colors')
  const now = new Date().toISOString()
  const oldRefs = database.prepare('SELECT id, doctor_id FROM orders WHERE doctor_id IS NOT NULL').all() as Array<{ id: string; doctor_id: string }>
  const incomingIds = new Set(doctors.map((doctor) => doctor.id))

  database.transaction(() => {
    database.prepare('DELETE FROM doctors').run()
    database.prepare('DELETE FROM colors').run()
    for (const doctor of doctors) insertDoctor(database, doctor, now)
    for (const color of colors) insertNamedDirectoryEntry(database, 'colors', color, now)
    for (const ref of oldRefs) {
      if (incomingIds.has(ref.doctor_id)) {
        database.prepare('UPDATE orders SET doctor_id = ? WHERE id = ?').run(ref.doctor_id, ref.id)
      }
    }
  })()
  return doctors.length + colors.length
}

export function replacePricing(database: Database.Database, payload: unknown): number {
  const envelope = validateEnvelope(payload, 'pricing')
  const items = parsePricing(payload)
  const includesExpenseSection = envelope.pricingVersion === 2
    || items.some((item) => item.itemType === 'EXPENSE')
  if (envelope.pricingVersion !== undefined && envelope.pricingVersion !== 2) {
    throw new DataValidationError('Unsupported pricing version')
  }
  database.transaction(() => {
    database.prepare('DELETE FROM pricing_items').run()
    if (includesExpenseSection) database.prepare('DELETE FROM expense_pricing_items').run()
    for (const item of items) insertPricing(database, item)
  })()
  return items.length
}

export function saveDoctor(database: Database.Database, input: DoctorInput): DoctorRecord {
  const firstName = nonEmptyString(input.firstName, 'firstName')
  const lastName = nonEmptyString(input.lastName, 'lastName')
  const phone = optionalString(input.phone, 'phone')
  const comment = optionalString(input.comment, 'comment')
  const active = booleanValue(input.active)
  const id = input.id?.trim() || randomUUID()
  const now = new Date().toISOString()
  const existing = database.prepare('SELECT id FROM doctors WHERE id = ?').get(id)
  if (existing) {
    database.prepare(`
      UPDATE doctors SET first_name = ?, last_name = ?, phone = ?, comment = ?, active = ?, updated_at = ? WHERE id = ?
    `).run(firstName, lastName, phone, comment, active ? 1 : 0, now, id)
    database.prepare(`
      UPDATE orders SET doctor_name_snapshot = ? WHERE doctor_id = ? AND status = 'ACTIVE'
    `).run(`${firstName} ${lastName}`, id)
  } else {
    insertDoctor(database, { id, firstName, lastName, phone, comment, active }, now)
  }
  return { id, firstName, lastName, phone, comment, active }
}

export function deleteDoctor(database: Database.Database, id: string): void {
  const result = database.prepare('DELETE FROM doctors WHERE id = ?').run(id)
  if (result.changes === 0) throw new DataValidationError('Doctor not found')
}

function insertNamedDirectoryEntry(database: Database.Database, table: NamedDirectoryTable, entry: NamedDirectoryRecord, now: string): void {
  database.prepare(`
    INSERT INTO ${table} (id, name, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.id, entry.name, entry.active ? 1 : 0, now, now)
}

function saveNamedDirectoryEntry(database: Database.Database, table: NamedDirectoryTable, input: NamedDirectoryInput): NamedDirectoryRecord {
  const name = nonEmptyString(input.name, 'name')
  const active = booleanValue(input.active)
  const id = input.id?.trim() || randomUUID()
  const duplicate = (database.prepare(`SELECT id, name FROM ${table}`).all() as Array<{ id: string; name: string }>)
    .find((entry) => entry.id !== id && entry.name.trim().toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))
  if (duplicate) throw new DataValidationError('A color with this name already exists')
  const existing = database.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)
  const now = new Date().toISOString()
  if (existing) {
    database.prepare(`UPDATE ${table} SET name = ?, active = ?, updated_at = ? WHERE id = ?`).run(name, active ? 1 : 0, now, id)
  } else {
    insertNamedDirectoryEntry(database, table, { id, name, active }, now)
  }
  return { id, name, active }
}

function deleteNamedDirectoryEntry(database: Database.Database, table: NamedDirectoryTable, id: string): void {
  const result = database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
  if (result.changes === 0) throw new DataValidationError('Color not found')
}

export function saveColor(database: Database.Database, input: NamedDirectoryInput): NamedDirectoryRecord {
  return saveNamedDirectoryEntry(database, 'colors', input)
}

export function deleteColor(database: Database.Database, id: string): void {
  deleteNamedDirectoryEntry(database, 'colors', id)
}

export function saveExpenseCategory(database: Database.Database, input: NamedDirectoryInput): NamedDirectoryRecord {
  const name = nonEmptyString(input.name, 'name')
  const active = booleanValue(input.active)
  const id = input.id?.trim() || randomUUID()
  const existing = database.prepare('SELECT id FROM expense_pricing_items WHERE id = ?').get(id)
  const now = new Date().toISOString()
  if (existing) {
    database.prepare('UPDATE expense_pricing_items SET name = ?, active = ?, updated_at = ? WHERE id = ?').run(name, active ? 1 : 0, now, id)
  } else {
    database.prepare('INSERT INTO expense_pricing_items (id, name, unit_price, active, updated_at) VALUES (?, ?, NULL, ?, ?)')
      .run(id, name, active ? 1 : 0, now)
  }
  return { id, name, active }
}

export function deleteExpenseCategory(database: Database.Database, id: string): void {
  const result = database.prepare('DELETE FROM expense_pricing_items WHERE id = ?').run(id)
  if (result.changes === 0) throw new DataValidationError('Expense category not found')
  database.prepare('UPDATE order_expenses SET pricing_item_id = NULL WHERE pricing_item_id = ?').run(id)
}

export function savePricing(database: Database.Database, input: PricingInput): PricingRecord {
  const name = nonEmptyString(input.name, 'name')
  const itemType = input.itemType ?? 'WORK'
  if (itemType !== 'WORK' && itemType !== 'EXPENSE') throw new DataValidationError('itemType is invalid')
  if (!['PER_UNIT', 'FIXED', 'COMPOSITE'].includes(input.calculationMode)) {
    throw new DataValidationError('calculationMode is invalid')
  }
  const unitPrice = optionalNumber(input.unitPrice, 'unitPrice')
  const fixedPrice = optionalNumber(input.fixedPrice, 'fixedPrice')
  if (itemType === 'EXPENSE' && (input.calculationMode !== 'PER_UNIT' || fixedPrice !== null)) {
    throw new DataValidationError('Expense items must use PER_UNIT pricing')
  }
  if (itemType === 'WORK' && input.calculationMode === 'PER_UNIT' && (unitPrice === null || fixedPrice !== null)) {
    throw new DataValidationError('PER_UNIT requires unitPrice only')
  }
  if (itemType === 'WORK' && input.calculationMode === 'FIXED' && (fixedPrice === null || unitPrice !== null)) {
    throw new DataValidationError('FIXED requires fixedPrice only')
  }
  if (itemType === 'WORK' && input.calculationMode === 'COMPOSITE' && unitPrice === null && fixedPrice === null) {
    throw new DataValidationError('COMPOSITE requires a configured price')
  }
  const metadata = input.metadata ?? {}
  if (!isRecord(metadata)) throw new DataValidationError('metadata must be an object')
  const active = booleanValue(input.active)
  const id = input.id?.trim() || randomUUID()
  const updatedAt = new Date().toISOString()
  if (itemType === 'EXPENSE') {
    if (database.prepare('SELECT 1 FROM pricing_items WHERE id = ?').get(id)) {
      throw new DataValidationError('Pricing item id is already used by a work position')
    }
    database.prepare(`
      INSERT INTO expense_pricing_items (id, name, unit_price, active, updated_at)
      VALUES (@id, @name, @unitPrice, @active, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        unit_price = excluded.unit_price,
        active = excluded.active,
        updated_at = excluded.updated_at
    `).run({ id, name, unitPrice, active: active ? 1 : 0, updatedAt })
    return { id, itemType, name, calculationMode: 'PER_UNIT', unitPrice, fixedPrice: null, active, metadata: {}, updatedAt }
  }
  if (database.prepare('SELECT 1 FROM expense_pricing_items WHERE id = ?').get(id)) {
    throw new DataValidationError('Pricing item id is already used by an expense position')
  }
  const values = { id, name, calculationMode: input.calculationMode, unitPrice, fixedPrice, active: active ? 1 : 0, metadataJson: JSON.stringify(metadata), updatedAt }
  database.prepare(`
    INSERT INTO pricing_items (id, name, calculation_mode, unit_price, fixed_price, active, metadata_json, updated_at)
    VALUES (@id, @name, @calculationMode, @unitPrice, @fixedPrice, @active, @metadataJson, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      calculation_mode = excluded.calculation_mode,
      unit_price = excluded.unit_price,
      fixed_price = excluded.fixed_price,
      active = excluded.active,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(values)
  return { id, itemType, name, calculationMode: input.calculationMode, unitPrice, fixedPrice, active, metadata, updatedAt }
}

export function deletePricing(database: Database.Database, id: string): void {
  const expenseResult = database.prepare('DELETE FROM expense_pricing_items WHERE id = ?').run(id)
  if (expenseResult.changes > 0) {
    database.prepare('UPDATE order_expenses SET pricing_item_id = NULL WHERE pricing_item_id = ?').run(id)
    return
  }
  const result = database.prepare('DELETE FROM pricing_items WHERE id = ?').run(id)
  if (result.changes === 0) throw new DataValidationError('Pricing item not found')
}

export function getRequiredFields(database: Database.Database): RequiredFieldRecord[] {
  const rows = database.prepare('SELECT field_key, required FROM required_field_settings ORDER BY field_key').all() as Array<{
    field_key: string
    required: number
  }>
  return rows.map((row) => ({ fieldKey: row.field_key, required: row.required === 1 }))
}

export function setRequiredFields(database: Database.Database, fields: unknown): RequiredFieldRecord[] {
  if (!Array.isArray(fields)) throw new DataValidationError('requiredFields must be an array')
  const parsed = fields.map((field, index) => {
    if (!isRecord(field)) throw new DataValidationError(`requiredFields[${index}] must be an object`)
    const fieldKey = nonEmptyString(field.fieldKey, `requiredFields[${index}].fieldKey`)
    if (!allowedRequiredFields.has(fieldKey)) throw new DataValidationError(`Unsupported required field: ${fieldKey}`)
    if (typeof field.required !== 'boolean') throw new DataValidationError(`requiredFields[${index}].required must be a boolean`)
    return { fieldKey, required: field.required }
  })
  const keys = new Set(parsed.map((field) => field.fieldKey))
  if (keys.size !== parsed.length) throw new DataValidationError('Duplicate required field setting')
  const now = new Date().toISOString()
  database.transaction(() => {
    for (const field of parsed) {
      database.prepare(`
        INSERT INTO required_field_settings (field_key, required, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(field_key) DO UPDATE SET required = excluded.required, updated_at = excluded.updated_at
      `).run(field.fieldKey, field.required ? 1 : 0, now)
    }
  })()
  return getRequiredFields(database)
}

function formatIsoDateTime(value: string | null | undefined, label: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new DataValidationError(`${label} is required`)
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new DataValidationError(`${label} must be a valid date`)
  return date.toISOString()
}

function formatBusinessDate(value: unknown, label: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new DataValidationError(`${label} is required`)
    return null
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DataValidationError(`${label} must use YYYY-MM-DD format`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DataValidationError(`${label} must be a valid date`)
  }
  return value
}

function todayBusinessDate(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function assertDeadlineNotBeforeOrderDate(orderDate: string, deadlineAt: string | null): void {
  if (deadlineAt && deadlineAt.slice(0, 10) < orderDate) {
    throw new DataValidationError('deadlineAt cannot be earlier than orderDate')
  }
}

function calculateWorkItemAmount(
  database: Database.Database,
  pricingItemId: string | null,
  units: number,
  requireActive = true,
): number | null {
  if (!pricingItemId) return null
  const query = requireActive
    ? 'SELECT calculation_mode, unit_price, fixed_price FROM pricing_items WHERE id = ? AND active = 1'
    : 'SELECT calculation_mode, unit_price, fixed_price FROM pricing_items WHERE id = ?'
  const pricing = database.prepare(query).get(pricingItemId) as
    | { calculation_mode: CalculationMode; unit_price: number | null; fixed_price: number | null }
    | undefined
  if (!pricing) throw new DataValidationError(`Pricing item not found: ${pricingItemId}`)
  if (pricing.calculation_mode === 'PER_UNIT') {
    return (pricing.unit_price ?? 0) * units
  }
  return pricing.fixed_price
}

interface ParsedExpense {
  id: string
  amount: number
  pricingItemId: string | null
  name: string
  unitPrice: number
  quantity: number
  category: string | null
  comment: string | null
}

function parseExpenseInputs(database: Database.Database, value: unknown, allowInactivePricing = false): ParsedExpense[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new DataValidationError('expenses must be an array')
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new DataValidationError(`expenses[${index}] must be an object`)
    const hasSnapshotFields = ['pricingItemId', 'name', 'unitPrice', 'quantity'].some((key) => Object.prototype.hasOwnProperty.call(entry, key))
    const legacyAmount = entry.amount
    const amount = legacyAmount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new DataValidationError(`expenses[${index}].amount must be greater than zero`)
    }
    const pricingItemId = nullableText(entry.pricingItemId, `expenses[${index}].pricingItemId`)
    const pricingItem = pricingItemId
      ? database.prepare('SELECT name, unit_price, active FROM expense_pricing_items WHERE id = ?').get(pricingItemId) as { name: string; unit_price: number | null; active: number } | undefined
      : undefined
    if (pricingItemId && (!pricingItem || (!allowInactivePricing && pricingItem.active !== 1))) {
      throw new DataValidationError(`Expense Pricing item not found or unavailable: ${pricingItemId}`)
    }
    const quantity = parseUnits(entry.quantity, `expenses[${index}].quantity`)
    const inputUnitPrice = optionalNumber(entry.unitPrice, `expenses[${index}].unitPrice`)
    const unitPrice = inputUnitPrice ?? pricingItem?.unit_price ?? (hasSnapshotFields ? null : amount)
    if (unitPrice === null || unitPrice <= 0) {
      throw new DataValidationError(`expenses[${index}].unitPrice must be greater than zero`)
    }
    const calculatedTotal = Math.round(unitPrice * quantity * 100) / 100
    if (hasSnapshotFields && Math.abs(amount - calculatedTotal) > 0.000001) {
      throw new DataValidationError(`expenses[${index}].amount must equal unitPrice multiplied by quantity`)
    }
    const category = nullableText(entry.category, `expenses[${index}].category`)
    const name = nonEmptyString(entry.name ?? pricingItem?.name ?? category ?? 'Расход', `expenses[${index}].name`)
    return {
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : randomUUID(),
      amount: hasSnapshotFields ? calculatedTotal : amount,
      pricingItemId,
      name,
      unitPrice,
      quantity,
      category,
      comment: nullableText(entry.comment, `expenses[${index}].comment`),
    }
  })
}

export function createOrder(database: Database.Database, input: CreateOrderInput): OrderListRecord {
  if (!isRecord(input)) throw new DataValidationError('Order must be an object')
  const required = new Map(getRequiredFields(database).map((field) => [field.fieldKey, field.required]))
  const patientLabel = nullableText(input.patientLabel, 'patientLabel')
  const doctorId = nullableText(input.doctorId, 'doctorId')
  const generalComment = nullableText(input.generalComment, 'generalComment')
  const orderDate = formatBusinessDate(input.orderDate ?? todayBusinessDate(), 'orderDate', true)!
  if (required.get('patient_label') && !patientLabel) throw new DataValidationError('patientLabel is required')
  if (required.get('doctor_id') && !doctorId) throw new DataValidationError('doctorId is required')
  const deadlineAt = formatIsoDateTime(input.deadlineAt, 'deadlineAt', required.get('deadline_at') === true)
  assertDeadlineNotBeforeOrderDate(orderDate, deadlineAt)
  if (!Array.isArray(input.workItems) || input.workItems.length === 0) {
    throw new DataValidationError('At least one WorkItem is required')
  }
  if (doctorId && !database.prepare('SELECT 1 FROM doctors WHERE id = ? AND active = 1').get(doctorId)) {
    throw new DataValidationError('Selected Doctor is unavailable')
  }
  const expenses = parseExpenseInputs(database, input.expenses)

  const workItems = input.workItems.map((item, index) => {
    if (!isRecord(item)) throw new DataValidationError(`workItems[${index}] must be an object`)
    const workType = nonEmptyString(item.workType, `workItems[${index}].workType`)
    const unitMode = item.unitMode ?? 'OTHER'
    if (!['TOOTH_COUNT', 'FIXED', 'OTHER'].includes(String(unitMode))) {
      throw new DataValidationError(`workItems[${index}].unitMode is invalid`)
    }
    const toothCodes = parseToothCodes(item.toothCodes, `workItems[${index}].toothCodes`)
    if (unitMode === 'TOOTH_COUNT' && toothCodes.length === 0) {
      throw new DataValidationError(`workItems[${index}] must have at least one selected tooth`)
    }
    if (!['TOOTH_COUNT', 'OTHER'].includes(String(unitMode)) && toothCodes.length > 0) {
      throw new DataValidationError(`workItems[${index}] cannot assign teeth to a fixed work type`)
    }
    if (unitMode === 'OTHER' && toothCodes.length > 0 && Number(item.units ?? toothCodes.length) !== toothCodes.length) {
      throw new DataValidationError(`workItems[${index}].units must equal its entered tooth count`)
    }
    const units = unitMode === 'TOOTH_COUNT' || (unitMode === 'OTHER' && toothCodes.length > 0)
      ? toothCodes.length
      : parseUnits(item.units, `workItems[${index}].units`)
    const pricingItemId = item.pricingItemId || null
    const calculatedAmount = calculateWorkItemAmount(database, pricingItemId, units)
    const acceptedAmount = item.acceptedAmount === undefined
      ? calculatedAmount
      : optionalNumber(item.acceptedAmount, `workItems[${index}].acceptedAmount`)
    return {
      id: item.id?.trim() || randomUUID(),
      pricingItemId,
      workType,
      unitMode: unitMode as UnitMode,
      units,
      toothCodes,
      acceptedAmount,
      shade: nullableText(item.shade, `workItems[${index}].shade`),
      comment: nullableText(item.comment, `workItems[${index}].comment`),
    }
  })

  const id = randomUUID()
  const now = new Date().toISOString()
  const doctor = doctorId
    ? database.prepare('SELECT first_name, last_name FROM doctors WHERE id = ?').get(doctorId) as { first_name: string; last_name: string }
    : undefined
  const doctorNameSnapshot = doctor ? `${doctor.first_name} ${doctor.last_name}` : ''
  database.transaction(() => {
    database.prepare(`
      INSERT INTO orders (id, patient_label, doctor_id, doctor_name_snapshot, order_date, updated_at, deadline_at, status, general_comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(id, patientLabel, doctorId, doctorNameSnapshot, orderDate, now, deadlineAt, generalComment)
    const insertWorkItem = database.prepare(`
      INSERT INTO work_items (
        id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units,
        unit_price_snapshot, total_price_snapshot, accepted_amount, tooth_codes, shade, comment, started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of workItems) {
      insertWorkItem.run(
        item.id, id, item.pricingItemId, item.workType, item.unitMode, item.units,
        null, null, item.acceptedAmount, serializeToothCodes(item.toothCodes), item.shade, item.comment, now, now, now,
      )
    }
    const insertExpense = database.prepare(`
      INSERT INTO order_expenses (id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const expense of expenses) insertExpense.run(
      expense.id, id, expense.amount, expense.pricingItemId, expense.name, expense.unitPrice, expense.quantity, expense.category, expense.comment,
    )
  })()
  return { id, patientLabel, doctorId, doctorName: doctorNameSnapshot, orderDate, deadlineAt, status: 'ACTIVE' }
}

export function listOrders(database: Database.Database, status?: OrderStatus): OrderListRecord[] {
  const rows = status
    ? database.prepare(`
        SELECT id, patient_label, doctor_id, doctor_name_snapshot, order_date, deadline_at, status
        FROM orders WHERE status = ? ORDER BY deadline_at, order_date, id
      `).all(status)
    : database.prepare(`
        SELECT id, patient_label, doctor_id, doctor_name_snapshot, order_date, deadline_at, status
        FROM orders ORDER BY deadline_at, order_date, id
      `).all()
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    patientLabel: row.patient_label === null ? null : String(row.patient_label),
    doctorId: row.doctor_id === null ? null : String(row.doctor_id),
    doctorName: String(row.doctor_name_snapshot),
    orderDate: String(row.order_date),
    deadlineAt: row.deadline_at === null ? null : String(row.deadline_at),
    status: String(row.status) as OrderStatus,
  }))
}

export function listCalendarOrders(database: Database.Database): CalendarOrderRecord[] {
  const orders = listOrders(database, 'ACTIVE')
  if (orders.length === 0) return []

  const workTypesByOrder = new Map<string, string[]>()
  const workRows = database.prepare(`
    SELECT work_items.order_id, work_items.work_type_snapshot
    FROM work_items
    INNER JOIN orders ON orders.id = work_items.order_id
    WHERE orders.status = 'ACTIVE'
    ORDER BY work_items.rowid
  `).all() as Array<{ order_id: string; work_type_snapshot: string }>
  for (const row of workRows) {
    const current = workTypesByOrder.get(row.order_id) ?? []
    current.push(row.work_type_snapshot)
    workTypesByOrder.set(row.order_id, current)
  }

  const incomeByOrder = new Map<string, number>((database.prepare(`
    SELECT work_items.order_id, COALESCE(SUM(work_items.accepted_amount), 0) AS income
    FROM work_items
    INNER JOIN orders ON orders.id = work_items.order_id
    WHERE orders.status = 'ACTIVE' AND work_items.status <> 'CANCELLED'
    GROUP BY work_items.order_id
  `).all() as Array<{ order_id: string; income: number }>).map((row) => [row.order_id, Number(row.income)]))

  const expensesByOrder = new Map<string, number>((database.prepare(`
    SELECT order_expenses.order_id, COALESCE(SUM(order_expenses.amount), 0) AS expenses
    FROM order_expenses
    INNER JOIN orders ON orders.id = order_expenses.order_id
    WHERE orders.status = 'ACTIVE'
    GROUP BY order_expenses.order_id
  `).all() as Array<{ order_id: string; expenses: number }>).map((row) => [row.order_id, Number(row.expenses)]))

  return orders.map((order) => {
    const income = incomeByOrder.get(order.id) ?? 0
    const expenses = expensesByOrder.get(order.id) ?? 0
    return {
      ...order,
      workTypes: workTypesByOrder.get(order.id) ?? [],
      financialSummary: { expectedIncome: income, income, expenses, debt: 0, receivedAmount: 0, debtRepaid: 0, balance: income - expenses },
    }
  })
}

export function getOrder(database: Database.Database, orderId: string): OrderDetailRecord | undefined {
  const row = database.prepare(`
    SELECT id, patient_label, doctor_id, doctor_name_snapshot, order_date, deadline_at, status, general_comment,
           closure_date, closure_type, archived_at
    FROM orders WHERE id = ?
  `).get(orderId) as Record<string, unknown> | undefined
  if (!row) return undefined
  const workRows = database.prepare(`
    SELECT id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units, shade, comment,
           started_at, completed_at, cancelled_at, accepted_amount, tooth_codes
    FROM work_items WHERE order_id = ? ORDER BY created_at, id
  `).all(orderId) as Array<Record<string, unknown>>
  const expenseRows = database.prepare(`
    SELECT id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment
    FROM order_expenses WHERE order_id = ? ORDER BY rowid
  `).all(orderId) as Array<Record<string, unknown>>
  const debtRow = database.prepare('SELECT id, amount FROM order_debts WHERE order_id = ?').get(orderId) as { id: string; amount: number } | undefined
  const financialRow = database.prepare(`
    SELECT final_total, received_amount, expenses, debt, financial_result
    FROM order_financials WHERE order_id = ?
  `).get(orderId) as { final_total: number; received_amount: number; expenses: number; debt: number; financial_result: number } | undefined
  const debtPaymentRows = debtRow
    ? database.prepare('SELECT id, debt_id, amount, received_at FROM order_debt_payments WHERE debt_id = ? ORDER BY received_at, id').all(debtRow.id) as Array<Record<string, unknown>>
    : []
  const debtRepaid = debtPaymentRows.reduce((total, payment) => total + Number(payment.amount), 0)
  const liveIncome = workRows
    .filter((work) => String(work.status) === 'COMPLETED')
    .reduce((total, work) => total + (work.accepted_amount === null ? 0 : Number(work.accepted_amount)), 0)
  const liveExpenses = expenseRows.reduce((total, expense) => total + Number(expense.amount), 0)
  const recordedDebt = debtRow?.amount ?? financialRow?.debt ?? 0
  const hasFinalSnapshot = row.status !== 'ACTIVE' && financialRow !== undefined
  const expectedIncome = row.status === 'CANCELLED' ? 0 : liveIncome
  const receivedAmount = hasFinalSnapshot
    ? Number(financialRow.received_amount)
    : (row.status === 'CLOSED' ? liveIncome : 0)
  const income = row.status === 'CANCELLED' ? 0 : receivedAmount + debtRepaid
  const expensesTotal = liveExpenses
  const debt = Math.max(0, recordedDebt - debtRepaid)
  const balance = income - expensesTotal
  return {
    id: String(row.id),
    patientLabel: row.patient_label === null ? null : String(row.patient_label),
    doctorId: row.doctor_id === null ? null : String(row.doctor_id),
    doctorName: String(row.doctor_name_snapshot),
    orderDate: String(row.order_date),
    deadlineAt: row.deadline_at === null ? null : String(row.deadline_at),
    status: String(row.status) as OrderStatus,
    generalComment: row.general_comment === null ? null : String(row.general_comment),
    closureDate: row.closure_date === null ? null : String(row.closure_date),
    closureType: row.closure_type === null ? null : String(row.closure_type),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    workItems: workRows.map((work) => ({
      id: String(work.id),
      orderId: String(work.order_id),
      pricingItemId: work.pricing_item_id === null ? null : String(work.pricing_item_id),
      workType: String(work.work_type_snapshot),
      status: String(work.status) as WorkItemStatus,
      unitMode: String(work.unit_mode) as UnitMode,
      units: Number(work.units),
      toothCodes: parseStoredToothCodes(work.tooth_codes, `WorkItem ${String(work.id)} tooth_codes`),
      shade: work.shade === null ? null : String(work.shade),
      comment: work.comment === null ? null : String(work.comment),
      startedAt: work.started_at === null ? null : String(work.started_at),
      completedAt: work.completed_at === null ? null : String(work.completed_at),
      cancelledAt: work.cancelled_at === null ? null : String(work.cancelled_at),
      acceptedAmount: work.accepted_amount === null ? null : Number(work.accepted_amount),
    })),
    expenses: expenseRows.map((expense) => ({
      id: String(expense.id),
      orderId: String(expense.order_id),
      amount: Number(expense.amount),
      pricingItemId: expense.pricing_item_id === null ? null : String(expense.pricing_item_id),
      name: String(expense.name_snapshot),
      unitPrice: Number(expense.unit_price_snapshot),
      quantity: Number(expense.quantity),
      category: expense.category === null ? null : String(expense.category),
      comment: expense.comment === null ? null : String(expense.comment),
    })),
    debtPayments: debtPaymentRows.map((payment) => ({
      id: String(payment.id),
      debtId: String(payment.debt_id),
      orderId,
      amount: Number(payment.amount),
      receivedAt: String(payment.received_at),
    })),
    financialSummary: { expectedIncome, income, expenses: expensesTotal, debt, receivedAmount, debtRepaid, balance },
  }
}

export function closeOrder(database: Database.Database, orderId: string, input: CloseOrderInput): OrderDetailRecord {
  const order = database.prepare('SELECT status, order_date FROM orders WHERE id = ?').get(orderId) as
    | { status: OrderStatus; order_date: string }
    | undefined
  if (!order) throw new DataValidationError('Order not found')
  if (order.status !== 'ACTIVE') throw new DataValidationError('Only active Orders can be closed')

  const closureDate = formatBusinessDate(input.closureDate, 'closureDate', true)!
  if (closureDate < order.order_date) throw new DataValidationError('closureDate cannot be earlier than orderDate')
  if (!['NORMAL', 'WITH_DEBT', 'CANCELLED'].includes(String(input.mode))) {
    throw new DataValidationError('Closure mode is invalid')
  }
  const receivedAmount = optionalNumber(input.receivedAmount, 'receivedAmount')
  if (receivedAmount === null) throw new DataValidationError('receivedAmount is required')
  const debtAmount = input.mode === 'WITH_DEBT' ? optionalNumber(input.debtAmount, 'debtAmount') : 0
  const debtComment = input.mode === 'WITH_DEBT' ? nullableText(input.debtComment, 'debtComment') : null
  if (input.mode === 'WITH_DEBT' && (debtAmount === null || debtAmount <= 0)) {
    throw new DataValidationError('debtAmount must be greater than zero when closing with debt')
  }
  if (input.mode === 'CANCELLED' && receivedAmount !== 0) {
    throw new DataValidationError('Cancelled Orders must have a received amount of zero')
  }

  const unfinishedWorkCount = database.prepare("SELECT COUNT(*) AS count FROM work_items WHERE order_id = ? AND status = 'ACTIVE'")
    .get(orderId) as { count: number }
  if (unfinishedWorkCount.count > 0) {
    throw new DataValidationError('Перед закрытием отметьте незавершённые работы выполненными или удалите их')
  }

  const existingDebt = database.prepare('SELECT amount FROM order_debts WHERE order_id = ?').get(orderId) as { amount: number } | undefined
  if (input.mode !== 'WITH_DEBT' && existingDebt && existingDebt.amount > 0) {
    throw new DataValidationError('This Order has an outstanding debt; close it with debt or resolve the debt first')
  }

  const workIncome = database.prepare("SELECT COALESCE(SUM(accepted_amount), 0) AS total FROM work_items WHERE order_id = ? AND status = 'COMPLETED'")
    .get(orderId) as { total: number }
  const expenses = database.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM order_expenses WHERE order_id = ?')
    .get(orderId) as { total: number }
  const finalTotal = input.mode === 'CANCELLED' ? 0 : Number(workIncome.total)
  if (input.mode === 'WITH_DEBT' && receivedAmount >= finalTotal) {
    throw new DataValidationError('Полученная сумма должна быть меньше ожидаемой для закрытия заказа с долгом')
  }
  const finalDebt = input.mode === 'WITH_DEBT' ? (debtAmount ?? finalTotal - receivedAmount) : 0
  const financialResult = receivedAmount - Number(expenses.total)
  const now = new Date().toISOString()
  const status: OrderStatus = input.mode === 'CANCELLED' ? 'CANCELLED' : 'CLOSED'

  database.transaction(() => {
    database.prepare(`
      UPDATE orders
      SET status = ?, closure_type = ?, closure_date = ?, archived_at = ?, updated_at = ?
      WHERE id = ? AND status = 'ACTIVE'
    `).run(status, input.mode, closureDate, now, now, orderId)

    if (input.mode === 'WITH_DEBT') {
      if (existingDebt) {
        database.prepare('UPDATE order_debts SET amount = ?, comment = ? WHERE order_id = ?')
          .run(finalDebt, debtComment, orderId)
      } else {
        database.prepare('INSERT INTO order_debts (id, order_id, amount, comment) VALUES (?, ?, ?, ?)')
          .run(randomUUID(), orderId, finalDebt, debtComment)
      }
    }

    database.prepare(`
      INSERT INTO order_financials (
        order_id, final_total, received_amount, expenses, debt, financial_result, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        final_total = excluded.final_total,
        received_amount = excluded.received_amount,
        expenses = excluded.expenses,
        debt = excluded.debt,
        financial_result = excluded.financial_result,
        confirmed_at = excluded.confirmed_at
    `).run(orderId, finalTotal, receivedAmount, Number(expenses.total), finalDebt, financialResult, now)
  })()

  return getOrder(database, orderId)!
}

export function addOrderDebtPayment(database: Database.Database, orderId: string, input: OrderDebtPaymentInput): OrderDetailRecord {
  const order = database.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined
  if (!order) throw new DataValidationError('Order not found')
  if (order.status !== 'CLOSED') throw new DataValidationError('Погашать долг можно только у закрытого заказа')
  const debt = database.prepare('SELECT id, amount FROM order_debts WHERE order_id = ?').get(orderId) as
    | { id: string; amount: number }
    | undefined
  if (!debt) throw new DataValidationError('У этого заказа нет долга для погашения')
  const amount = optionalNumber(input.amount, 'amount')
  if (amount === null || amount <= 0) throw new DataValidationError('Сумма погашения должна быть больше нуля')
  const paid = database.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM order_debt_payments WHERE debt_id = ?')
    .get(debt.id) as { total: number }
  const remaining = Math.max(0, Number(debt.amount) - Number(paid.total))
  if (remaining <= 0) throw new DataValidationError('Этот долг уже погашен')
  if (amount > remaining) throw new DataValidationError('Сумма погашения не может превышать остаток долга')

  const receivedAt = new Date().toISOString()
  database.transaction(() => {
    database.prepare('INSERT INTO order_debt_payments (id, debt_id, amount, received_at) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), debt.id, amount, receivedAt)
    const financial = database.prepare('SELECT received_amount FROM order_financials WHERE order_id = ?').get(orderId) as
      | { received_amount: number }
      | undefined
    const expenses = database.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM order_expenses WHERE order_id = ?')
      .get(orderId) as { total: number }
    database.prepare('UPDATE order_financials SET financial_result = ? WHERE order_id = ?')
      .run(Number(financial?.received_amount ?? 0) + Number(paid.total) + amount - Number(expenses.total), orderId)
  })()

  return getOrder(database, orderId)!
}

export function forgiveOrderDebt(database: Database.Database, orderId: string): OrderDetailRecord {
  database.transaction(() => {
    const order = database.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined
    if (!order) throw new DataValidationError('Order not found')
    if (order.status !== 'CLOSED') throw new DataValidationError('Списать долг можно только у закрытого заказа')

    const debt = database.prepare('SELECT id, amount FROM order_debts WHERE order_id = ?').get(orderId) as
      | { id: string; amount: number }
      | undefined
    if (!debt) throw new DataValidationError('У этого заказа нет долга для списания')

    const paid = database.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM order_debt_payments WHERE debt_id = ?')
      .get(debt.id) as { total: number }
    const paidAmount = Number(paid.total)
    const debtAmount = Number(debt.amount)
    const remaining = Math.max(0, debtAmount - paidAmount)
    if (remaining <= 0) throw new DataValidationError('Этот долг уже погашен')
    if (paidAmount - debtAmount > 0.000001) throw new DataValidationError('Сумма платежей превышает сумму долга')

    if (paidAmount === 0) {
      // order_debts.amount must stay positive. With no received payments,
      // forgiveness clears the debt record and its saved financial balance.
      database.prepare('DELETE FROM order_debts WHERE id = ?').run(debt.id)
      database.prepare('UPDATE order_financials SET debt = 0 WHERE order_id = ?').run(orderId)
    } else {
      database.prepare('UPDATE order_debts SET amount = ? WHERE id = ?').run(paidAmount, debt.id)
      database.prepare('UPDATE order_financials SET debt = ? WHERE order_id = ?').run(paidAmount, orderId)
    }
  })()

  return getOrder(database, orderId)!
}

export function listArchivedOrders(database: Database.Database, useFinancialSnapshot = false): ArchivedOrderRecord[] {
  const liveExpectedIncome = `CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE
    (SELECT COALESCE(SUM(w.accepted_amount), 0) FROM work_items w WHERE w.order_id = o.id AND w.status = 'COMPLETED')
  END`
  const liveExpenses = '(SELECT COALESCE(SUM(e.amount), 0) FROM order_expenses e WHERE e.order_id = o.id)'
  const liveDebt = '(SELECT COALESCE(d.amount, 0) FROM order_debts d WHERE d.order_id = o.id)'
  const liveDebtRepaid = `(
    SELECT COALESCE(SUM(p.amount), 0) FROM order_debt_payments p
    INNER JOIN order_debts d ON d.id = p.debt_id WHERE d.order_id = o.id
  )`
  const expectedIncome = useFinancialSnapshot ? `COALESCE(f.final_total, ${liveExpectedIncome})` : liveExpectedIncome
  const receivedAmount = `CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE COALESCE(f.received_amount, ${liveExpectedIncome}) END`
  const debtRepaid = `CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE ${liveDebtRepaid} END`
  const income = `CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE (${receivedAmount}) + (${debtRepaid}) END`
  const expenses = useFinancialSnapshot ? `COALESCE(f.expenses, ${liveExpenses})` : liveExpenses
  const debt = `MAX(0, COALESCE(${useFinancialSnapshot ? 'f.debt' : liveDebt}, ${liveDebt}, 0) - (${liveDebtRepaid}))`
  const balance = `(${income}) - (${expenses})`
  const rows = database.prepare(`
    SELECT
      o.id, o.patient_label, o.doctor_id, o.doctor_name_snapshot, o.order_date, o.deadline_at,
      o.status, o.closure_date, o.closure_type, o.archived_at,
      ${expectedIncome} AS expected_income,
      ${income} AS income,
      ${receivedAmount} AS received_amount,
      ${debtRepaid} AS debt_repaid,
      ${expenses} AS expenses,
      ${debt} AS debt,
      ${balance} AS balance,
      (SELECT group_concat(work_type_snapshot, ', ') FROM (
        SELECT DISTINCT work_type_snapshot FROM work_items WHERE order_id = o.id ORDER BY work_type_snapshot
      )) AS work_types
    FROM orders o
    LEFT JOIN order_financials f ON f.order_id = o.id
    WHERE o.status IN ('CLOSED', 'CANCELLED')
    ORDER BY o.closure_date DESC, o.archived_at DESC, o.id
  `).all() as Array<Record<string, unknown>>

  return rows.map((row) => ({
    id: String(row.id),
    patientLabel: row.patient_label === null ? null : String(row.patient_label),
    doctorId: row.doctor_id === null ? null : String(row.doctor_id),
    doctorName: String(row.doctor_name_snapshot),
    orderDate: String(row.order_date),
    deadlineAt: row.deadline_at === null ? null : String(row.deadline_at),
    status: String(row.status) as Exclude<OrderStatus, 'ACTIVE'>,
    closureDate: row.closure_date === null ? null : String(row.closure_date),
    closureType: row.closure_type === null ? null : String(row.closure_type),
    archivedAt: row.archived_at === null ? null : String(row.archived_at),
    workTypes: row.work_types === null ? [] : String(row.work_types).split(', '),
    financialSummary: {
      expectedIncome: Number(row.expected_income),
      income: Number(row.income),
      receivedAmount: Number(row.received_amount),
      debtRepaid: Number(row.debt_repaid),
      expenses: Number(row.expenses),
      debt: Number(row.debt),
      balance: Number(row.balance),
    },
  }))
}

export function listDebts(database: Database.Database): DebtListRecord[] {
  const rows = database.prepare(`
    SELECT d.id, d.order_id, d.amount AS original_amount,
      COALESCE(SUM(p.amount), 0) AS paid_amount,
      MAX(0, d.amount - COALESCE(SUM(p.amount), 0)) AS amount,
      d.comment, o.status, o.patient_label, o.doctor_id,
      o.doctor_name_snapshot, o.closure_date,
      (SELECT group_concat(work_type_snapshot, ', ') FROM (
        SELECT DISTINCT work_type_snapshot FROM work_items WHERE order_id = o.id ORDER BY work_type_snapshot
      )) AS work_types
    FROM order_debts d
    JOIN orders o ON o.id = d.order_id
    LEFT JOIN order_debt_payments p ON p.debt_id = d.id
    WHERE d.amount > 0 AND o.status IN ('CLOSED', 'CANCELLED')
    GROUP BY d.id, d.order_id, d.amount, d.comment, o.status, o.patient_label, o.doctor_id,
      o.doctor_name_snapshot, o.closure_date, o.archived_at
    HAVING MAX(0, d.amount - COALESCE(SUM(p.amount), 0)) > 0
    ORDER BY o.closure_date DESC, o.archived_at DESC, d.id
  `).all() as Array<Record<string, unknown>>

  return rows.map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    status: String(row.status) as Exclude<OrderStatus, 'ACTIVE'>,
    patientLabel: row.patient_label === null ? null : String(row.patient_label),
    doctorId: row.doctor_id === null ? null : String(row.doctor_id),
    doctorName: String(row.doctor_name_snapshot),
    closureDate: row.closure_date === null ? null : String(row.closure_date),
    amount: Number(row.amount),
    originalAmount: Number(row.original_amount),
    paidAmount: Number(row.paid_amount),
    comment: row.comment === null ? null : String(row.comment),
    workTypes: row.work_types === null ? [] : String(row.work_types).split(', '),
  }))
}

export function getOrderStatistics(database: Database.Database, fromDate?: string | null, toDate?: string | null): OrderStatisticsRecord {
  const normalizedFrom = formatBusinessDate(fromDate, 'fromDate', false)
  const normalizedTo = formatBusinessDate(toDate, 'toDate', false)
  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    throw new DataValidationError('fromDate cannot be after toDate')
  }

  const archivedOrders = listArchivedOrders(database, true).filter((order) => {
    if (!order.closureDate) return false
    return (!normalizedFrom || order.closureDate >= normalizedFrom) && (!normalizedTo || order.closureDate <= normalizedTo)
  })
  const totals = archivedOrders.reduce<OrderFinancialSummary>((sum, order) => ({
    expectedIncome: sum.expectedIncome + order.financialSummary.expectedIncome,
    income: sum.income + order.financialSummary.income,
    receivedAmount: sum.receivedAmount + order.financialSummary.receivedAmount,
    debtRepaid: sum.debtRepaid + order.financialSummary.debtRepaid,
    expenses: sum.expenses + order.financialSummary.expenses,
    debt: sum.debt + order.financialSummary.debt,
    balance: sum.balance + order.financialSummary.balance,
  }), { expectedIncome: 0, income: 0, receivedAmount: 0, debtRepaid: 0, expenses: 0, debt: 0, balance: 0 })
  const doctorTotals = new Map<string, DoctorStatisticsRecord>()
  for (const order of archivedOrders) {
    const key = order.doctorId ?? ''
    const existing = doctorTotals.get(key) ?? {
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
    existing.orderCount += 1
    existing.expectedIncome += order.financialSummary.expectedIncome
    existing.income += order.financialSummary.income
    existing.receivedAmount += order.financialSummary.receivedAmount
    existing.debtRepaid += order.financialSummary.debtRepaid
    existing.expenses += order.financialSummary.expenses
    existing.debt += order.financialSummary.debt
    existing.balance += order.financialSummary.balance
    doctorTotals.set(key, existing)
  }

  return {
    ...totals,
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    orderCount: archivedOrders.length,
    byDoctor: [...doctorTotals.values()].sort((left, right) => left.doctorName.localeCompare(right.doctorName, 'ru')),
  }
}

export function recalculateOrderFinancials(database: Database.Database, fromDate?: string | null, toDate?: string | null): { orderCount: number } {
  const normalizedFrom = formatBusinessDate(fromDate, 'fromDate', false)
  const normalizedTo = formatBusinessDate(toDate, 'toDate', false)
  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    throw new DataValidationError('fromDate cannot be after toDate')
  }
  const filters = ["status IN ('CLOSED', 'CANCELLED')", 'closure_date IS NOT NULL']
  const parameters: string[] = []
  if (normalizedFrom) {
    filters.push('closure_date >= ?')
    parameters.push(normalizedFrom)
  }
  if (normalizedTo) {
    filters.push('closure_date <= ?')
    parameters.push(normalizedTo)
  }
  const orders = database.prepare(`SELECT id, status FROM orders WHERE ${filters.join(' AND ')} ORDER BY closure_date, id`)
    .all(...parameters) as Array<{ id: string; status: OrderStatus }>
  const existingFinancial = database.prepare('SELECT received_amount, confirmed_at FROM order_financials WHERE order_id = ?')
  const workTotal = database.prepare("SELECT COALESCE(SUM(accepted_amount), 0) AS total FROM work_items WHERE order_id = ? AND status = 'COMPLETED'")
  const expenseTotal = database.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM order_expenses WHERE order_id = ?')
  const debtAmount = database.prepare('SELECT COALESCE(amount, 0) AS amount FROM order_debts WHERE order_id = ?')
  const debtPaidTotal = database.prepare(`
    SELECT COALESCE(SUM(p.amount), 0) AS total
    FROM order_debt_payments p
    INNER JOIN order_debts d ON d.id = p.debt_id
    WHERE d.order_id = ?
  `)
  const upsert = database.prepare(`
    INSERT INTO order_financials (
      order_id, final_total, received_amount, expenses, debt, financial_result, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      final_total = excluded.final_total,
      expenses = excluded.expenses,
      debt = excluded.debt,
      financial_result = excluded.financial_result
  `)
  database.transaction(() => {
    for (const order of orders) {
      const financial = existingFinancial.get(order.id) as { received_amount: number; confirmed_at: string } | undefined
      const incomeRow = workTotal.get(order.id) as { total: number }
      const expensesRow = expenseTotal.get(order.id) as { total: number }
      const debtRow = debtAmount.get(order.id) as { amount: number } | undefined
      const debtPaidRow = debtPaidTotal.get(order.id) as { total: number }
      const expenses = Number(expensesRow.total)
      const debt = Number(debtRow?.amount ?? 0)
      const received = Number(financial?.received_amount ?? 0)
      const debtRepaid = Number(debtPaidRow.total)
      const expectedIncome = order.status === 'CANCELLED' ? 0 : Number(incomeRow.total)
      const income = order.status === 'CANCELLED' ? 0 : received + debtRepaid
      const confirmedAt = financial?.confirmed_at ?? new Date().toISOString()
      upsert.run(order.id, expectedIncome, received, expenses, debt, income - expenses, confirmedAt)
    }
  })()
  return { orderCount: orders.length }
}

export function updateOrderDetails(database: Database.Database, orderId: string, input: UpdateOrderInput): OrderListRecord {
  const existing = database.prepare('SELECT status, order_date, closure_date, doctor_id FROM orders WHERE id = ?').get(orderId) as
    { status: OrderStatus; order_date: string; closure_date: string | null; doctor_id: string | null } | undefined
  if (!existing) throw new DataValidationError('Order not found')
  const required = new Map(getRequiredFields(database).map((field) => [field.fieldKey, field.required]))
  const patientLabel = nullableText(input.patientLabel, 'patientLabel')
  const doctorId = nullableText(input.doctorId, 'doctorId')
  const generalComment = nullableText(input.generalComment, 'generalComment')
  const orderDate = formatBusinessDate(input.orderDate ?? existing.order_date, 'orderDate', true)!
  if (required.get('patient_label') && !patientLabel) throw new DataValidationError('patientLabel is required')
  if (required.get('doctor_id') && !doctorId) throw new DataValidationError('doctorId is required')
  const deadlineAt = formatIsoDateTime(input.deadlineAt, 'deadlineAt', required.get('deadline_at') === true)
  assertDeadlineNotBeforeOrderDate(orderDate, deadlineAt)
  if (doctorId && doctorId !== existing.doctor_id && !database.prepare('SELECT 1 FROM doctors WHERE id = ? AND active = 1').get(doctorId)) {
    throw new DataValidationError('Selected Doctor is unavailable')
  }
  let closureDate = existing.closure_date
  if (existing.status !== 'ACTIVE') {
    closureDate = formatBusinessDate(input.closureDate ?? existing.closure_date, 'closureDate', true)!
    if (closureDate < orderDate) throw new DataValidationError('closureDate cannot be earlier than orderDate')
  }
  const doctor = doctorId
    ? database.prepare('SELECT first_name, last_name FROM doctors WHERE id = ?').get(doctorId) as { first_name: string; last_name: string }
    : undefined
  const now = new Date().toISOString()
  database.prepare(`
    UPDATE orders
    SET patient_label = ?, doctor_id = ?, doctor_name_snapshot = ?, order_date = ?, deadline_at = ?, general_comment = ?, closure_date = ?, updated_at = ?
    WHERE id = ?
  `).run(patientLabel, doctorId, doctor ? `${doctor.first_name} ${doctor.last_name}` : '', orderDate, deadlineAt, generalComment, closureDate, now, orderId)
  return listOrders(database, existing.status).find((order) => order.id === orderId)!
}

export function getAppSettings(database: Database.Database): Record<string, string> {
  const rows = database.prepare('SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key').all() as Array<{
    setting_key: string
    setting_value: string
  }>
  return Object.fromEntries(rows
    .filter((row) => row.setting_key !== 'default_currency_code')
    .map((row) => [row.setting_key, row.setting_value]))
}

export function appendWorkItem(database: Database.Database, orderId: string, item: WorkItemInput): string {
  if (!database.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId)) throw new DataValidationError('Order not found')
  const workType = nonEmptyString(item.workType, 'workType')
  const unitMode = item.unitMode ?? 'OTHER'
  if (!['TOOTH_COUNT', 'FIXED', 'OTHER'].includes(String(unitMode))) throw new DataValidationError('unitMode is invalid')
  const toothCodes = parseToothCodes(item.toothCodes, 'toothCodes')
  if (unitMode === 'TOOTH_COUNT' && toothCodes.length === 0) throw new DataValidationError('At least one tooth must be selected')
  if (!['TOOTH_COUNT', 'OTHER'].includes(String(unitMode)) && toothCodes.length > 0) throw new DataValidationError('Teeth can only be assigned to FDI or manual-number work')
  if (unitMode === 'OTHER' && toothCodes.length > 0 && Number(item.units ?? toothCodes.length) !== toothCodes.length) {
    throw new DataValidationError('units must equal the entered tooth count')
  }
  const units = unitMode === 'TOOTH_COUNT' || (unitMode === 'OTHER' && toothCodes.length > 0)
    ? toothCodes.length
    : parseUnits(item.units, 'units')
  const pricingItemId = item.pricingItemId || null
  const calculatedAmount = calculateWorkItemAmount(database, pricingItemId, units)
  const acceptedAmount = item.acceptedAmount === undefined
    ? calculatedAmount
    : optionalNumber(item.acceptedAmount, 'acceptedAmount')
  const now = new Date().toISOString()
  const id = item.id?.trim() || randomUUID()
  database.transaction(() => {
    database.prepare(`
      INSERT INTO work_items (
        id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units,
        unit_price_snapshot, total_price_snapshot, accepted_amount, tooth_codes, shade, comment, started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orderId, pricingItemId, workType, unitMode, units, null, null,
      acceptedAmount, serializeToothCodes(toothCodes), nullableText(item.shade, 'shade'), nullableText(item.comment, 'comment'), now, now, now,
    )
  })()
  return id
}

export function updateWorkItem(database: Database.Database, orderId: string, itemId: string, input: WorkItemInput): void {
  const order = database.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined
  if (!order) throw new DataValidationError('Order not found')
  const existing = database.prepare(`
    SELECT units, tooth_codes, pricing_item_id, accepted_amount,
           status, started_at, completed_at, cancelled_at
    FROM work_items WHERE id = ? AND order_id = ?
  `).get(itemId, orderId) as
    | { units: number; tooth_codes: string | null; pricing_item_id: string | null; accepted_amount: number | null; status: WorkItemStatus; started_at: string | null; completed_at: string | null; cancelled_at: string | null }
    | undefined
  if (!existing) throw new DataValidationError('WorkItem not found')
  const hasHistoryEdits = input.status !== undefined || input.startedAt !== undefined || input.completedAt !== undefined || input.cancelledAt !== undefined
  if (order.status === 'ACTIVE' && hasHistoryEdits) {
    throw new DataValidationError('WorkItem status and production dates can only be edited after Order closure')
  }
  const workType = nonEmptyString(input.workType, 'workType')
  const unitMode = input.unitMode ?? 'OTHER'
  if (!['TOOTH_COUNT', 'FIXED', 'OTHER'].includes(String(unitMode))) throw new DataValidationError('unitMode is invalid')
  const hasToothSelectionInput = input.toothCodes !== undefined
  const toothCodes = hasToothSelectionInput
    ? parseToothCodes(input.toothCodes, 'toothCodes')
    : parseStoredToothCodes(existing.tooth_codes, 'tooth_codes')
  if (unitMode === 'TOOTH_COUNT' && hasToothSelectionInput && toothCodes.length === 0) {
    throw new DataValidationError('At least one tooth must be selected')
  }
  if (!['TOOTH_COUNT', 'OTHER'].includes(String(unitMode)) && toothCodes.length > 0) {
    throw new DataValidationError('Teeth can only be assigned to FDI or manual-number work')
  }
  if (unitMode === 'OTHER' && toothCodes.length > 0 && Number(input.units ?? toothCodes.length) !== toothCodes.length) {
    throw new DataValidationError('units must equal the entered tooth count')
  }
  const units = (unitMode === 'TOOTH_COUNT' || unitMode === 'OTHER') && toothCodes.length > 0
    ? toothCodes.length
    : parseUnits(input.units ?? existing.units, 'units')
  const storedToothCodes = ['TOOTH_COUNT', 'OTHER'].includes(String(unitMode)) ? serializeToothCodes(toothCodes) : null
  const pricingItemId = input.pricingItemId === undefined ? existing.pricing_item_id : input.pricingItemId || null
  const acceptedAmount = input.acceptedAmount === undefined
    ? existing.accepted_amount
    : optionalNumber(input.acceptedAmount, 'acceptedAmount')
  let status = existing.status
  let startedAt = existing.started_at
  let completedAt = existing.completed_at
  let cancelledAt = existing.cancelled_at
  if (hasHistoryEdits) {
    if (input.status !== undefined && !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(input.status)) {
      throw new DataValidationError('WorkItem status is invalid')
    }
    status = input.status ?? existing.status
    startedAt = input.startedAt === undefined ? existing.started_at : formatIsoDateTime(input.startedAt, 'startedAt', false)
    completedAt = input.completedAt === undefined ? existing.completed_at : formatIsoDateTime(input.completedAt, 'completedAt', false)
    cancelledAt = input.cancelledAt === undefined ? existing.cancelled_at : formatIsoDateTime(input.cancelledAt, 'cancelledAt', false)
    if (status === 'ACTIVE' && (completedAt || cancelledAt)) {
      throw new DataValidationError('Active WorkItems cannot have completion or cancellation dates')
    }
    if (status === 'COMPLETED' && (!completedAt || cancelledAt)) {
      throw new DataValidationError('Completed WorkItems require a completion date and cannot have a cancellation date')
    }
    if (status === 'CANCELLED' && (!cancelledAt || completedAt)) {
      throw new DataValidationError('Cancelled WorkItems require a cancellation date and cannot have a completion date')
    }
  }
  database.prepare(`
    UPDATE work_items SET pricing_item_id = ?, work_type_snapshot = ?, unit_mode = ?, units = ?,
      unit_price_snapshot = ?, total_price_snapshot = ?, accepted_amount = ?, tooth_codes = ?, shade = ?, comment = ?,
      status = ?, started_at = ?, completed_at = ?, cancelled_at = ?, updated_at = ?
    WHERE id = ? AND order_id = ?
  `).run(
    pricingItemId, workType, unitMode, units, null, null,
    acceptedAmount, storedToothCodes, nullableText(input.shade, 'shade'), nullableText(input.comment, 'comment'),
    status, startedAt, completedAt, cancelledAt, new Date().toISOString(), itemId, orderId,
  )
}

export function setWorkItemStatus(database: Database.Database, orderId: string, itemId: string, status: WorkItemStatus): void {
  requireActiveOrder(database, orderId)
  if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
    throw new DataValidationError('WorkItem status is invalid')
  }
  const existing = database.prepare('SELECT status FROM work_items WHERE id = ? AND order_id = ?')
    .get(itemId, orderId) as { status: WorkItemStatus } | undefined
  if (!existing) throw new DataValidationError('WorkItem not found')
  if (existing.status === status) return

  const now = new Date().toISOString()
  const result = database.prepare(`
    UPDATE work_items
    SET status = ?, completed_at = ?, cancelled_at = ?, updated_at = ?
    WHERE id = ? AND order_id = ? AND status = ?
  `).run(status, status === 'COMPLETED' ? now : null, status === 'CANCELLED' ? now : null, now, itemId, orderId, existing.status)
  if (result.changes === 0) throw new DataValidationError('WorkItem status changed before the update could be applied')
}

export function updateAcceptedWorkItemAmount(database: Database.Database, orderId: string, itemId: string, acceptedAmountInput: number | null): void {
  const order = database.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined
  if (!order) throw new DataValidationError('Order not found')
  const acceptedAmount = optionalNumber(acceptedAmountInput, 'acceptedAmount')
  const result = database.prepare('UPDATE work_items SET accepted_amount = ?, updated_at = ? WHERE id = ? AND order_id = ?')
    .run(acceptedAmount, new Date().toISOString(), itemId, orderId)
  if (result.changes === 0) throw new DataValidationError('WorkItem not found')
}

export function removeWorkItem(database: Database.Database, orderId: string, itemId: string): void {
  if (!database.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId)) throw new DataValidationError('Order not found')
  const count = database.prepare('SELECT COUNT(*) AS count FROM work_items WHERE order_id = ?').get(orderId) as { count: number }
  if (count.count <= 1) throw new DataValidationError('An Order must keep at least one WorkItem')
  const result = database.prepare('DELETE FROM work_items WHERE id = ? AND order_id = ?').run(itemId, orderId)
  if (result.changes === 0) throw new DataValidationError('WorkItem not found')
}

export function removeOrder(database: Database.Database, orderId: string): void {
  const result = database.prepare('DELETE FROM orders WHERE id = ?').run(orderId)
  if (result.changes === 0) throw new DataValidationError('Order not found')
}

export function removeAllOrders(database: Database.Database): number {
  return database.transaction(() => {
    const result = database.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }
    database.prepare('DELETE FROM orders').run()
    return result.count
  })()
}

function requireActiveOrder(database: Database.Database, orderId: string): void {
  const order = database.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined
  if (!order) throw new DataValidationError('Order not found')
  if (order.status !== 'ACTIVE') throw new DataValidationError('Only active Orders can be edited')
}

function requireFinanciallyEditableOrder(database: Database.Database, orderId: string): void {
  const order = database.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: OrderStatus } | undefined
  if (!order) throw new DataValidationError('Order not found')
}

function parseExpenseInput(database: Database.Database, input: OrderExpenseInput, id = input.id): ParsedExpense {
  const parsed = parseExpenseInputs(database, [{ ...input, id }], Boolean(id))[0]
  if (!parsed) throw new DataValidationError('Expense is required')
  return parsed
}

export function addOrderExpense(database: Database.Database, orderId: string, input: OrderExpenseInput): OrderExpenseRecord {
  requireFinanciallyEditableOrder(database, orderId)
  const expense = parseExpenseInput(database, input)
  database.prepare(`
    INSERT INTO order_expenses (id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(expense.id, orderId, expense.amount, expense.pricingItemId, expense.name, expense.unitPrice, expense.quantity, expense.category, expense.comment)
  return { ...expense, orderId }
}

export function updateOrderExpense(database: Database.Database, orderId: string, expenseId: string, input: OrderExpenseInput): OrderExpenseRecord {
  requireFinanciallyEditableOrder(database, orderId)
  const expense = parseExpenseInput(database, input, expenseId)
  const result = database.prepare(`
    UPDATE order_expenses
    SET amount = ?, pricing_item_id = ?, name_snapshot = ?, unit_price_snapshot = ?, quantity = ?, category = ?, comment = ?
    WHERE id = ? AND order_id = ?
  `).run(expense.amount, expense.pricingItemId, expense.name, expense.unitPrice, expense.quantity, expense.category, expense.comment, expenseId, orderId)
  if (result.changes === 0) throw new DataValidationError('Expense not found')
  return { ...expense, orderId }
}

export function removeOrderExpense(database: Database.Database, orderId: string, expenseId: string): void {
  requireFinanciallyEditableOrder(database, orderId)
  const result = database.prepare('DELETE FROM order_expenses WHERE id = ? AND order_id = ?').run(expenseId, orderId)
  if (result.changes === 0) throw new DataValidationError('Expense not found')
}

function serializeRows(database: Database.Database, table: string, orderBy: string): Record<string, unknown>[] {
  return database.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all() as Record<string, unknown>[]
}

function omitFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const omitted = new Set(fields)
  return Object.fromEntries(Object.entries(row).filter(([key]) => !omitted.has(key)))
}

export function exportFullDatabase(database: Database.Database, exportedAt = new Date().toISOString()): ExchangeEnvelope {
  return {
    format: 'dental-tech-calendar',
    dataset: 'full-database',
    formatVersion,
    schemaVersion: currentSchemaVersion(database),
    exportedAt,
    database: {
      doctors: serializeRows(database, 'doctors', 'id'),
      colors: serializeRows(database, 'colors', 'id'),
      expensePricingItems: serializeRows(database, 'expense_pricing_items', 'id'),
      pricingItems: serializeRows(database, 'pricing_items', 'id').map((row) => omitFields(row, ['currency_code'])),
      orders: serializeRows(database, 'orders', 'id'),
      workItems: serializeRows(database, 'work_items', 'id'),
      orderFinancials: serializeRows(database, 'order_financials', 'order_id').map((row) => omitFields(row, ['currency_code'])),
      orderExpenses: serializeRows(database, 'order_expenses', 'order_id, id'),
      orderDebts: serializeRows(database, 'order_debts', 'order_id'),
      orderDebtPayments: serializeRows(database, 'order_debt_payments', 'debt_id, received_at, id'),
      requiredFieldSettings: serializeRows(database, 'required_field_settings', 'field_key'),
      appSettings: serializeRows(database, 'app_settings', 'setting_key').filter((row) => row.setting_key !== 'default_currency_code'),
    },
  }
}

function requireArray(databaseData: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = databaseData[key]
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new DataValidationError(`database.${key} must be an array of objects`)
  }
  return value as Array<Record<string, unknown>>
}

export function restoreFullDatabase(database: Database.Database, payload: unknown): void {
  const envelope = validateEnvelope(payload, 'full-database')
  const schemaVersionValue = envelope.schemaVersion
  if (typeof schemaVersionValue !== 'number' || schemaVersionValue < 2 || schemaVersionValue > currentSchema) {
    throw new DataValidationError(`Unsupported database schema version: ${String(schemaVersionValue)}`)
  }
  const schemaVersion = schemaVersionValue
  if (!isRecord(envelope.database)) throw new DataValidationError('database must be an object')
  const source = envelope.database
  const doctors = requireArray(source, 'doctors')
  const colors = schemaVersion >= 7 ? requireArray(source, 'colors') : []
  const legacyExpenseCategories = schemaVersion >= 7 && schemaVersion < 10 ? requireArray(source, 'expenseCategories') : []
  const expensePricingItems = schemaVersion >= 10
    ? requireArray(source, 'expensePricingItems').map((row, index) => ({
      id: nonEmptyString(row.id, `database.expensePricingItems[${index}].id`),
      name: nonEmptyString(row.name, `database.expensePricingItems[${index}].name`),
      unit_price: optionalNumber(row.unit_price, `database.expensePricingItems[${index}].unit_price`),
      active: Number(row.active) === 1 || row.active === true ? 1 : 0,
      updated_at: nonEmptyString(row.updated_at, `database.expensePricingItems[${index}].updated_at`),
    }))
    : legacyExpenseCategories.map((row, index) => ({
      id: nonEmptyString(row.id, `database.expenseCategories[${index}].id`),
      name: nonEmptyString(row.name, `database.expenseCategories[${index}].name`),
      unit_price: null,
      active: Number(row.active) === 1 || row.active === true ? 1 : 0,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : '2026-09-24T00:00:00.000Z',
    }))
  const pricingItems = requireArray(source, 'pricingItems')
  const orders = requireArray(source, 'orders')
  const sourceWorkItems = requireArray(source, 'workItems')
  const workItemTeeth = schemaVersion < 4 && schemaVersion === 2 && source.workItemTeeth === undefined
    ? []
    : schemaVersion < 4
      ? requireArray(source, 'workItemTeeth')
      : []
  const financials = requireArray(source, 'orderFinancials')
  const requiredFields = requireArray(source, 'requiredFieldSettings')
  const appSettings = requireArray(source, 'appSettings')
  const workItemById = new Map<string, Record<string, unknown>>()
  sourceWorkItems.forEach((workItem, index) => {
    const id = nonEmptyString(workItem.id, `database.workItems[${index}].id`)
    if (workItemById.has(id)) throw new DataValidationError(`Duplicate WorkItem id: ${id}`)
    workItemById.set(id, workItem)
  })
  const toothCodesByWorkItem = new Map<string, PermanentFdiToothCode[]>()
  if (schemaVersion >= 4) {
    sourceWorkItems.forEach((workItem, index) => {
      if (!Object.prototype.hasOwnProperty.call(workItem, 'tooth_codes')) {
        throw new DataValidationError(`database.workItems[${index}].tooth_codes is required from schema version 4 onward`)
      }
      toothCodesByWorkItem.set(
        String(workItem.id),
        parseStoredToothCodes(workItem.tooth_codes, `database.workItems[${index}].tooth_codes`),
      )
    })
  } else {
    workItemTeeth.forEach((row, index) => {
      if (!isPermanentFdiToothCode(row.tooth_code)) {
        throw new DataValidationError(`database.workItemTeeth[${index}].tooth_code must be a permanent FDI tooth code`)
      }
      const workItemId = nonEmptyString(row.work_item_id, `database.workItemTeeth[${index}].work_item_id`)
      const workItem = workItemById.get(workItemId)
      if (!workItem) throw new DataValidationError(`database.workItemTeeth[${index}] references an unknown WorkItem`)
      if (!['TOOTH_COUNT', 'OTHER'].includes(String(workItem.unit_mode))) {
        throw new DataValidationError(`database.workItemTeeth[${index}] must reference an FDI or manual-number WorkItem`)
      }
      const codes = toothCodesByWorkItem.get(workItemId) ?? []
      if (codes.includes(row.tooth_code)) {
        throw new DataValidationError(`database.workItemTeeth[${index}] duplicates a tooth code`)
      }
      codes.push(row.tooth_code)
      toothCodesByWorkItem.set(workItemId, codes)
    })
  }
  for (const [workItemId, workItem] of workItemById) {
    const toothCodes = toothCodesByWorkItem.get(workItemId) ?? []
    if (toothCodes.length > 0 && !['TOOTH_COUNT', 'OTHER'].includes(String(workItem.unit_mode))) {
      throw new DataValidationError(`WorkItem ${workItemId} must use FDI or manual-number mode when teeth are selected`)
    }
    if (toothCodes.length > 0 && Number(workItem.units) !== toothCodes.length) {
      throw new DataValidationError(`WorkItem ${workItemId} units must equal its selected tooth count`)
    }
  }
  const workItems = sourceWorkItems.map((workItem, index) => {
    if (schemaVersion >= 6 && !Object.prototype.hasOwnProperty.call(workItem, 'accepted_amount')) {
      throw new DataValidationError(`database.workItems[${index}].accepted_amount is required in schema version 6`)
    }
    const acceptedAmount = schemaVersion >= 6
      ? optionalNumber(workItem.accepted_amount, `database.workItems[${index}].accepted_amount`)
      : optionalNumber(workItem.total_price_snapshot, `database.workItems[${index}].total_price_snapshot`)
    return {
      ...workItem,
      unit_price_snapshot: null,
      total_price_snapshot: null,
      accepted_amount: acceptedAmount,
      tooth_codes: serializeToothCodes(toothCodesByWorkItem.get(String(workItem.id)) ?? []),
    }
  })
  const normalizedOrders = orders.map((row, index) => {
    const orderDate = schemaVersion >= 5
      ? formatBusinessDate(row.order_date, `database.orders[${index}].order_date`, true)
      : formatBusinessDate(typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : row.created_at, `database.orders[${index}].created_at`, true)
    const closureDate = schemaVersion >= 5
      ? formatBusinessDate(row.closure_date, `database.orders[${index}].closure_date`, false)
      : null
    const normalized = { ...row }
    delete normalized.created_at
    return { ...normalized, order_date: orderDate, closure_date: closureDate }
  })
  const orderIds = new Set(orders.map((row, index) => nonEmptyString(row.id, `database.orders[${index}].id`)))
  const rawExpenses: Array<Record<string, unknown>> = schemaVersion >= 6
    ? requireArray(source, 'orderExpenses')
    : financials.flatMap((row) => Number(row.expenses) > 0
      ? [{ id: `legacy-expense-${String(row.order_id)}`, order_id: row.order_id, amount: Number(row.expenses), comment: null }]
      : [])
  const rawDebts: Array<Record<string, unknown>> = schemaVersion >= 6
    ? requireArray(source, 'orderDebts')
    : financials.flatMap((row) => Number(row.debt) > 0
      ? [{ id: `legacy-debt-${String(row.order_id)}`, order_id: row.order_id, amount: Number(row.debt), comment: null }]
      : [])
  function normalizeLedgerRows(rows: Array<Record<string, unknown>>, label: string, uniqueOrder: boolean): Array<{
    id: string
    order_id: string
    amount: number
    comment: string | null
  }> {
    const ids = new Set<string>()
    const seenOrders = new Set<string>()
    return rows.map((row, index) => {
      const id = nonEmptyString(row.id, `database.${label}[${index}].id`)
      const orderId = nonEmptyString(row.order_id, `database.${label}[${index}].order_id`)
      const amount = optionalNumber(row.amount, `database.${label}[${index}].amount`)
      if (!amount || amount <= 0) throw new DataValidationError(`database.${label}[${index}].amount must be greater than zero`)
      if (!orderIds.has(orderId)) throw new DataValidationError(`database.${label}[${index}] references an unknown Order`)
      if (ids.has(id)) throw new DataValidationError(`Duplicate ${label} id: ${id}`)
      if (uniqueOrder && seenOrders.has(orderId)) throw new DataValidationError(`${label} must contain at most one record per Order`)
      ids.add(id)
      seenOrders.add(orderId)
      return { id, order_id: orderId, amount, comment: nullableText(row.comment, `database.${label}[${index}].comment`) }
    })
  }
  const orderExpenses = normalizeLedgerRows(rawExpenses, 'orderExpenses', false).map((expense, index) => {
    const raw = rawExpenses[index]
    const category = nullableText(raw.category, `database.orderExpenses[${index}].category`)
    const snapshotName = schemaVersion >= 10
      ? nonEmptyString(raw.name_snapshot, `database.orderExpenses[${index}].name_snapshot`)
      : category ?? 'Расход'
    const snapshotUnitPrice = schemaVersion >= 10
      ? optionalNumber(raw.unit_price_snapshot, `database.orderExpenses[${index}].unit_price_snapshot`)
      : expense.amount
    const quantity = schemaVersion >= 10 ? parseUnits(raw.quantity, `database.orderExpenses[${index}].quantity`) : 1
    if (snapshotUnitPrice === null) throw new DataValidationError(`database.orderExpenses[${index}].unit_price_snapshot is required`)
    return {
      ...expense,
      pricing_item_id: schemaVersion >= 10 ? nullableText(raw.pricing_item_id, `database.orderExpenses[${index}].pricing_item_id`) : null,
      name_snapshot: snapshotName,
      unit_price_snapshot: snapshotUnitPrice,
      quantity,
      category: schemaVersion >= 10 ? category ?? snapshotName : category,
    }
  })
  const orderDebts = normalizeLedgerRows(rawDebts, 'orderDebts', true)
  const rawDebtPayments: Array<Record<string, unknown>> = schemaVersion >= 9
    ? requireArray(source, 'orderDebtPayments')
    : []
  const debtIds = new Set(orderDebts.map((debt) => debt.id))
  const debtPaymentIds = new Set<string>()
  const debtAmountsById = new Map(orderDebts.map((debt) => [debt.id, debt.amount]))
  const paidAmountsByDebt = new Map<string, number>()
  const orderDebtPayments = rawDebtPayments.map((row, index) => {
    const id = nonEmptyString(row.id, `database.orderDebtPayments[${index}].id`)
    const debtId = nonEmptyString(row.debt_id, `database.orderDebtPayments[${index}].debt_id`)
    const amount = optionalNumber(row.amount, `database.orderDebtPayments[${index}].amount`)
    const receivedAt = nonEmptyString(row.received_at, `database.orderDebtPayments[${index}].received_at`)
    if (!Number.isFinite(Date.parse(receivedAt))) {
      throw new DataValidationError(`database.orderDebtPayments[${index}].received_at must be a valid date`)
    }
    if (!debtIds.has(debtId)) throw new DataValidationError(`database.orderDebtPayments[${index}] references an unknown debt`)
    if (amount === null || amount <= 0) throw new DataValidationError(`database.orderDebtPayments[${index}].amount must be greater than zero`)
    if (debtPaymentIds.has(id)) throw new DataValidationError(`Duplicate order debt payment id: ${id}`)
    debtPaymentIds.add(id)
    const totalPaid = (paidAmountsByDebt.get(debtId) ?? 0) + amount
    if (totalPaid > Number(debtAmountsById.get(debtId))) {
      throw new DataValidationError(`database.orderDebtPayments exceeds the recorded debt for ${debtId}`)
    }
    paidAmountsByDebt.set(debtId, totalPaid)
    return { id, debt_id: debtId, amount, received_at: receivedAt }
  })

  database.transaction(() => {
    database.prepare('DELETE FROM order_debt_payments').run()
    database.prepare('DELETE FROM order_debts').run()
    database.prepare('DELETE FROM order_expenses').run()
    database.prepare('DELETE FROM order_financials').run()
    database.prepare('DELETE FROM work_items').run()
    database.prepare('DELETE FROM orders').run()
    database.prepare('DELETE FROM pricing_items').run()
    database.prepare('DELETE FROM doctors').run()
    database.prepare('DELETE FROM colors').run()
    database.prepare('DELETE FROM expense_pricing_items').run()
    database.prepare('DELETE FROM required_field_settings').run()
    database.prepare('DELETE FROM app_settings').run()

    const directoryInsert = (table: NamedDirectoryTable) => database.prepare(`
      INSERT INTO ${table} (id, name, active, created_at, updated_at)
      VALUES (@id, @name, @active, @created_at, @updated_at)
    `)
    const colorInsert = directoryInsert('colors')
    for (const row of colors) colorInsert.run(row)
    const doctorInsert = database.prepare(`
      INSERT INTO doctors (id, first_name, last_name, phone, comment, active, created_at, updated_at)
      VALUES (@id, @first_name, @last_name, @phone, @comment, @active, @created_at, @updated_at)
    `)
    for (const row of doctors) doctorInsert.run(row)

    const pricingInsert = database.prepare(`
      INSERT INTO pricing_items (id, name, calculation_mode, unit_price, fixed_price, active, metadata_json, updated_at)
      VALUES (@id, @name, @calculation_mode, @unit_price, @fixed_price, @active, @metadata_json, @updated_at)
    `)
    for (const row of pricingItems) pricingInsert.run(omitFields(row, ['currency_code']))
    const expensePricingInsert = database.prepare(`
      INSERT INTO expense_pricing_items (id, name, unit_price, active, updated_at)
      VALUES (@id, @name, @unit_price, @active, @updated_at)
    `)
    for (const row of expensePricingItems) expensePricingInsert.run(row)

    const orderInsert = database.prepare(`
      INSERT INTO orders (id, patient_label, doctor_id, doctor_name_snapshot, order_date, updated_at, deadline_at, status, closure_type, general_comment, archived_at, closure_date)
      VALUES (@id, @patient_label, @doctor_id, @doctor_name_snapshot, @order_date, @updated_at, @deadline_at, @status, @closure_type, @general_comment, @archived_at, @closure_date)
    `)
    for (const row of normalizedOrders) orderInsert.run(row)

    const workItemInsert = database.prepare(`
      INSERT INTO work_items (
        id, order_id, pricing_item_id, work_type_snapshot, status, unit_mode, units,
        unit_price_snapshot, total_price_snapshot, accepted_amount, tooth_codes, shade, comment, started_at,
        completed_at, cancelled_at, created_at, updated_at
      ) VALUES (
        @id, @order_id, @pricing_item_id, @work_type_snapshot, @status, @unit_mode, @units,
        @unit_price_snapshot, @total_price_snapshot, @accepted_amount, @tooth_codes, @shade, @comment, @started_at,
        @completed_at, @cancelled_at, @created_at, @updated_at
      )
    `)
    for (const row of workItems) workItemInsert.run(row)

    const financialInsert = database.prepare(`
      INSERT INTO order_financials (order_id, final_total, received_amount, expenses, debt, financial_result, confirmed_at)
      VALUES (@order_id, @final_total, @received_amount, @expenses, @debt, @financial_result, @confirmed_at)
    `)
    for (const row of financials) financialInsert.run(omitFields(row, ['currency_code']))

    const expenseInsert = database.prepare(`
      INSERT INTO order_expenses (
        id, order_id, amount, pricing_item_id, name_snapshot, unit_price_snapshot, quantity, category, comment
      ) VALUES (
        @id, @order_id, @amount, @pricing_item_id, @name_snapshot, @unit_price_snapshot, @quantity, @category, @comment
      )
    `)
    for (const row of orderExpenses) expenseInsert.run(row)
    const debtInsert = database.prepare('INSERT INTO order_debts (id, order_id, amount, comment) VALUES (@id, @order_id, @amount, @comment)')
    for (const row of orderDebts) debtInsert.run(row)
    const debtPaymentInsert = database.prepare('INSERT INTO order_debt_payments (id, debt_id, amount, received_at) VALUES (@id, @debt_id, @amount, @received_at)')
    for (const row of orderDebtPayments) debtPaymentInsert.run(row)

    const requiredInsert = database.prepare('INSERT INTO required_field_settings (field_key, required, updated_at) VALUES (@field_key, @required, @updated_at)')
    for (const row of requiredFields) requiredInsert.run(row)
    const settingsInsert = database.prepare('INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (@setting_key, @setting_value, @updated_at)')
    for (const row of appSettings) {
      if (row.setting_key !== 'default_currency_code') settingsInsert.run(row)
    }
  })()
}

export function importDataset(database: Database.Database, payload: unknown): number {
  if (!isRecord(payload)) throw new DataValidationError('JSON root must be an object')
  if (payload.dataset === 'directory') return replaceDirectory(database, payload)
  if (payload.dataset === 'doctor-directory') return replaceDoctorDirectory(database, payload)
  if (payload.dataset === 'pricing') return replacePricing(database, payload)
  if (payload.dataset === 'full-database') {
    restoreFullDatabase(database, payload)
    return 1
  }
  throw new DataValidationError('Unsupported dataset')
}
