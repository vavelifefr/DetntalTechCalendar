export type CalendarStartupOrderStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED'

export interface CalendarStartupOrder {
  id: string
  patientLabel: string | null
  doctorName: string
  deadlineAt: string | null
  status: CalendarStartupOrderStatus
  workTypes: string[]
  financialSummary: {
    income: number
    expenses: number
    debt: number
    receivedAmount: number
    balance: number
  }
}

export interface CalendarStartupDoctor {
  id: string
  firstName: string
  lastName: string
  phone: string
  comment: string
  active: boolean
}

export interface CalendarStartupNamedValue {
  id: string
  name: string
  active: boolean
}

export interface CalendarStartupPricingItem {
  id: string
  itemType?: 'WORK' | 'EXPENSE'
  name: string
  calculationMode: 'PER_UNIT' | 'FIXED' | 'COMPOSITE'
  unitPrice: number | null
  fixedPrice: number | null
  active: boolean
  metadata: Record<string, unknown>
  updatedAt: string
}

export interface CalendarStartupRequiredField {
  fieldKey: string
  required: boolean
}

export interface CalendarStartupSnapshot {
  orders: CalendarStartupOrder[]
  doctors: CalendarStartupDoctor[]
  colors: CalendarStartupNamedValue[]
  expenseCategories: CalendarStartupNamedValue[]
  pricingItems: CalendarStartupPricingItem[]
  requiredFields: CalendarStartupRequiredField[]
}

export interface CreateOrderWorkItemCommand {
  pricingItemId?: string | null
  workType: string
  unitMode?: 'TOOTH_COUNT' | 'FIXED' | 'OTHER'
  units?: number
  toothCodes?: string[]
  acceptedAmount?: number | null
  shade?: string | null
  comment?: string | null
}

export interface CreateOrderExpenseCommand {
  amount: number
  pricingItemId?: string | null
  name?: string | null
  unitPrice?: number | null
  quantity?: number
  category?: string | null
  comment?: string | null
}

export interface CreateOrderCommand {
  patientLabel?: string | null
  doctorId?: string | null
  orderDate?: string | null
  deadlineAt?: string | null
  generalComment?: string | null
  expenses?: CreateOrderExpenseCommand[]
  workItems: CreateOrderWorkItemCommand[]
}

export type ApplicationOrderStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED'
export type ApplicationWorkItemStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type ApplicationUnitMode = 'TOOTH_COUNT' | 'FIXED' | 'OTHER'
export type ApplicationCalculationMode = 'PER_UNIT' | 'FIXED' | 'COMPOSITE'

export interface ApplicationFinancialSummary {
  expectedIncome: number
  income: number
  expenses: number
  debt: number
  receivedAmount: number
  debtRepaid: number
  balance: number
}

export interface ApplicationWorkItemInput extends CreateOrderWorkItemCommand {
  id?: string
  status?: ApplicationWorkItemStatus
  startedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
}

export interface ApplicationOrderExpenseInput extends CreateOrderExpenseCommand {
  id?: string
}

export interface ApplicationWorkItemRecord extends ApplicationWorkItemInput {
  id: string
  orderId: string
  pricingItemId: string | null
  unitMode: ApplicationUnitMode
  units: number
  toothCodes: string[]
  shade: string | null
  comment: string | null
  status: ApplicationWorkItemStatus
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  acceptedAmount: number | null
  unitPriceSnapshot?: number | null
  totalPriceSnapshot?: number | null
}

