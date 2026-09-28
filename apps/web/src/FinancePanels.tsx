import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { ApplicationPort, CalendarStartupNamedValue } from '@dental-tech/application'
import { formatLocalDate, formatLocalNumericDate } from './date-display.ts'

interface DoctorOption {
  id: string
  firstName: string
  lastName: string
  active: boolean
}

interface FinancialSummary {
  expectedIncome: number
  income: number
  receivedAmount: number
  debtRepaid: number
  expenses: number
  debt: number
  balance: number
}

interface ArchivedOrder {
  id: string
  patientLabel: string | null
  doctorId: string | null
  doctorName: string
  orderDate: string
  deadlineAt: string | null
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED'
  closureDate: string | null
  closureType: string | null
  workTypes: string[]
  financialSummary: FinancialSummary
}

interface ExpenseRecord {
  id: string
  orderId: string
  amount: number
  category: string | null
  comment: string | null
}

interface WorkItemDetail {
  id: string
  pricingItemId: string | null
  workType: string
  unitMode: 'TOOTH_COUNT' | 'FIXED' | 'OTHER'
  units: number
  toothCodes: string[]
  shade: string | null
  comment: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  unitPriceSnapshot?: number | null
  totalPriceSnapshot?: number | null
  acceptedAmount: number | null
}

interface ExpandedOrderDetail {
  id: string
  patientLabel: string | null
  doctorId: string | null
  doctorName: string
  orderDate: string
  deadlineAt: string | null
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED'
  closureDate: string | null
  generalComment: string | null
  archivedAt: string | null
  financialSummary: FinancialSummary
  expenses: ExpenseRecord[]
  workItems: WorkItemDetail[]
}

