import { useMemo, useState } from 'react'
import type { ApplicationPort, CalendarStartupNamedValue } from '@dental-tech/application'
import {
  getOpenCalendarOrders,
  getOrdersDueOnDate,
  getDeadlinePresentation,
  getLocalDateKey,
  getMonthGridDates,
  summarizeCalendarOrders,
  type CalendarOrder,
} from './calendar-state.ts'
import { OrderForm, type DoctorOption, type PricingOption, type RequiredFieldOption } from './OrderForm.tsx'
import { PricingPanel } from './PricingPanel.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { CurrentWorkPanel } from './CurrentWorkPanel.tsx'
import { ArchivePanel, DebtsPanel, StatisticsPanel } from './FinancePanels.tsx'
import type { OrderReminderController } from './android-order-notifications.ts'

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const sections = [
  { id: 'archive', label: 'Архив' },
  { id: 'statistics', label: 'Статистика' },
  { id: 'debts', label: 'Долги' },
  { id: 'pricing', label: 'Прайс-лист' },
  { id: 'settings', label: 'Настройки' },
  { id: 'about', label: 'О программе' },
] as const

type SectionId = (typeof sections)[number]['id']
type ScreenId = SectionId | 'calendar' | 'current-work'

interface CalendarScreenProps {
  applicationPort: ApplicationPort
  orders?: CalendarOrder[]
  doctors?: Array<DoctorOption & { phone: string; comment: string }>
  colors?: CalendarStartupNamedValue[]
  expenseCategories?: CalendarStartupNamedValue[]
  pricingItems?: PricingOption[]
  requiredFields?: RequiredFieldOption[]
  onDataChanged?: () => Promise<void>
  orderReminderController?: OrderReminderController
  notificationSyncError?: string
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)
}

function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

function formatDeadline(deadlineAt: string | null): string {
  if (!deadlineAt) return 'Срок не задан'
  const deadline = new Date(deadlineAt)
  return Number.isNaN(deadline.getTime()) ? 'Срок не задан' : formatFullDate(deadline)
}