export interface ApplicationOrderExpenseRecord {
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

export interface ApplicationDebtPaymentRecord {
  id: string
  debtId: string
  orderId: string
  amount: number
  receivedAt: string
}

export interface ApplicationOrderDetail {
  id: string
  patientLabel: string | null
  doctorId: string | null
  doctorName: string
  orderDate: string
  deadlineAt: string | null
  status: ApplicationOrderStatus
  closureDate: string | null
  closureType: string | null
  archivedAt: string | null
  generalComment: string | null
  workItems: ApplicationWorkItemRecord[]
  expenses: ApplicationOrderExpenseRecord[]
  debtPayments: ApplicationDebtPaymentRecord[]
  financialSummary: ApplicationFinancialSummary
}

export interface UpdateOrderCommand {
  patientLabel?: string | null
  doctorId?: string | null
  orderDate?: string | null
  deadlineAt?: string | null
  generalComment?: string | null
  closureDate?: string | null
}

export interface CloseOrderCommand {
  closureDate: string
  mode: 'NORMAL' | 'WITH_DEBT' | 'CANCELLED'
  receivedAmount: number
  debtAmount?: number
  debtComment?: string | null
}

export interface ApplicationArchivedOrder {
  id: string
  patientLabel: string | null
  doctorId: string | null
  doctorName: string
  orderDate: string
  deadlineAt: string | null
  status: Exclude<ApplicationOrderStatus, 'ACTIVE'>
  closureDate: string | null
  closureType: string | null
  workTypes: string[]
  financialSummary: ApplicationFinancialSummary
}

export interface ApplicationDebtRecord {
  id: string
  orderId: string
  status: Exclude<ApplicationOrderStatus, 'ACTIVE'>
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

export interface ApplicationDoctorStatistics {
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

export interface ApplicationStatistics extends ApplicationFinancialSummary {
  fromDate: string | null
  toDate: string | null
  orderCount: number
  byDoctor: ApplicationDoctorStatistics[]
}

export interface SaveDoctorCommand {
  firstName: string
  lastName: string
  phone: string
  comment: string
  active: boolean
}

export interface SaveNamedValueCommand {
  name: string
  active: boolean
}

export interface SavePricingCommand {
  itemType: 'WORK' | 'EXPENSE'
  name: string
  calculationMode: ApplicationCalculationMode
  unitPrice: number | null
  fixedPrice: number | null
  active: boolean
  metadata: Record<string, unknown>
}

export type ApplicationExportDataset = 'directory' | 'doctor-directory' | 'pricing' | 'full-database'

/** Platform-neutral operations used by application screens across web and Android. */
export interface ApplicationPort {
  loadStartupSnapshot(): Promise<CalendarStartupSnapshot>
  createOrder(command: CreateOrderCommand): Promise<void>
  getOrder(orderId: string): Promise<ApplicationOrderDetail>
  updateOrder(orderId: string, command: UpdateOrderCommand): Promise<void>
  deleteOrder(orderId: string): Promise<void>
  deleteAllOrders(): Promise<number>
  createWorkItem(orderId: string, command: ApplicationWorkItemInput): Promise<void>
  updateWorkItem(orderId: string, itemId: string, command: ApplicationWorkItemInput): Promise<void>
  setWorkItemStatus(orderId: string, itemId: string, status: ApplicationWorkItemStatus): Promise<void>
  updateAcceptedWorkItemAmount(orderId: string, itemId: string, acceptedAmount: number | null): Promise<void>
  deleteWorkItem(orderId: string, itemId: string): Promise<void>
  createOrderExpense(orderId: string, command: ApplicationOrderExpenseInput): Promise<void>
  updateOrderExpense(orderId: string, expenseId: string, command: ApplicationOrderExpenseInput): Promise<void>
  deleteOrderExpense(orderId: string, expenseId: string): Promise<void>
  closeOrder(orderId: string, command: CloseOrderCommand): Promise<void>
  recordDebtPayment(orderId: string, amount: number): Promise<void>
  forgiveOrderDebt(orderId: string): Promise<void>
  listArchivedOrders(): Promise<ApplicationArchivedOrder[]>
  listDebts(): Promise<ApplicationDebtRecord[]>
  getStatistics(fromDate: string | null, toDate: string | null): Promise<ApplicationStatistics>
  recalculateStatistics(fromDate: string | null, toDate: string | null): Promise<number>
  savePricingItem(itemId: string | null, command: SavePricingCommand): Promise<void>
  deletePricingItem(itemId: string): Promise<void>
  saveDoctor(doctorId: string | null, command: SaveDoctorCommand): Promise<void>
  deleteDoctor(doctorId: string): Promise<void>
  saveColor(colorId: string | null, command: SaveNamedValueCommand): Promise<void>
  deleteColor(colorId: string): Promise<void>
  setRequiredFields(requiredFields: CalendarStartupRequiredField[]): Promise<void>
  exportDataset(dataset: ApplicationExportDataset): Promise<string>
  importDataset(payload: unknown): Promise<{ count: number }>
}

/** @deprecated Prefer ApplicationPort now that all application screens use it. */
export type CalendarApplicationPort = ApplicationPort