interface DebtRecord {
  id: string
  orderId: string
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

interface DoctorStatistics {
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

interface StatisticsRecord extends FinancialSummary {
  fromDate: string | null
  toDate: string | null
  orderCount: number
  byDoctor: DoctorStatistics[]
}

interface PanelProps {
  applicationPort: ApplicationPort
  doctors: DoctorOption[]
  expenseCategories?: CalendarStartupNamedValue[]
  onOpenOrder?: (orderId: string) => void
}

interface ArchivePanelProps extends PanelProps {
  initialDoctorFilter?: { id: string; name: string } | null
  onDataChanged?: () => Promise<void>
}

function money(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

function displayDate(value: string | null): string {
  return formatLocalDate(value) ?? 'Дата не указана'
}

function displayNumericDate(value: string | null): string {
  return formatLocalNumericDate(value) ?? '—'
}

function matchesAmount(amount: number, min: string, max: string): boolean {
  return (!min || amount >= Number(min)) && (!max || amount <= Number(max))
}

function workItemStatusLabel(status: WorkItemDetail['status']): string {
  if (status === 'COMPLETED') return 'Выполнена'
  if (status === 'CANCELLED') return 'Отменена'
  return 'Активна'
}

function useRecords<T>(loadRecords: () => Promise<T[]>): { records: T[]; loading: boolean; error: string; reload: () => void } {
  const [records, setRecords] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void loadRecords().then((items) => {
      if (active) setRecords(items)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loadRecords, reloadVersion])

  return { records, loading, error, reload: () => setReloadVersion((version) => version + 1) }
}

export function ArchivePanel({ applicationPort, doctors, onOpenOrder, initialDoctorFilter, onDataChanged = async () => undefined }: ArchivePanelProps) {
  const [records, setRecords] = useState<ArchivedOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [openOrderId, setOpenOrderId] = useState('')
  const [detail, setDetail] = useState<ExpandedOrderDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [query, setQuery] = useState('')
  const [doctorId, setDoctorId] = useState(initialDoctorFilter?.id ?? '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [status, setStatus] = useState('ALL')
  const [debtState, setDebtState] = useState('ALL')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [deleteAllStep, setDeleteAllStep] = useState<'closed' | 'type' | 'final'>('closed')
  const [deleteAllPhrase, setDeleteAllPhrase] = useState('')
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState('')
  const [deleteAllMessage, setDeleteAllMessage] = useState('')
  const [deleteOrderConfirmationId, setDeleteOrderConfirmationId] = useState('')
  const [deleteOrderBusy, setDeleteOrderBusy] = useState(false)
  const [deleteOrderError, setDeleteOrderError] = useState('')
  const [deleteOrderMessage, setDeleteOrderMessage] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('ru')
  const filtered = useMemo(() => hasSearched ? records.filter((order) => {
    const searchText = [order.patientLabel, order.doctorName, order.id, ...order.workTypes].join(' ').toLocaleLowerCase('ru')
    if (normalizedQuery && !searchText.includes(normalizedQuery)) return false
    if (doctorId && order.doctorId !== doctorId) return false
    if (status !== 'ALL' && order.status !== status) return false
    if (debtState === 'WITH_DEBT' && order.financialSummary.debt <= 0) return false
    if (debtState === 'NO_DEBT' && order.financialSummary.debt > 0) return false
    if (fromDate && (!order.closureDate || order.closureDate < fromDate)) return false
    if (toDate && (!order.closureDate || order.closureDate > toDate)) return false
    if (!matchesAmount(order.financialSummary.income, minAmount, maxAmount)) return false
    return true
  }) : [], [records, hasSearched, normalizedQuery, doctorId, status, debtState, fromDate, toDate, minAmount, maxAmount])

  function resetSearchResults() {
    setHasSearched(false)
    setError('')
    setDeleteAllMessage('')
    setDeleteOrderMessage('')
    setDeleteOrderConfirmationId('')
    setDeleteOrderError('')
    setOpenOrderId('')
    setDetail(null)
    setDetailError('')
  }

  function openDeleteOrderConfirmation(orderId: string) {
    setDeleteOrderConfirmationId(orderId)
    setDeleteOrderError('')
    setDeleteOrderMessage('')
  }

  function closeDeleteOrderConfirmation() {
    if (deleteOrderBusy) return
    setDeleteOrderConfirmationId('')
    setDeleteOrderError('')
  }

  async function deleteArchivedOrder() {
    if (!deleteOrderConfirmationId) return
    const orderId = deleteOrderConfirmationId
    setDeleteOrderBusy(true)
    setDeleteOrderError('')
    try {
      await applicationPort.deleteOrder(orderId)
      await onDataChanged()
      setRecords((current) => current.filter((order) => order.id !== orderId))
      setOpenOrderId('')
      setDetail(null)
      setDetailError('')
      setDeleteOrderConfirmationId('')
      setDeleteOrderMessage('Заказ и все связанные данные удалены. Он больше не участвует в статистике.')
    } catch (caught) {
      setDeleteOrderError(caught instanceof Error ? caught.message : 'Не удалось удалить заказ.')
    } finally {
      setDeleteOrderBusy(false)
    }
  }

  function openDeleteAllConfirmation() {
    setDeleteAllPhrase('')
    setDeleteAllError('')
    setDeleteAllMessage('')
    setDeleteAllStep('type')
  }

  function closeDeleteAllConfirmation() {
    if (deleteAllBusy) return
    setDeleteAllStep('closed')
    setDeleteAllPhrase('')
    setDeleteAllError('')
  }

  async function deleteAllOrders() {
    setDeleteAllBusy(true)
    setDeleteAllError('')
    try {
      const deletedCount = await applicationPort.deleteAllOrders()
      await onDataChanged()
      setRecords([])
      setHasSearched(true)
      setOpenOrderId('')
      setDetail(null)
      setDetailError('')
      setError('')
      setDeleteAllStep('closed')
      setDeleteAllPhrase('')
      setDeleteAllMessage(`Удалено заказов: ${deletedCount}. Прайс и справочники сохранены.`)
    } catch (caught) {
      setDeleteAllError(caught instanceof Error ? caught.message : 'Не удалось удалить заказы.')
    } finally {
      setDeleteAllBusy(false)
    }
  }

  async function searchArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasSearched(true)
    setLoading(true)
    setError('')
    setDeleteAllMessage('')
    setDeleteOrderMessage('')
    setDeleteOrderConfirmationId('')
    setRecords([])
    setOpenOrderId('')
    setDetail(null)
    setDetailError('')
    try {
      setRecords(await applicationPort.listArchivedOrders())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось найти заказы в архиве.')
    } finally {
      setLoading(false)
    }
  }

  async function openDetails(orderId: string) {
    if (openOrderId === orderId) {
      setOpenOrderId('')
      setDetail(null)
      setDetailError('')
      return
    }
    setOpenOrderId(orderId)
    setDetail(null)
    setDetailError('')
    try {
      setDetail(await applicationPort.getOrder(orderId))
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'Не удалось открыть заказ.')
    }
  }

  return (
    <main className="section-panel finance-panel">
      <p className="eyebrow">Заказы, закрытые вручную</p>
      <h1>Архив</h1>
      <form className="finance-filters" aria-label="Фильтры архива" onSubmit={(event) => void searchArchive(event)}>
        <label>Поиск: пациент, врач, работа или ID
          <input onChange={(event) => { setQuery(event.target.value); resetSearchResults() }} value={query} />
        </label>
        <label>Врач
          <select onChange={(event) => { setDoctorId(event.target.value); resetSearchResults() }} value={doctorId}>
            <option value="">Все врачи</option>
            {initialDoctorFilter && !doctors.some((doctor) => doctor.id === initialDoctorFilter.id) && (
              <option value={initialDoctorFilter.id}>{initialDoctorFilter.name}</option>
            )}
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.lastName} {doctor.firstName}</option>)}
          </select>
        </label>
        <div aria-label="Период закрытия" className="finance-filter-range finance-filter-range--dates" role="group">
          <input aria-label="Закрыт с" onChange={(event) => { setFromDate(event.target.value); resetSearchResults() }} type="date" value={fromDate} />
          <span className="finance-filter-range__separator">по</span>
          <input aria-label="Закрыт по" onChange={(event) => { setToDate(event.target.value); resetSearchResults() }} type="date" value={toDate} />
        </div>
        <label>Состояние заказа
          <select onChange={(event) => { setStatus(event.target.value); resetSearchResults() }} value={status}>
            <option value="ALL">Все</option>
            <option value="CLOSED">Закрыт</option>
            <option value="CANCELLED">Отменён</option>
          </select>
        </label>
        <label>Долг
          <select onChange={(event) => { setDebtState(event.target.value); resetSearchResults() }} value={debtState}>
            <option value="ALL">Любой</option>
            <option value="WITH_DEBT">Есть долг</option>
            <option value="NO_DEBT">Без долга</option>
          </select>
        </label>
        <div className="finance-filter-range finance-filter-range--amount">
          <span className="finance-filter-range__title">Фильтровать по доходу (от - до)</span>
          <div className="finance-filter-range__controls">
            <input aria-label="Доход от" min="0" onChange={(event) => { setMinAmount(event.target.value); resetSearchResults() }} placeholder="От" type="number" value={minAmount} />
            <span className="finance-filter-range__separator" aria-hidden="true">—</span>
            <input aria-label="Доход до" min="0" onChange={(event) => { setMaxAmount(event.target.value); resetSearchResults() }} placeholder="До" type="number" value={maxAmount} />
          </div>
        </div>
        <button className="primary-action archive-search-button" disabled={loading} type="submit">Поиск</button>
      </form>
      {loading && <p className="form-muted" role="status">Ищу заказы в архиве…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!hasSearched && !loading && !error && <p className="form-muted" role="status">{doctorId ? 'Фильтр врача выбран. Нажмите «Поиск».' : 'Задайте критерии и нажмите «Поиск».'}</p>}
      {hasSearched && !loading && !error && filtered.length === 0 && <p className="calendar-empty-state" role="status">По заданным критериям заказов нет.</p>}
      {hasSearched && filtered.length > 0 && <div aria-label="Результаты поиска в архиве" className="archive-results">
        {filtered.map((order) => (
          <article className={`archive-result${order.financialSummary.debt > 0 ? ' archive-result--has-debt' : ''}`} key={order.id}>
            <button
              aria-expanded={openOrderId === order.id}
              aria-label={`${openOrderId === order.id ? 'Свернуть' : 'Открыть'} подробности заказа: ${order.patientLabel || 'без имени пациента'}`}
              className="archive-result__toggle"
              onClick={() => void openDetails(order.id)}
              type="button"
            >
              <span className="archive-result__fields">
                <span className="archive-result__field"><span className="archive-result__field-label">Пациент</span><strong>{order.patientLabel || 'Имя не указано'}</strong></span>
                <span className="archive-result__field"><span className="archive-result__field-label">Врач</span><strong>{order.doctorName || 'Не указан'}</strong></span>
                <span className="archive-result__field"><span className="archive-result__field-label">Дата закрытия</span><strong>{displayNumericDate(order.closureDate)}</strong></span>
              </span>
            </button>
            {openOrderId === order.id && (
              <section className="archive-result__details" aria-label={`Подробная информация о заказе ${order.id}`}>
                {!detail && !detailError && <p className="form-muted" role="status">Загружаю заказ…</p>}
                {detailError && <p className="form-error" role="alert">{detailError}</p>}
                {detail?.id === order.id && (
                  <>
                    <dl className="finance-record__amounts">
                      <div><dt>Старт заказа</dt><dd>{displayDate(detail.orderDate)}</dd></div>
                      <div><dt>Срок сдачи</dt><dd>{displayDate(detail.deadlineAt)}</dd></div>
                      <div><dt>Состояние</dt><dd>{detail.status === 'CANCELLED' ? 'Отменён' : 'Закрыт'}</dd></div>
                      <div><dt>Тип закрытия</dt><dd>{order.closureType === 'WITH_DEBT' ? 'С долгом' : order.closureType === 'CANCELLED' ? 'Отмена' : 'Обычное'}</dd></div>
                      <div><dt>Ожидаемый доход</dt><dd>{money(detail.financialSummary.expectedIncome)}</dd></div>
                      <div><dt>Доход</dt><dd>{money(detail.financialSummary.income)}</dd></div>
                      <div><dt>Получено при закрытии</dt><dd>{money(detail.financialSummary.receivedAmount)}</dd></div>
                      <div><dt>Погашено долга</dt><dd>{money(detail.financialSummary.debtRepaid)}</dd></div>
                      <div><dt>Расходы</dt><dd>{money(detail.financialSummary.expenses)}</dd></div>
                      <div><dt>Долг</dt><dd>{money(detail.financialSummary.debt)}</dd></div>
                      <div><dt>Сальдо</dt><dd>{money(detail.financialSummary.balance)}</dd></div>
                    </dl>
                    <div className="archive-result__section">
                      <h3>Работы в заказе</h3>
                      {detail.workItems.length > 0 ? (
                        <ul className="archive-detail-list">
                          {detail.workItems.map((item) => (
                            <li className="archive-detail-item" key={item.id}>
                              <strong>{item.workType}</strong>
                              <span>Состояние: {workItemStatusLabel(item.status)}</span>
                              <span>Количество единиц: {item.units}</span>
                              {item.toothCodes.length > 0 && <span>Зубы FDI: {item.toothCodes.join(', ')}</span>}
                              {item.shade && <span>Цвет: {item.shade}</span>}
                              {item.startedAt && <span>Начало: {displayDate(item.startedAt)}</span>}
                              {item.completedAt && <span>Выполнена: {displayDate(item.completedAt)}</span>}
                              {item.cancelledAt && <span>Отменена: {displayDate(item.cancelledAt)}</span>}
                              <span>Расчётная стоимость: {item.totalPriceSnapshot == null ? 'не задана' : money(item.totalPriceSnapshot)}</span>
                              <span>Принятая стоимость: {item.acceptedAmount === null ? 'не задана' : money(item.acceptedAmount)}</span>
                              {item.comment && <span>Комментарий: {item.comment}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : <p>Работы не указаны.</p>}
                    </div>
                    <div className="archive-result__section">
                      <h3>Расходы</h3>
                      {detail.expenses.length > 0 ? (
                        <ul className="archive-detail-list">
                          {detail.expenses.map((expense) => (
                            <li className="archive-detail-item" key={expense.id}>
                              <strong>{money(expense.amount)}</strong>
                              <span>Категория: {expense.category || 'не указана'}</span>
                              {expense.comment && <span>Комментарий: {expense.comment}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : <p>Расходы не указаны.</p>}
                    </div>
                    {detail.generalComment && <p>Комментарий к заказу: {detail.generalComment}</p>}
                    <div className="form-actions archive-result__actions">
                      <button className="destructive-action" disabled={deleteOrderBusy} onClick={() => openDeleteOrderConfirmation(order.id)} type="button">
                        Удалить заказ
                      </button>
                      <button className="primary-action" onClick={() => onOpenOrder?.(order.id)} type="button">
                        Перейти к редактированию
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </article>
        ))}
      </div>}
      {deleteOrderMessage && <p className="form-success" role="status">{deleteOrderMessage}</p>}
      {deleteAllMessage && <p className="form-success" role="status">{deleteAllMessage}</p>}
      <button className="destructive-action archive-delete-all" onClick={openDeleteAllConfirmation} type="button">
        Удалить все заказы
      </button>

      {deleteOrderConfirmationId && (
        <div
          className="order-delete-dialog-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeDeleteOrderConfirmation()
          }}
        >
          <section
            aria-describedby="archive-delete-order-description"
            aria-labelledby="archive-delete-order-title"
            aria-modal="true"
            className="order-delete-dialog"
            role="alertdialog"
            tabIndex={-1}
          >
            <h2 id="archive-delete-order-title">Вы уверены, что хотите удалить заказ?</h2>
            <p id="archive-delete-order-description">Все данные заказа будут удалены: работы, расходы, долг и погашения. Заказ перестанет участвовать в статистике.</p>
            {deleteOrderError && <p className="form-error" role="alert">{deleteOrderError}</p>}
            <div className="form-actions">
              <button className="destructive-action" disabled={deleteOrderBusy} onClick={() => void deleteArchivedOrder()} type="button">
                {deleteOrderBusy ? 'Удаляю…' : 'Да'}
              </button>
              <button autoFocus className="secondary-action" disabled={deleteOrderBusy} onClick={closeDeleteOrderConfirmation} type="button">Нет</button>
            </div>
          </section>
        </div>
      )}

      {deleteAllStep !== 'closed' && (
        <div
          className="order-delete-dialog-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeDeleteAllConfirmation()
          }}
        >
          {deleteAllStep === 'type' ? (
            <section
              aria-describedby="delete-all-orders-description"
              aria-labelledby="delete-all-orders-title"
              aria-modal="true"
              className="order-delete-dialog"
              role="alertdialog"
              tabIndex={-1}
            >
              <h2 id="delete-all-orders-title">Удалить все заказы?</h2>
              <p id="delete-all-orders-description">
                Все открытые, закрытые и отменённые заказы вместе с работами, расходами и долгами будут удалены. Прайс и справочники останутся.
                Для продолжения введите слово «Удалить».
              </p>
              <form className="data-form compact-form" onSubmit={(event) => {
                event.preventDefault()
                if (deleteAllPhrase === 'Удалить') setDeleteAllStep('final')
              }}>
                <label>Подтверждение
                  <input
                    autoComplete="off"
                    autoFocus
                    onChange={(event) => setDeleteAllPhrase(event.target.value)}
                    value={deleteAllPhrase}
                  />
                </label>
                {deleteAllError && <p className="form-error" role="alert">{deleteAllError}</p>}
                <div className="form-actions">
                  <button className="secondary-action" disabled={deleteAllBusy} onClick={closeDeleteAllConfirmation} type="button">Отмена</button>
                  <button className="primary-action" disabled={deleteAllBusy || deleteAllPhrase !== 'Удалить'} type="submit">Продолжить</button>
                </div>
              </form>
            </section>
          ) : (
            <section
              aria-describedby="delete-all-orders-final-description"
              aria-labelledby="delete-all-orders-final-title"
              aria-modal="true"
              className="order-delete-dialog"
              role="alertdialog"
              tabIndex={-1}
            >
              <h2 id="delete-all-orders-final-title">Последнее подтверждение</h2>
              <p id="delete-all-orders-final-description">Все заказы будут удалены! Прайс и справочники сохранятся.</p>
              {deleteAllError && <p className="form-error" role="alert">{deleteAllError}</p>}
              <div className="form-actions">
                <button className="destructive-action" disabled={deleteAllBusy} onClick={() => void deleteAllOrders()} type="button">
                  {deleteAllBusy ? 'Удаляю…' : 'Удалить'}
                </button>
                <button autoFocus className="secondary-action" disabled={deleteAllBusy} onClick={closeDeleteAllConfirmation} type="button">Отмена</button>
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

export function DebtsPanel({ applicationPort, doctors, onOpenOrder }: PanelProps) {
  const loadDebts = useCallback(() => applicationPort.listDebts(), [applicationPort])
  const { records, loading, error } = useRecords<DebtRecord>(loadDebts)
  const [query, setQuery] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('ru')
  const filtered = useMemo(() => records.filter((debt) => {
    const searchText = [debt.patientLabel, debt.doctorName, debt.orderId, debt.comment, ...debt.workTypes].join(' ').toLocaleLowerCase('ru')
    if (normalizedQuery && !searchText.includes(normalizedQuery)) return false
    if (doctorId && debt.doctorId !== doctorId) return false
    if (fromDate && (!debt.closureDate || debt.closureDate < fromDate)) return false
    if (toDate && (!debt.closureDate || debt.closureDate > toDate)) return false
    return matchesAmount(debt.amount, minAmount, maxAmount)
  }), [records, normalizedQuery, doctorId, fromDate, toDate, minAmount, maxAmount])

  return (
    <main className="section-panel finance-panel">
      <p className="eyebrow">Задолженность по закрытым заказам</p>
      <h1>Долги</h1>
      <div className="finance-filters" aria-label="Фильтры долгов">
        <label>Поиск: пациент, врач, работа, комментарий или ID
          <input onChange={(event) => setQuery(event.target.value)} value={query} />
        </label>
        <label>Врач
          <select onChange={(event) => setDoctorId(event.target.value)} value={doctorId}>
            <option value="">Все врачи</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.lastName} {doctor.firstName}</option>)}
          </select>
        </label>
        <label>Закрыт с<input onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} /></label>
        <label>Закрыт по<input onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} /></label>
        <label>Сумма от<input min="0" onChange={(event) => setMinAmount(event.target.value)} type="number" value={minAmount} /></label>
        <label>Сумма до<input min="0" onChange={(event) => setMaxAmount(event.target.value)} type="number" value={maxAmount} /></label>
      </div>
      {loading && <p className="form-muted" role="status">Загружаю долги…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="calendar-empty-state" role="status">Долгов по заданным фильтрам нет.</p>}
      <div className="finance-records">
        {filtered.map((debt) => (
          <article className="finance-record" key={debt.id}>
            <div className="finance-record__heading">
              <h2><button className="text-button finance-record__order-link" onClick={() => onOpenOrder?.(debt.orderId)} type="button">{debt.patientLabel || 'Заказ без имени пациента'}</button></h2>
              <strong className="financial-summary__debt">{money(debt.amount)}</strong>
            </div>
            <p>{debt.doctorName || 'Без врача'} · заказ закрыт: {displayDate(debt.closureDate)}</p>
            <p>Первоначальный долг: {money(debt.originalAmount)} · погашено: {money(debt.paidAmount)} · осталось: {money(debt.amount)}</p>
            <p>Работы: {debt.workTypes.length ? debt.workTypes.join(', ') : 'не указаны'}</p>
            {debt.comment && <p>Комментарий: {debt.comment}</p>}
            <small>ID заказа: {debt.orderId}</small>
          </article>
        ))}
      </div>
    </main>
  )
}

type Period = 'week' | 'month' | 'quarter' | 'year' | 'custom'

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function periodDates(period: Exclude<Period, 'custom'>): [string, string] {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (period === 'week') {
    const daysSinceMonday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - daysSinceMonday)
  } else if (period === 'month') {
    start.setDate(1)
  } else if (period === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
  } else {
    start.setMonth(0, 1)
  }
  return [dateKey(start), dateKey(today)]
}

interface StatisticsPanelProps {
  applicationPort: ApplicationPort
  onOpenDoctorArchive: (doctorId: string, doctorName: string) => void
}

export function StatisticsPanel({ applicationPort, onOpenDoctorArchive }: StatisticsPanelProps) {
  const [period, setPeriod] = useState<Period>('month')
  const initialRange = periodDates('month')
  const [fromDate, setFromDate] = useState(initialRange[0])
  const [toDate, setToDate] = useState(initialRange[1])
  const [statistics, setStatistics] = useState<StatisticsRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void applicationPort.getStatistics(fromDate || null, toDate || null).then((record) => {
      if (active) setStatistics(record)
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить статистику.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [applicationPort, fromDate, toDate])

  function changePeriod(next: Period) {
    setPeriod(next)
    if (next !== 'custom') {
      const [from, to] = periodDates(next)
      setFromDate(from)
      setToDate(to)
    }
  }

  async function recalculateStatistics() {
    setLoading(true)
    setError('')
    try {
      await applicationPort.recalculateStatistics(fromDate || null, toDate || null)
      setStatistics(await applicationPort.getStatistics(fromDate || null, toDate || null))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось пересчитать статистику.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="section-panel finance-panel">
      <p className="eyebrow">Только закрытые и отменённые заказы</p>
      <h1>Статистика</h1>
      <div className="finance-filters finance-filters--statistics">
        <label>Период
          <select onChange={(event) => changePeriod(event.target.value as Period)} value={period}>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
            <option value="quarter">Квартал</option>
            <option value="year">Год</option>
            <option value="custom">Произвольный период</option>
          </select>
        </label>
        <label>С<input onChange={(event) => { setPeriod('custom'); setFromDate(event.target.value) }} type="date" value={fromDate} /></label>
        <label>По<input onChange={(event) => { setPeriod('custom'); setToDate(event.target.value) }} type="date" value={toDate} /></label>
        <button className="primary-action" disabled={loading} onClick={() => void recalculateStatistics()} type="button">Обновить и пересчитать</button>
      </div>
      {loading && <p className="form-muted" role="status">Пересчитываю по закрытым заказам…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {statistics && !error && (
        <>
          <p className="form-muted">Заказов за период: {statistics.orderCount}</p>
          <dl className="finance-record__amounts statistics-totals">
            <div><dt>Общий доход</dt><dd>{money(statistics.income)}</dd></div>
            <div><dt>Ожидалось по работам</dt><dd>{money(statistics.expectedIncome)}</dd></div>
            <div><dt>Получено при закрытии</dt><dd>{money(statistics.receivedAmount)}</dd></div>
            <div><dt>Погашено долга</dt><dd>{money(statistics.debtRepaid)}</dd></div>
            <div><dt>Расходы</dt><dd>{money(statistics.expenses)}</dd></div>
            <div><dt>Остаток долга</dt><dd>{money(statistics.debt)}</dd></div>
            <div><dt>Сальдо</dt><dd>{money(statistics.balance)}</dd></div>
          </dl>
          <section className="finance-records" aria-label="Сальдо по врачам">
            <h2>Сальдо по врачам</h2>
            {statistics.byDoctor.length === 0 ? <p>Нет закрытых заказов за выбранный период.</p> : statistics.byDoctor.map((doctor) => (
              <article className={`finance-record${doctor.debt > 0 ? ' finance-record--has-debt' : ''}`} key={doctor.doctorId ?? 'no-doctor'}>
                <div className="finance-record__heading">
                  <h3>{doctor.doctorId ? (
                    <button
                      aria-label={`Открыть архив с фильтром по врачу: ${doctor.doctorName}`}
                      className="finance-record__doctor-link"
                      onClick={() => onOpenDoctorArchive(doctor.doctorId!, doctor.doctorName)}
                      type="button"
                    >
                      {doctor.doctorName}
                    </button>
                  ) : doctor.doctorName}</h3>
                  <strong>{money(doctor.balance)}</strong>
                </div>
                <p>Заказов: {doctor.orderCount} · доход {money(doctor.income)} · погашено долга {money(doctor.debtRepaid)} · расходы {money(doctor.expenses)} · остаток долга {money(doctor.debt)}</p>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
