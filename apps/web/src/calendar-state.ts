export type CalendarOrderStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED'

export interface CalendarOrder {
  id: string
  label: string
  deadlineAt: string | null
  status: CalendarOrderStatus
  patientLabel?: string | null
  doctorName?: string
  workTypes?: string[]
  financialSummary?: {
    income: number
    expenses: number
    balance: number
  }
}

export interface CalendarOrderTotals {
  count: number
  income: number
  expenses: number
  balance: number
}

export interface DeadlinePresentation {
  dueToday: boolean
  overdue: boolean
}

export function getDeadlinePresentation(
  deadlineAt: string,
  status: CalendarOrderStatus,
  now: Date = new Date(),
): DeadlinePresentation {
  const deadline = new Date(deadlineAt)
  if (Number.isNaN(deadline.getTime())) {
    return { dueToday: false, overdue: false }
  }

  const sameLocalDay =
    deadline.getFullYear() === now.getFullYear() &&
    deadline.getMonth() === now.getMonth() &&
    deadline.getDate() === now.getDate()

  return {
    dueToday: status === 'ACTIVE' && sameLocalDay,
    overdue: status === 'ACTIVE' && deadline.getTime() < now.getTime(),
  }
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getOpenCalendarOrders(orders: CalendarOrder[]): CalendarOrder[] {
  return orders
    .filter((order) => order.status === 'ACTIVE')
    .slice()
    .sort((left, right) => {
      const leftDeadline = left.deadlineAt ? new Date(left.deadlineAt).getTime() : Number.POSITIVE_INFINITY
      const rightDeadline = right.deadlineAt ? new Date(right.deadlineAt).getTime() : Number.POSITIVE_INFINITY
      const leftSort = Number.isNaN(leftDeadline) ? Number.POSITIVE_INFINITY : leftDeadline
      const rightSort = Number.isNaN(rightDeadline) ? Number.POSITIVE_INFINITY : rightDeadline
      return leftSort - rightSort || left.label.localeCompare(right.label, 'ru')
    })
}

export function getOrdersDueOnDate(orders: CalendarOrder[], dateKey: string): CalendarOrder[] {
  return getOpenCalendarOrders(orders).filter((order) => {
    if (!order.deadlineAt) return false
    const deadline = new Date(order.deadlineAt)
    return !Number.isNaN(deadline.getTime()) && getLocalDateKey(deadline) === dateKey
  })
}

export function summarizeCalendarOrders(orders: CalendarOrder[]): CalendarOrderTotals {
  const income = orders.reduce((total, order) => total + (order.financialSummary?.income ?? 0), 0)
  const expenses = orders.reduce((total, order) => total + (order.financialSummary?.expenses ?? 0), 0)
  return { count: orders.length, income, expenses, balance: income - expenses }
}

export function getMonthGridDates(month: Date): Date[] {
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7

  return Array.from(
    { length: cellCount },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index - mondayOffset + 1),
  )
}