export function CalendarScreen({
  orders = [],
  doctors = [],
  colors = [],
  expenseCategories = [],
  pricingItems = [],
  requiredFields = [],
  onDataChanged = async () => undefined,
  orderReminderController,
  notificationSyncError = '',
  applicationPort,
}: CalendarScreenProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [selectedSection, setSelectedSection] = useState<ScreenId>('calendar')
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderSource, setSelectedOrderSource] = useState<'calendar' | 'archive' | 'debts'>('calendar')
  const [menuOpen, setMenuOpen] = useState(false)
  const [archiveDoctorFilter, setArchiveDoctorFilter] = useState<{ id: string; name: string } | null>(null)

  const now = new Date()
  const monthDays = useMemo(() => getMonthGridDates(visibleMonth), [visibleMonth])
  const rows = useMemo(() => {
    const weeks: Date[][] = []
    for (let index = 0; index < monthDays.length; index += 7) {
      weeks.push(monthDays.slice(index, index + 7))
    }
    return weeks
  }, [monthDays])

  const activeOrdersByDay = useMemo(() => {
    const grouped = new Map<string, Array<CalendarOrder & { deadlineAt: string }>>()
    for (const order of orders) {
      if (order.status !== 'ACTIVE' || !order.deadlineAt) continue
      const deadline = new Date(order.deadlineAt)
      if (Number.isNaN(deadline.getTime())) continue
      const key = getLocalDateKey(deadline)
      grouped.set(key, [...(grouped.get(key) ?? []), { ...order, deadlineAt: order.deadlineAt }])
    }
    return grouped
  }, [orders])
  const currentOrders = useMemo(() => getOpenCalendarOrders(orders), [orders])
  const selectedDateOrders = useMemo(
    () => selectedDateKey ? getOrdersDueOnDate(orders, selectedDateKey) : [],
    [orders, selectedDateKey],
  )
  const visibleSummaryOrders = selectedDateKey ? selectedDateOrders : currentOrders
  const selectedDate = selectedDateKey ? dateFromKey(selectedDateKey) : null
  const selectedDateLabel = selectedDate ? formatFullDate(selectedDate) : ''
  const selectedDateTotals = useMemo(() => summarizeCalendarOrders(selectedDateOrders), [selectedDateOrders])

  const monthLabel = formatMonth(visibleMonth)
  const isCalendarPage = selectedSection === 'calendar' && !newOrderOpen

  function returnToCalendar() {
    setSelectedSection('calendar')
    setNewOrderOpen(false)
    setSelectedOrderId(null)
    setMenuOpen(false)
  }

  function openSection(section: SectionId, doctorFilter: { id: string; name: string } | null = null) {
    setSelectedSection(section)
    setNewOrderOpen(false)
    setSelectedOrderId(null)
    setSelectedOrderSource('calendar')
    setMenuOpen(false)
    setArchiveDoctorFilter(section === 'archive' ? doctorFilter : null)
  }

  function startNewOrder() {
    setSelectedSection('calendar')
    setNewOrderOpen(true)
    setMenuOpen(false)
  }

  function openOrder(orderId: string) {
    setSelectedSection('current-work')
    setNewOrderOpen(false)
    setSelectedOrderId(orderId)
    setSelectedOrderSource('calendar')
    setMenuOpen(false)
  }

  function openOrderFromList(orderId: string, source: 'archive' | 'debts') {
    setSelectedSection('current-work')
    setNewOrderOpen(false)
    setSelectedOrderId(orderId)
    setSelectedOrderSource(source)
    setMenuOpen(false)
  }

  function returnFromOrder() {
    if (selectedOrderSource === 'calendar') {
      returnToCalendar()
      return
    }
    openSection(selectedOrderSource, selectedOrderSource === 'archive' ? archiveDoctorFilter : null)
  }

  const sectionLabel = sections.find((section) => section.id === selectedSection)?.label ?? 'Календарь'

  return (
    <div className="calendar-app">
      <header className="device-app-header">
        <span className="app-mark" aria-hidden="true">D</span>
        <div className="device-app-brand">
          <p className="eyebrow">Локальное приложение</p>
          <h2>DentalTechCalendar</h2>
        </div>
        <div className="header-actions">
          {!isCalendarPage && (
            <button aria-label="Домой" className="home-button" onClick={returnToCalendar} title="Домой" type="button">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m3 10 9-7 9 7M5.5 9v11h13V9M9.5 20v-7h5v7" />
              </svg>
              <span>Домой</span>
            </button>
          )}
          <button
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            aria-controls="main-sections"
            className="menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              {menuOpen ? (
                <path d="m6 6 12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {menuOpen && (
        <nav aria-label="Основные разделы" className="section-menu" id="main-sections">
          {sections.map((section) => (
            <button
              aria-current={selectedSection === section.id ? 'page' : undefined}
              key={section.id}
              onClick={() => openSection(section.id)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </nav>
      )}

      {selectedSection === 'settings' ? (
        <SettingsPanel
          applicationPort={applicationPort}
          colors={colors}
          doctors={doctors}
          orderReminderController={orderReminderController}
          notificationSyncError={notificationSyncError}
          onDataChanged={onDataChanged}
          requiredFields={requiredFields}
        />
      ) : selectedSection === 'pricing' ? (
        <PricingPanel applicationPort={applicationPort} items={pricingItems} onDataChanged={onDataChanged} />
      ) : selectedSection === 'current-work' ? (
        <CurrentWorkPanel
          applicationPort={applicationPort}
          doctors={doctors}
          colors={colors}
          initialOrderId={selectedOrderId}
          pricingItems={pricingItems}
          onBack={returnFromOrder}
          onOrderSaved={returnToCalendar}
          onReturnFromDetail={selectedOrderSource === 'calendar' ? undefined : returnFromOrder}
          detailReturnLabel={selectedOrderSource === 'archive' ? 'К архиву' : selectedOrderSource === 'debts' ? 'К долгам' : undefined}
          onCreateOrder={startNewOrder}
          onDataChanged={onDataChanged}
          orders={orders}
          requiredFields={requiredFields}
        />
      ) : selectedSection === 'archive' ? (
        <ArchivePanel
          applicationPort={applicationPort}
          doctors={doctors}
          expenseCategories={expenseCategories}
          initialDoctorFilter={archiveDoctorFilter}
          onDataChanged={onDataChanged}
          onOpenOrder={(orderId) => openOrderFromList(orderId, 'archive')}
        />
      ) : selectedSection === 'debts' ? (
        <DebtsPanel applicationPort={applicationPort} doctors={doctors} onOpenOrder={(orderId) => openOrderFromList(orderId, 'debts')} />
      ) : selectedSection === 'statistics' ? (
        <StatisticsPanel applicationPort={applicationPort} onOpenDoctorArchive={(doctorId, doctorName) => openSection('archive', { id: doctorId, name: doctorName })} />
      ) : selectedSection === 'about' ? (
        <main className="section-placeholder">
          <p className="eyebrow">DentalTechCalendar</p>
          <h1>О программе</h1>
          <p>Локальное приложение для планирования заказов зубного техника и учёта работ, расходов и долгов.</p>
          <p><strong>Версия:</strong> 0.1.0</p>
          <p><strong>Автор:</strong> vave</p>
        </main>
      ) : selectedSection !== 'calendar' ? (
        <main className="section-placeholder">
          <p className="eyebrow">Раздел приложения</p>
          <h1>{sectionLabel}</h1>
          <p>Этот раздел будет добавлен на следующем этапе разработки.</p>
        </main>
      ) : newOrderOpen ? (
        <OrderForm
          colors={colors}
          doctors={doctors}
          initialDeadline={selectedDateKey}
          onCreateOrder={(command) => applicationPort.createOrder(command)}
          onCancel={returnToCalendar}
          onSaved={async () => {
            await onDataChanged()
            returnToCalendar()
          }}
          pricingItems={pricingItems}
          requiredFields={requiredFields}
        />
      ) : (
        <main className="calendar-view">
          <div className="calendar-title-row">
            <div>
              <p className="eyebrow">Расписание</p>
              <h1>Календарь</h1>
            </div>
          </div>

          <section aria-label="Календарь по месяцам" className="month-section">
            <div className="month-toolbar">
              <h2 data-testid="calendar-month">{monthLabel}</h2>
              <div className="month-arrows">
                <button
                  aria-label="Предыдущий месяц"
                  onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                  type="button"
                >
                  ‹
                </button>
                <button
                  aria-label="Следующий месяц"
                  onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                  type="button"
                >
                  ›
                </button>
              </div>
            </div>

            <table aria-label={`Календарь на ${monthLabel}`} className="month-grid">
              <thead>
                <tr>
                  {weekdays.map((day) => (
                    <th key={day} scope="col">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((week, weekIndex) => (
                  <tr key={weekIndex}>
                    {week.map((date) => {
                      const dateKey = getLocalDateKey(date)
                      const isCurrentMonth = date.getMonth() === visibleMonth.getMonth()
                      const isToday = dateKey === getLocalDateKey(now)
                      const isSelected = dateKey === selectedDateKey
                      const dayOrders = activeOrdersByDay.get(dateKey) ?? []
                      const hasDueOrOverdueOrder = dayOrders.some((order) => {
                        const deadline = getDeadlinePresentation(order.deadlineAt, order.status, now)
                        return deadline.dueToday || deadline.overdue
                      })
                      const dayButtonClasses = [
                        'calendar-day-button',
                        isToday ? 'calendar-day-button--today' : '',
                        hasDueOrOverdueOrder ? 'calendar-day-button--deadline' : '',
                      ].filter(Boolean).join(' ')

                      return (
                        <td className={`${isCurrentMonth ? '' : 'outside-month'}${isSelected ? ' selected-day' : ''}`} key={dateKey}>
                          <button
                            aria-label={`Выбрать ${formatFullDate(date)}`}
                            aria-pressed={isSelected}
                            className={dayButtonClasses}
                            onClick={() => {
                              setSelectedDateKey(isSelected ? null : dateKey)
                              if (!isCurrentMonth) setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
                            }}
                            type="button"
                          >
                            <time
                              aria-current={isToday ? 'date' : undefined}
                              className={isToday ? 'day-number is-today' : 'day-number'}
                              dateTime={dateKey}
                            >
                              {date.getDate()}
                            </time>
                            {dayOrders.length > 0 && (
                              <span aria-hidden="true" className="calendar-order-list">
                                {dayOrders.slice(0, 2).map((order) => {
                                  const deadline = getDeadlinePresentation(order.deadlineAt, order.status, now)
                                  const classes = [
                                    'calendar-order-chip',
                                    deadline.dueToday ? 'calendar-order-chip--due-today' : '',
                                    deadline.overdue ? 'calendar-order-chip--overdue' : '',
                                  ].filter(Boolean).join(' ')

                                  return (
                                    <span className={classes} key={order.id} title={order.label}>
                                      <span className="calendar-order-title">{order.label}</span>
                                      {deadline.dueToday && <span>Сегодня</span>}
                                      {deadline.overdue && <span>Просрочено</span>}
                                    </span>
                                  )
                                })}
                                {dayOrders.length > 2 && <span className="calendar-order-more">+{dayOrders.length - 2}</span>}
                              </span>
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {selectedDate && (
            <button className="calendar-new-order-cta" onClick={startNewOrder} type="button">
              {`Новый заказ к : ${selectedDateLabel}`}
            </button>
          )}

          {(!selectedDate || visibleSummaryOrders.length > 0) && (
            <section aria-labelledby="calendar-orders-heading" className="calendar-orders-summary">
              <h2 id="calendar-orders-heading">
                {selectedDate
                  ? `Активные заказы (${selectedDateLabel})`
                  : 'Сводка по текущим заказам'}
              </h2>
              {visibleSummaryOrders.length === 0 ? (
                <div className="calendar-empty-state" role="status">
                  <span className="empty-state-icon" aria-hidden="true">◷</span>
                  <p>Открытых заказов пока нет.</p>
                </div>
              ) : (
                <ol aria-label={selectedDate ? 'Активные заказы на выбранную дату' : 'Открытые заказы'} className="calendar-orders-summary-list">
                  {visibleSummaryOrders.map((order) => {
                    const income = order.financialSummary?.income ?? 0
                    const expenses = order.financialSummary?.expenses ?? 0
                    return (
                      <li key={order.id}>
                        <button
                          aria-label={`Открыть заказ: ${order.patientLabel || order.label}`}
                          className="calendar-order-summary-card"
                          onClick={() => openOrder(order.id)}
                          type="button"
                        >
                          <time dateTime={order.deadlineAt ?? undefined}>{formatDeadline(order.deadlineAt)}</time>
                          <strong>{order.patientLabel || 'Имя пациента не указано'}</strong>
                          <span>Врач: {order.doctorName || 'не указан'}</span>
                          <span>Работы: {order.workTypes?.length ? order.workTypes.join(', ') : 'не указаны'}</span>
                          <span className="calendar-order-balance">Сальдо: {formatMoney(income - expenses)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}

              {selectedDate && (
                <div aria-label="Сводка по заказам за день" className="calendar-selected-date-totals">
                  <div><span>Всего заказов</span><strong>{selectedDateTotals.count}</strong></div>
                  <div><span>Приходы</span><strong>{formatMoney(selectedDateTotals.income)}</strong></div>
                  <div><span>Расходы</span><strong>{formatMoney(selectedDateTotals.expenses)}</strong></div>
                  <div><span>Итого</span><strong>{formatMoney(selectedDateTotals.balance)}</strong></div>
                </div>
              )}
            </section>
          )}
        </main>
      )}
    </div>
  )
}
