import { useEffect, useState, type FormEvent } from 'react'
import type {
  ApplicationDebtPaymentRecord,
  ApplicationFinancialSummary,
  ApplicationOrderDetail,
  ApplicationOrderExpenseRecord,
  ApplicationPort,
  ApplicationWorkItemRecord,
} from '@dental-tech/application'
import type { CalendarStartupNamedValue } from '@dental-tech/application'
import type { CalendarOrder } from './calendar-state.ts'
import type { DoctorOption, PricingOption, RequiredFieldOption } from './OrderForm.tsx'
import { Odontogram } from './Odontogram.tsx'
import { OrderBasicsFields, OrderCardFrame } from './OrderCard.tsx'
import { parseFdiToothList } from './fdi-tooth-list.ts'
import { initialUnitMode, pricingEditorFieldIsVisible } from './pricing-editor-fields.ts'
import { ExpenseEditor, type ExpenseEditorSaveValue } from './ExpenseEditor.tsx'
import { localDateFromValue } from './date-display.ts'
import { toOrderExpenseUpdateCommand } from './order-expense-command.ts'

type UnitMode = 'TOOTH_COUNT' | 'FIXED' | 'OTHER'

interface WorkItemRecord extends ApplicationWorkItemRecord {
  pricingItemId: string | null
  acceptedAmount: number | null
  toothCodesText?: string
  toothSelectionEdited?: boolean
}

type ExpenseRecord = ApplicationOrderExpenseRecord
type DebtPaymentRecord = ApplicationDebtPaymentRecord
type FinancialSummary = ApplicationFinancialSummary

type ClosureMode = 'NORMAL' | 'WITH_DEBT'
type DebtRepaymentMode = 'FULL' | 'PARTIAL'

interface UniqueWorkDraft {
  itemId: string | null
  workType: string
  acceptedAmount: string
}

interface OrderDetail extends ApplicationOrderDetail {
  workItems: WorkItemRecord[]
}

interface CurrentWorkPanelProps {
  applicationPort: ApplicationPort
  orders: CalendarOrder[]
  initialOrderId?: string | null
  doctors: DoctorOption[]
  colors: CalendarStartupNamedValue[]
  pricingItems: PricingOption[]
  requiredFields: RequiredFieldOption[]
  onBack: () => void
  onOrderSaved?: () => void | Promise<void>
  onReturnFromDetail?: () => void
  detailReturnLabel?: string
  onCreateOrder: () => void
  onDataChanged: () => Promise<void>
}

function dateInputValue(value: string | null): string {
  const date = localDateFromValue(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function businessDateInputValue(value: string | null): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
}

function dateTimeValue(value: string): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 17, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function displayDate(value: string | null): string {
  if (!value) return 'Срок не задан'
  const date = localDateFromValue(value)
  return date ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : 'Срок не задан'
}

function money(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

function amountWasChanged(acceptedAmount: number | null, calculatedAmount: number | null): boolean {
  return calculatedAmount !== null && (acceptedAmount === null || Math.abs(acceptedAmount - calculatedAmount) > 0.000001)
}

function isUniqueWorkItem(item: WorkItemRecord): boolean {
  return item.pricingItemId === null && item.unitMode === 'FIXED' && item.units === 1 && item.toothCodes.length === 0
}

function completedWorkTotal(items: WorkItemRecord[]): number {
  return items
    .filter((item) => item.status === 'COMPLETED')
    .reduce((total, item) => total + (item.acceptedAmount ?? 0), 0)
}

function nonCancelledWorkTotal(items: WorkItemRecord[]): number {
  return items
    .filter((item) => item.status !== 'CANCELLED')
    .reduce((total, item) => total + (item.acceptedAmount ?? 0), 0)
}

function workItemStatusTransitions(status: WorkItemRecord['status']): WorkItemRecord['status'][] {
  if (status === 'ACTIVE') return ['CANCELLED', 'COMPLETED']
  if (status === 'COMPLETED') return ['CANCELLED', 'ACTIVE']
  return ['ACTIVE', 'COMPLETED']
}

function workItemStatusActionLabel(status: WorkItemRecord['status']): string {
  if (status === 'ACTIVE') return 'В работе'
  if (status === 'COMPLETED') return 'Выполнено'
  return 'Отменено'
}

export function CurrentWorkPanel({ applicationPort, orders, initialOrderId, doctors, colors, pricingItems, requiredFields, onBack, onOrderSaved, onReturnFromDetail, detailReturnLabel, onCreateOrder, onDataChanged }: CurrentWorkPanelProps) {
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newPricingItemId, setNewPricingItemId] = useState('')
  const [newUnits, setNewUnits] = useState(1)
  const [newAcceptedAmount, setNewAcceptedAmount] = useState<number | null>(null)
  const [newUnitMode, setNewUnitMode] = useState<UnitMode>('TOOTH_COUNT')
  const [newToothCodes, setNewToothCodes] = useState<string[]>([])
  const [newToothCodesText, setNewToothCodesText] = useState('')
  const [newComment, setNewComment] = useState('')
  const [newShade, setNewShade] = useState('')
  const [addWorkOpen, setAddWorkOpen] = useState(false)
  const [expandedWorkItemId, setExpandedWorkItemId] = useState<string | null>(null)
  const [expandedWorkItemDraft, setExpandedWorkItemDraft] = useState<WorkItemRecord | null>(null)
  const [workDeleteTarget, setWorkDeleteTarget] = useState<{ kind: 'saved'; itemId: string } | { kind: 'new' } | null>(null)
  const [uniqueWorkDraft, setUniqueWorkDraft] = useState<UniqueWorkDraft | null>(null)
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | 'new' | null>(null)
  const [closureMode, setClosureMode] = useState<ClosureMode | null>(null)
  const [closureDate, setClosureDate] = useState('')
  const [closureReceivedAmount, setClosureReceivedAmount] = useState('')
  const [closureDebtAmount, setClosureDebtAmount] = useState('')
  const [closureDebtComment, setClosureDebtComment] = useState('')
  const [closureDebtManuallyEdited, setClosureDebtManuallyEdited] = useState(false)
  const [debtRepaymentMode, setDebtRepaymentMode] = useState<DebtRepaymentMode | null>(null)
  const [debtRepaymentAmount, setDebtRepaymentAmount] = useState('')
  const [debtForgivenessConfirmationOpen, setDebtForgivenessConfirmationOpen] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const activePricingItems = pricingItems.filter((pricing) => pricing.active && pricing.itemType !== 'EXPENSE')
  const selectedNewPricing = pricingItems.find((pricing) => pricing.id === newPricingItemId)
  const showNewNumbering = pricingEditorFieldIsVisible(selectedNewPricing, 'numbering')
  const showNewColor = pricingEditorFieldIsVisible(selectedNewPricing, 'color')
  const showNewQuantity = !showNewNumbering && selectedNewPricing?.calculationMode === 'PER_UNIT'

  useEffect(() => {
    if (initialOrderId) void loadDetail(initialOrderId)
  }, [initialOrderId])

  function calculatedAmount(pricingItemId: string | null, units: number): number | null {
    const pricing = pricingItems.find((item) => item.id === pricingItemId)
    if (!pricing) return null
    if (pricing.calculationMode === 'PER_UNIT') return (pricing.unitPrice ?? 0) * units
    return pricing.fixedPrice
  }

  function amountAfterEstimateChange(item: WorkItemRecord, pricingItemId: string | null, units: number): number | null {
    const previousEstimate = calculatedAmount(item.pricingItemId, item.units)
    const nextEstimate = calculatedAmount(pricingItemId, units)
    return item.acceptedAmount === null || item.acceptedAmount === previousEstimate ? nextEstimate : item.acceptedAmount
  }

  async function loadDetail(orderId: string): Promise<OrderDetail | null> {
    setLoading(true)
    setError('')
    try {
      const loadedDetail = await applicationPort.getOrder(orderId) as OrderDetail
      const normalizedDetail = {
        ...loadedDetail,
        workItems: loadedDetail.workItems.map((item) => ({ ...item, toothCodesText: item.toothCodes.join(', ') })),
      }
      setDetail(normalizedDetail)
      setExpandedWorkItemId(null)
      setExpandedWorkItemDraft(null)
      setAddWorkOpen(false)
      setExpandedExpenseId(null)
      setDebtForgivenessConfirmationOpen(false)
      return normalizedDetail
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить заказ.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function persistOrderEdits(): Promise<boolean> {
    if (!detail) return false
    if (addWorkOpen || expandedWorkItemId || uniqueWorkDraft) {
      setError('Перед сохранением заказа сохраните, удалите или отмените открытую работу.')
      return false
    }
    const issues: string[] = []
    if ((requiredFields.find((field) => field.fieldKey === 'patient_label')?.required ?? true) && !detail.patientLabel?.trim()) issues.push('укажите имя пациента')
    if ((requiredFields.find((field) => field.fieldKey === 'doctor_id')?.required ?? true) && !detail.doctorId) issues.push('выберите врача')
    if (!detail.orderDate) issues.push('укажите старт заказа')
    if ((requiredFields.find((field) => field.fieldKey === 'deadline_at')?.required ?? true) && !detail.deadlineAt) issues.push('укажите срок сдачи')
    if (detail.status !== 'ACTIVE' && !detail.closureDate) issues.push('укажите дату закрытия')

    const workItemsToSave = detail.workItems

    workItemsToSave.forEach((item, index) => {
      const prefix = `Работа ${index + 1}`
      if (!item.workType.trim()) issues.push(`${prefix}: укажите наименование`)
      if (item.acceptedAmount === null || !Number.isFinite(item.acceptedAmount) || item.acceptedAmount < 0) {
        issues.push(`${prefix}: укажите корректную стоимость`)
      }
      if (item.pricingItemId === null && !isUniqueWorkItem(item)) {
        issues.push(`${prefix}: выберите позицию прайса или укажите уникальную работу`)
      }
      if (item.unitMode === 'TOOTH_COUNT') {
        const parsed = parseFdiToothList(item.toothCodes.join(', '))
        if (parsed.error) issues.push(`${prefix}: ${parsed.error}`)
      } else if (item.unitMode === 'OTHER') {
        const parsed = parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', '))
        if (parsed.error) issues.push(`${prefix}: ${parsed.error}`)
      }
      if (detail.status !== 'ACTIVE') {
        if (item.status === 'COMPLETED' && (!item.completedAt || item.cancelledAt)) {
          issues.push(`${prefix}: у выполненной работы должна быть только дата выполнения`)
        }
        if (item.status === 'CANCELLED' && (!item.cancelledAt || item.completedAt)) {
          issues.push(`${prefix}: у отменённой работы должна быть только дата отмены`)
        }
        if (item.status === 'ACTIVE' && (item.completedAt || item.cancelledAt)) {
          issues.push(`${prefix}: у работы «В работе» не должно быть даты выполнения или отмены`)
        }
      }
    })

    if (expandedExpenseId !== null) issues.push('сохраните или отмените открытый расход')
    detail.expenses.forEach((expense, index) => {
      if (!Number.isFinite(expense.unitPrice) || expense.unitPrice <= 0 || !Number.isFinite(expense.quantity) || expense.quantity <= 0 || !Number.isFinite(expense.amount) || expense.amount <= 0) {
        issues.push(`Расход ${index + 1}: издержки и количество должны быть больше нуля`)
      }
    })

    if (issues.length > 0) {
      setError(`Исправьте поля: ${issues.join('; ')}.`)
      return false
    }
    const deadlineDate = dateInputValue(detail.deadlineAt)
    if (deadlineDate && deadlineDate < detail.orderDate) {
      const accepted = window.confirm('Срок сдачи раньше старта заказа. Оформить однодневный заказ со сроком сдачи в день старта?')
      if (!accepted) return false
      setDetail({ ...detail, deadlineAt: dateTimeValue(detail.orderDate) })
    }
    const savedDeadlineDate = deadlineDate && deadlineDate < detail.orderDate ? detail.orderDate : deadlineDate
    let savedClosureDate = detail.closureDate
    if (detail.status !== 'ACTIVE' && savedClosureDate && savedClosureDate < detail.orderDate) {
      const accepted = window.confirm('Дата закрытия раньше старта заказа. Установить дату закрытия в день старта?')
      if (!accepted) return false
      savedClosureDate = detail.orderDate
      setDetail({ ...detail, closureDate: savedClosureDate })
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.updateOrder(detail.id, {
        patientLabel: detail.patientLabel,
        doctorId: detail.doctorId,
        orderDate: detail.orderDate,
        deadlineAt: dateTimeValue(savedDeadlineDate ?? ''),
        generalComment: detail.generalComment,
        ...(detail.status === 'ACTIVE' ? {} : { closureDate: savedClosureDate }),
      })

      for (const item of workItemsToSave) {
        await applicationPort.updateWorkItem(detail.id, item.id, workItemRequestBody(item, detail.status))
      }

      for (const expense of detail.expenses) {
        await applicationPort.updateOrderExpense(detail.id, expense.id, toOrderExpenseUpdateCommand(expense))
      }

      return true
    } catch (caught) {
      if (caught instanceof Error) {
        setError(`Не удалось полностью сохранить заказ. ${caught.message}`)
      } else {
        setError('Не удалось полностью сохранить заказ.')
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveOrderChanges(exitAfterSave: boolean) {
    setError('')
    setMessage('')
    if (!await persistOrderEdits()) return
    try {
      await onDataChanged()
      if (exitAfterSave) {
        if (onOrderSaved) await onOrderSaved()
        else onBack()
      } else {
        setMessage('Заказ сохранён.')
      }
    } catch {
      setError('Заказ сохранён, но список заказов не удалось обновить.')
    }
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveOrderChanges(false)
  }

  async function saveOrderAndExit() {
    await saveOrderChanges(true)
  }

  function updateWorkItem(itemId: string, patch: Partial<WorkItemRecord>) {
    setExpandedWorkItemDraft((current) => current?.id === itemId ? { ...current, ...patch } : current)
  }

  function expandWorkItem(item: WorkItemRecord) {
    setExpandedWorkItemId(item.id)
    setExpandedWorkItemDraft({ ...item, toothCodes: [...item.toothCodes], toothCodesText: item.toothCodes.join(', ') })
    setAddWorkOpen(false)
    setUniqueWorkDraft(null)
    setError('')
  }

  function cancelWorkEditor() {
    setExpandedWorkItemId(null)
    setExpandedWorkItemDraft(null)
    resetNewWorkDraft()
    setAddWorkOpen(false)
    setError('')
  }

  function updateWorkItemTeeth(itemId: string, toothCodes: string[]) {
    const item = expandedWorkItemDraft?.id === itemId ? expandedWorkItemDraft : undefined
    if (!item) return
    updateWorkItem(itemId, {
      toothCodes,
      toothCodesText: toothCodes.join(', '),
      units: toothCodes.length,
      acceptedAmount: amountAfterEstimateChange(item, item.pricingItemId, toothCodes.length),
      toothSelectionEdited: true,
    })
  }

  function updateWorkItemManualTeeth(item: WorkItemRecord, value: string) {
    const parsed = parseFdiToothList(value)
    if (parsed.error) {
      updateWorkItem(item.id, { toothCodesText: value })
      return
    }
    updateWorkItem(item.id, {
      toothCodes: parsed.codes,
      toothCodesText: value,
      units: parsed.codes.length,
      acceptedAmount: amountAfterEstimateChange(item, item.pricingItemId, parsed.codes.length),
      toothSelectionEdited: true,
    })
  }

  function workItemRequestBody(item: WorkItemRecord, orderStatus: OrderDetail['status']) {
    const manualTeeth = item.unitMode === 'OTHER'
      ? parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', '))
      : null
    return {
      pricingItemId: item.pricingItemId,
      workType: item.workType,
      unitMode: item.unitMode,
      units: manualTeeth ? manualTeeth.codes.length : item.unitMode === 'TOOTH_COUNT' ? item.toothCodes.length : item.units,
      acceptedAmount: item.acceptedAmount,
      toothCodes: item.unitMode === 'FIXED' ? [] : manualTeeth?.codes ?? item.toothCodes,
      shade: item.shade,
      comment: item.comment,
      ...(orderStatus === 'ACTIVE' ? {} : {
        status: item.status,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        cancelledAt: item.cancelledAt,
      }),
    }
  }

  function changeWorkItemUnitMode(item: WorkItemRecord, unitMode: UnitMode) {
    const toothCodes = unitMode === 'FIXED' ? [] : item.toothCodes
    const units = unitMode === 'FIXED' ? 1 : toothCodes.length
    updateWorkItem(item.id, {
      unitMode,
      toothCodes,
      toothCodesText: toothCodes.join(', '),
      units,
      acceptedAmount: amountAfterEstimateChange(item, item.pricingItemId, units),
      toothSelectionEdited: (unitMode === 'TOOTH_COUNT' || unitMode === 'OTHER') && item.unitMode !== unitMode
        ? true
        : item.toothSelectionEdited,
    })
  }

  function chooseWorkItemPricing(item: WorkItemRecord, pricingItemId: string) {
    const pricing = pricingItems.find((candidate) => candidate.id === pricingItemId)
    const unitMode = pricing ? initialUnitMode(pricing) : item.unitMode
    const toothCodes = unitMode === 'FIXED' ? [] : item.toothCodes
    const units = unitMode === 'FIXED' ? 1 : toothCodes.length
    updateWorkItem(item.id, {
      pricingItemId: pricingItemId || null,
      workType: pricing?.name ?? item.workType,
      unitMode,
      toothCodes,
      toothCodesText: toothCodes.join(', '),
      units,
      acceptedAmount: amountAfterEstimateChange(item, pricingItemId || null, units),
      toothSelectionEdited: unitMode === 'TOOTH_COUNT' && item.unitMode !== 'TOOTH_COUNT' ? true : item.toothSelectionEdited,
    })
  }

  function chooseNewPricing(pricingItemId: string) {
    const pricing = pricingItems.find((candidate) => candidate.id === pricingItemId)
    const unitMode = pricing ? initialUnitMode(pricing) : newUnitMode
    const toothCodes = unitMode === 'FIXED' ? [] : newToothCodes
    const units = unitMode === 'FIXED' ? 1 : toothCodes.length
    setNewPricingItemId(pricingItemId)
    setNewUnitMode(unitMode)
    setNewToothCodes(toothCodes)
    setNewToothCodesText(toothCodes.join(', '))
    setNewUnits(units)
    setNewAcceptedAmount(calculatedAmount(pricingItemId || null, units))
  }

  function updateNewManualToothList(value: string) {
    const parsed = parseFdiToothList(value)
    setNewToothCodesText(value)
    if (parsed.error) return
    setNewToothCodes(parsed.codes)
    setNewUnits(parsed.codes.length)
    setNewAcceptedAmount(calculatedAmount(newPricingItemId || null, parsed.codes.length))
  }

  function changeNewUnitMode(unitMode: UnitMode) {
    const toothCodes = unitMode === 'FIXED' ? [] : newToothCodes
    const units = unitMode === 'FIXED' ? 1 : toothCodes.length
    setNewUnitMode(unitMode)
    setNewToothCodes(toothCodes)
    setNewToothCodesText(toothCodes.join(', '))
    setNewUnits(units)
    setNewAcceptedAmount(calculatedAmount(newPricingItemId || null, units))
  }

  function openUniqueWorkForm() {
    setUniqueWorkDraft({ itemId: null, workType: '', acceptedAmount: '' })
    setError('')
  }

  async function saveWorkItem(item: WorkItemRecord): Promise<boolean> {
    if (!detail) return false
    if (!item.workType.trim()) {
      setError('Укажите наименование работы.')
      return false
    }
    if (item.acceptedAmount === null || !Number.isFinite(item.acceptedAmount) || item.acceptedAmount < 0) {
      setError('Укажите корректную стоимость работы.')
      return false
    }
    if (item.unitMode === 'TOOTH_COUNT' && item.toothSelectionEdited && item.toothCodes.length === 0) {
      setError('Выберите хотя бы один зуб FDI для работы.')
      return false
    }
    if (item.pricingItemId === null && !isUniqueWorkItem(item)) {
      setError('Выберите позицию прайса или оформите уникальную работу.')
      return false
    }
    const manualTeeth = item.unitMode === 'OTHER'
      ? parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', '))
      : null
    if (manualTeeth?.error) {
      setError(`Исправьте поле «Номера по FDI»: ${manualTeeth.error}`)
      return false
    }
    const selectedPricing = pricingItems.find((pricing) => pricing.id === item.pricingItemId)
    if (selectedPricing?.calculationMode === 'PER_UNIT' && !pricingEditorFieldIsVisible(selectedPricing, 'numbering')
      && (!Number.isInteger(item.units) || item.units < 1)) {
      setError('Укажите целое количество единиц от 1.')
      return false
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.updateWorkItem(detail.id, item.id, workItemRequestBody(item, detail.status))
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Работа сохранена.')
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить работу.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function changeWorkItemStatus(item: WorkItemRecord, status: WorkItemRecord['status']) {
    if (!detail) return
    const suggestsClosing = status === 'COMPLETED'
      && detail.workItems.every((candidate) => candidate.id === item.id || candidate.status !== 'ACTIVE')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.setWorkItemStatus(detail.id, item.id, status)
      const updatedDetail = await loadDetail(detail.id)
      await onDataChanged()
      setMessage(`Статус работы изменён на «${workItemStatusActionLabel(status)}».`)
      if (suggestsClosing && window.confirm('В заказе не осталось работ со статусом «В работе». Перейти к закрытию заказа?')) {
        openClosureOptions(updatedDetail ?? detail)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить статус работы.')
    } finally {
      setBusy(false)
    }
  }

  async function addWorkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    if (uniqueWorkDraft?.itemId === null) {
      const workType = uniqueWorkDraft.workType.trim()
      const acceptedAmount = Number(uniqueWorkDraft.acceptedAmount)
      if (!workType) {
        setError('Укажите название уникальной работы.')
        return
      }
      if (!Number.isFinite(acceptedAmount) || acceptedAmount < 0) {
        setError('Укажите корректную стоимость уникальной работы.')
        return
      }
      setBusy(true)
      setError('')
      setMessage('')
      try {
        await applicationPort.createWorkItem(detail.id, { pricingItemId: null, workType, unitMode: 'FIXED', units: 1, acceptedAmount, toothCodes: [], shade: null, comment: null })
        resetNewWorkDraft()
        setAddWorkOpen(false)
        await loadDetail(detail.id)
        await onDataChanged()
        setMessage('Работа добавлена.')
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Не удалось добавить уникальную работу.')
      } finally {
        setBusy(false)
      }
      return
    }
    const selectedPricing = activePricingItems.find((pricing) => pricing.id === newPricingItemId)
    if (!selectedPricing) {
      setError('Выберите позицию прайса или добавьте уникальную работу.')
      return
    }
    if (selectedPricing.calculationMode === 'PER_UNIT' && !pricingEditorFieldIsVisible(selectedPricing, 'numbering')
      && (!Number.isInteger(newUnits) || newUnits < 1)) {
      setError('Укажите целое количество единиц от 1.')
      return
    }
    if (newUnitMode === 'TOOTH_COUNT' && newToothCodes.length === 0) {
      setError('Выберите хотя бы один зуб FDI для новой работы.')
      return
    }
    if (newAcceptedAmount === null || !Number.isFinite(newAcceptedAmount) || newAcceptedAmount < 0) {
      setError('Укажите корректную стоимость работы.')
      return
    }
    const manualTeeth = newUnitMode === 'OTHER' ? parseFdiToothList(newToothCodesText) : null
    if (manualTeeth?.error) {
      setError(`Исправьте поле «Номера по FDI»: ${manualTeeth.error}`)
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.createWorkItem(detail.id, {
          pricingItemId: selectedPricing.id,
          workType: selectedPricing.name,
          unitMode: newUnitMode,
          units: manualTeeth ? manualTeeth.codes.length : newUnitMode === 'TOOTH_COUNT' ? newToothCodes.length : newUnits,
          acceptedAmount: newAcceptedAmount,
          toothCodes: manualTeeth?.codes ?? newToothCodes,
          shade: newShade || null,
          comment: newComment || null,
      })
      resetNewWorkDraft()
      setAddWorkOpen(false)
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Работа добавлена.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось добавить работу.')
    } finally {
      setBusy(false)
    }
  }

  function resetNewWorkDraft() {
    setNewPricingItemId('')
    setNewUnits(1)
    setNewAcceptedAmount(null)
    setNewShade('')
    setNewUnitMode('TOOTH_COUNT')
    setNewToothCodes([])
    setNewToothCodesText('')
    setNewComment('')
    setUniqueWorkDraft(null)
  }

  async function addExpense(value: ExpenseEditorSaveValue) {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await applicationPort.createOrderExpense(detail.id, { ...value, category: value.name })
      setExpandedExpenseId(null)
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Расход добавлен.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось добавить расход.')
    } finally {
      setBusy(false)
    }
  }

  async function saveExpense(expense: ExpenseRecord, value: ExpenseEditorSaveValue) {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      await applicationPort.updateOrderExpense(detail.id, expense.id, { ...value, category: value.name })
      setExpandedExpenseId(null)
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Расход сохранён.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить расход.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteExpense(expense: ExpenseRecord) {
    if (!detail || !window.confirm('Удалить этот расход?')) return
    setBusy(true)
    setError('')
    try {
      await applicationPort.deleteOrderExpense(detail.id, expense.id)
      setExpandedExpenseId(null)
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Расход удалён.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить расход.')
    } finally {
      setBusy(false)
    }
  }

  function openClosureOptions(orderDetail: OrderDetail | null = detail) {
    prepareClosure('NORMAL', orderDetail)
  }

  function openClosure(mode: ClosureMode, orderDetail: OrderDetail | null = detail) {
    prepareClosure(mode, orderDetail)
  }

  function prepareClosure(mode: ClosureMode | null, orderDetail: OrderDetail | null) {
    if (!orderDetail) return
    const unfinished = orderDetail.workItems.filter((item) => item.status === 'ACTIVE')
    if (unfinished.length > 0) {
      setError(`Сначала отметьте выполненными или удалите незавершённые работы: ${unfinished.map((item) => item.workType).join(', ')}.`)
      return
    }
    setClosureMode(mode)
    const today = new Date()
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setClosureDate(todayValue)
    const expected = completedWorkTotal(orderDetail.workItems)
    setClosureReceivedAmount(String(expected))
    setClosureDebtAmount('0')
    setClosureDebtManuallyEdited(false)
    setClosureDebtComment('')
    setError('')
    setMessage('')
  }

  function changeClosureReceivedAmount(value: string) {
    setClosureReceivedAmount(value)
    if (!detail) return
    const expected = completedWorkTotal(detail.workItems)
    const received = value.trim() === '' ? null : Number(value)
    if (received === null || !Number.isFinite(received)) return

    if (closureMode === 'WITH_DEBT' && received >= expected) {
      setClosureMode('NORMAL')
      setClosureDebtManuallyEdited(false)
      setClosureDebtAmount('0')
      setClosureDebtComment('')
      return
    }

    if (!closureDebtManuallyEdited || closureMode !== 'WITH_DEBT') {
      setClosureDebtAmount(String(Math.max(0, expected - received)))
      if (closureMode !== 'WITH_DEBT') setClosureDebtManuallyEdited(false)
    }
  }

  function changeClosureDebtEnabled(enabled: boolean) {
    if (!detail) return
    if (!enabled) {
      setClosureMode('NORMAL')
      setClosureDebtAmount('0')
      setClosureDebtManuallyEdited(false)
      setClosureDebtComment('')
      return
    }

    const expected = completedWorkTotal(detail.workItems)
    const received = Number(closureReceivedAmount)
    if (!Number.isFinite(received) || received >= expected) return
    setClosureMode('WITH_DEBT')
    setClosureDebtAmount(String(expected - received))
    setClosureDebtManuallyEdited(false)
    setClosureDebtComment('')
    setError('')
  }

  async function submitClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || !closureMode) return
    const receivedAmount = Number(closureReceivedAmount)
    const debtAmount = closureMode === 'WITH_DEBT' ? Number(closureDebtAmount) : 0
    const expected = completedWorkTotal(detail.workItems)
    if (!Number.isFinite(receivedAmount) || receivedAmount < 0) {
      setError('Укажите полученную сумму: ноль или больше.')
      return
    }
    if (closureMode === 'WITH_DEBT' && receivedAmount >= expected) {
      setError('Полученная сумма должна быть меньше ожидаемой, чтобы закрыть заказ с долгом.')
      return
    }
    if (closureMode === 'WITH_DEBT' && (!Number.isFinite(debtAmount) || debtAmount <= 0)) {
      setError('Для закрытия с долгом укажите сумму больше нуля.')
      return
    }
    let savedClosureDate = closureDate
    if (savedClosureDate < detail.orderDate) {
      const accepted = window.confirm('Дата закрытия раньше старта заказа. Закрыть заказ датой старта заказа?')
      if (!accepted) return
      savedClosureDate = detail.orderDate
      setClosureDate(savedClosureDate)
    }

    if (!await persistOrderEdits()) return

    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.closeOrder(detail.id, {
          closureDate: savedClosureDate,
          mode: closureMode,
          receivedAmount,
          debtAmount: closureMode === 'WITH_DEBT' ? debtAmount : 0,
          debtComment: closureMode === 'WITH_DEBT' ? closureDebtComment : null,
      })
      setDetail(null)
      setClosureMode(null)
      await onDataChanged()
      setMessage('Заказ закрыт и перенесён в архив.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось закрыть заказ.')
    } finally {
      setBusy(false)
    }
  }

  function openDebtRepayment(mode: DebtRepaymentMode) {
    if (!detail) return
    setDebtRepaymentMode(mode)
    setDebtRepaymentAmount(mode === 'FULL' ? String(detail.financialSummary.debt) : '')
    setError('')
    setMessage('')
  }

  async function submitDebtRepayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || !debtRepaymentMode) return
    const amount = Number(debtRepaymentAmount)
    const outstanding = detail.financialSummary.debt
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
      setError(`Укажите сумму больше нуля и не больше остатка долга (${money(outstanding)}).`)
      return
    }
    if (debtRepaymentMode === 'FULL' && Math.abs(amount - outstanding) > 0.000001) {
      setError('Для полного погашения укажите всю сумму остатка долга или выберите частичное погашение.')
      return
    }
    if (debtRepaymentMode === 'PARTIAL' && amount >= outstanding) {
      setError('Для частичного погашения сумма должна быть меньше остатка долга.')
      return
    }
    if (!await persistOrderEdits()) return

    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.recordDebtPayment(detail.id, amount)
      await loadDetail(detail.id)
      setDebtRepaymentMode(null)
      setDebtRepaymentAmount('')
      await onDataChanged()
      setMessage('Погашение долга сохранено и учтено в доходе заказа.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить погашение долга.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDebtForgiveness() {
    if (!detail) return
    if (!await persistOrderEdits()) return

    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.forgiveOrderDebt(detail.id)
      setDebtForgivenessConfirmationOpen(false)
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Остаток долга списан. Внесённые платежи сохранены в доходе заказа.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось списать остаток долга.')
    } finally {
      setBusy(false)
    }
  }

  function removeWorkItem(item: WorkItemRecord) {
    setWorkDeleteTarget({ kind: 'saved', itemId: item.id })
  }

  async function confirmWorkDeletion() {
    if (!detail || !workDeleteTarget) return
    if (workDeleteTarget.kind === 'new') {
      resetNewWorkDraft()
      setAddWorkOpen(false)
      setWorkDeleteTarget(null)
      setError('')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.deleteWorkItem(detail.id, workDeleteTarget.itemId)
      await loadDetail(detail.id)
      await onDataChanged()
      setMessage('Работа удалена.')
      setWorkDeleteTarget(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить работу.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteOrder() {
    if (!detail) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await applicationPort.deleteOrder(detail.id)
      setDeleteConfirmationOpen(false)
      await onDataChanged()
      if (onReturnFromDetail) {
        onReturnFromDetail()
      } else if (onOrderSaved) {
        await onOrderSaved()
      } else {
        onBack()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить заказ.')
    } finally {
      setBusy(false)
    }
  }

  const expectedTotal = detail ? completedWorkTotal(detail.workItems) : 0
  const closureReceivedNumber = closureReceivedAmount.trim() === '' ? null : Number(closureReceivedAmount)
  const canSelectClosureDebt = closureReceivedNumber !== null
    && Number.isFinite(closureReceivedNumber)
    && closureReceivedNumber < expectedTotal
  const incomeTotal = detail?.status === 'ACTIVE'
    ? nonCancelledWorkTotal(detail.workItems)
    : detail?.status === 'CANCELLED' ? 0 : detail?.financialSummary.income ?? 0
  const expensesTotal = detail?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0
  const debtTotal = detail?.financialSummary.debt ?? 0

  return (
    <OrderCardFrame
      backLabel={detail ? (detailReturnLabel ?? 'К списку заказов') : 'Календарь'}
      className="current-work-panel"
      eyebrow={detail ? 'Редактирование заказа' : 'Заказы'}
      onBack={detail ? (onReturnFromDetail ?? (() => setDetail(null))) : onBack}
      orderId={detail?.id}
      status={detail?.status}
      title={detail ? (detail.patientLabel || 'Заказ') : 'Активные заказы'}
    >
      <datalist id="current-work-color-options">
        {colors.filter((color) => color.active).map((color) => <option key={color.id} value={color.name} />)}
      </datalist>

      {loading && <p className="form-muted" role="status">Загружаю заказ…</p>}

      {!detail && !loading && (
        orders.length > 0 ? (
          <ul aria-label="Активные заказы" className="active-order-list">
            {orders.map((order) => (
              <li key={order.id}>
                <div>
                  <strong>{order.label}</strong>
                  <small>{displayDate(order.deadlineAt)}</small>
                </div>
                <button className="secondary-action" onClick={() => void loadDetail(order.id)} type="button">Открыть</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="calendar-empty-state" role="status">
            <span className="empty-state-icon" aria-hidden="true">◷</span>
            <p>Активных заказов пока нет.</p>
            <button className="primary-action" onClick={onCreateOrder} type="button">Создать первый заказ</button>
          </div>
        )
      )}

      {detail && (
        <>
          <form className="data-form" id="order-basics-form" noValidate onSubmit={(event) => void saveOrder(event)}>
            <OrderBasicsFields
              doctors={doctors}
              requiredFields={requiredFields}
              patientLabel={detail.patientLabel ?? ''}
              doctorId={detail.doctorId}
              orderDate={detail.orderDate}
              deadline={dateInputValue(detail.deadlineAt)}
              closureDate={businessDateInputValue(detail.closureDate)}
              generalComment={detail.generalComment}
              onPatientLabelChange={(patientLabel) => setDetail({ ...detail, patientLabel })}
              onDoctorChange={(doctorId) => setDetail({ ...detail, doctorId })}
              onOrderDateChange={(orderDate) => setDetail({ ...detail, orderDate })}
              onDeadlineChange={(deadline) => setDetail({ ...detail, deadlineAt: deadline ? dateTimeValue(deadline) : null })}
              onClosureDateChange={detail.status === 'ACTIVE' ? undefined : (closureDate) => setDetail({ ...detail, closureDate })}
              onGeneralCommentChange={(generalComment) => setDetail({ ...detail, generalComment })}
            />
          </form>

          <section className="work-item-editor" aria-label="Работы в заказе">
            <div className="form-section-heading">
              <h2>Работы ({detail.workItems.length})</h2>
              <p className="work-item-status-summary">
                Открыто: {detail.workItems.filter((item) => item.status === 'ACTIVE').length}
                {' · '}Закрыто: {detail.workItems.filter((item) => item.status === 'COMPLETED').length}
                {' · '}Отменено: {detail.workItems.filter((item) => item.status === 'CANCELLED').length}
              </p>
            </div>
            {detail.workItems.map((savedItem, index) => {
              const isExpanded = expandedWorkItemId === savedItem.id && expandedWorkItemDraft?.id === savedItem.id
              if (!isExpanded) {
                return (
                  <button
                    aria-expanded={false}
                    className={`work-item-summary-card work-item-summary-card--${savedItem.status.toLowerCase()}`}
                    disabled={busy || expandedWorkItemId !== null || addWorkOpen}
                    key={savedItem.id}
                    onClick={() => expandWorkItem(savedItem)}
                    type="button"
                  >
                    <strong>{savedItem.workType || 'Работа без названия'}</strong>
                    <span>{money(savedItem.acceptedAmount ?? 0)}</span>
                  </button>
                )
              }
              const item = expandedWorkItemDraft!
              const selectedPricing = pricingItems.find((pricing) => pricing.id === item.pricingItemId)
              const showNumbering = selectedPricing
                ? pricingEditorFieldIsVisible(selectedPricing, 'numbering')
                : item.pricingItemId !== null
              const showColor = selectedPricing
                ? pricingEditorFieldIsVisible(selectedPricing, 'color')
                : item.pricingItemId !== null
              const showQuantity = !showNumbering && selectedPricing?.calculationMode === 'PER_UNIT'
              return (
              <fieldset className="work-item-fields" key={item.id}>
                <legend>Работа {index + 1}: {item.workType}</legend>
                <div className="work-item-lifecycle">
                  <strong className={`work-item-lifecycle__status work-item-lifecycle__status--${item.status.toLowerCase()}`}>
                    Статус: {item.status === 'ACTIVE' ? 'В работе' : item.status === 'COMPLETED' ? 'Выполнена' : 'Отменена'}
                  </strong>
                  {detail.status === 'ACTIVE' && item.startedAt && <span>Начата: {displayDate(item.startedAt)}</span>}
                  {detail.status === 'ACTIVE' && item.completedAt && <span>Завершена: {displayDate(item.completedAt)}</span>}
                  {detail.status === 'ACTIVE' && item.cancelledAt && <span>Отменена: {displayDate(item.cancelledAt)}</span>}
                </div>
                {detail.status === 'ACTIVE' && (
                  <div className={`form-actions work-item-status-actions work-item-status-actions--${item.status.toLowerCase()}`}>
                    {workItemStatusTransitions(item.status).map((status) => (
                      <button
                        className={`work-item-status-action work-item-status-action--${status.toLowerCase()}`}
                        disabled={busy}
                        key={status}
                        onClick={() => void changeWorkItemStatus(item, status)}
                        type="button"
                      >{workItemStatusActionLabel(status)}</button>
                    ))}
                  </div>
                )}
                {detail.status !== 'ACTIVE' && (
                  <>
                    <label>Статус работы
                      <select onChange={(event) => {
                        const status = event.target.value as WorkItemRecord['status']
                        const today = new Date()
                        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                        updateWorkItem(item.id, {
                          status,
                          completedAt: status === 'COMPLETED' ? item.completedAt ?? dateTimeValue(todayKey) : null,
                          cancelledAt: status === 'CANCELLED' ? item.cancelledAt ?? dateTimeValue(todayKey) : null,
                        })
                      }} value={item.status}>
                        <option value="ACTIVE">В работе</option>
                        <option value="COMPLETED">Выполнена</option>
                        <option value="CANCELLED">Отменена</option>
                      </select>
                    </label>
                    <label>Дата начала работы
                      <input onChange={(event) => updateWorkItem(item.id, { startedAt: dateTimeValue(event.target.value) })} type="date" value={dateInputValue(item.startedAt)} />
                    </label>
                    {item.status === 'COMPLETED' && (
                      <label>Дата выполнения
                        <input onChange={(event) => updateWorkItem(item.id, { completedAt: dateTimeValue(event.target.value) })} type="date" value={dateInputValue(item.completedAt)} />
                      </label>
                    )}
                    {item.status === 'CANCELLED' && (
                      <label>Дата отмены работы
                        <input onChange={(event) => updateWorkItem(item.id, { cancelledAt: dateTimeValue(event.target.value) })} type="date" value={dateInputValue(item.cancelledAt)} />
                      </label>
                    )}
                  </>
                )}
                {isUniqueWorkItem(item) ? (
                  <>
                    <label>Название работы
                      <input onChange={(event) => updateWorkItem(item.id, { workType: event.target.value })} value={item.workType} />
                    </label>
                    <label>Стоимость работы
                      <input min="0" onChange={(event) => updateWorkItem(item.id, { acceptedAmount: event.target.value === '' ? null : Number(event.target.value) })} step="0.01" type="number" value={item.acceptedAmount ?? ''} />
                    </label>
                    <p className="form-muted">Уникальная работа — сумма вводится вручную.</p>
                  </>
                ) : (
                  <>
                    {item.pricingItemId !== null && pricingItems.length > 0 && (
                      <label>Наименование работы
                        <select onChange={(event) => chooseWorkItemPricing(item, event.target.value)} value={item.pricingItemId}>
                          {pricingItems.filter((pricing) => (pricing.itemType ?? 'WORK') === 'WORK' && (pricing.active || pricing.id === item.pricingItemId)).map((pricing) => (
                            <option key={pricing.id} value={pricing.id}>{pricing.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {showNumbering && (
                      <>
                        <label>Нумерация
                          <select onChange={(event) => changeWorkItemUnitMode(item, event.target.value as UnitMode)} value={item.unitMode}>
                            <option value="TOOTH_COUNT">FDI</option>
                            <option value="OTHER">По номерам</option>
                            <option value="FIXED">Фиксированная услуга</option>
                          </select>
                        </label>
                        {item.unitMode === 'TOOTH_COUNT' ? (
                          <>
                            <Odontogram onChange={(toothCodes) => updateWorkItemTeeth(item.id, toothCodes)} selectedCodes={item.toothCodes} />
                            {(() => {
                              const parsed = parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', '))
                              return <p className="form-inline-note">{parsed.error ? 'Выбрано 0 (—).' : `Выбрано ${parsed.codes.length} (${parsed.codes.join(', ')}).`}</p>
                            })()}
                          </>
                        ) : item.unitMode === 'OTHER' ? (
                          <>
                            <label>Номера по FDI
                              <input
                                aria-invalid={Boolean(parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', ')).error)}
                                onChange={(event) => updateWorkItemManualTeeth(item, event.target.value)}
                                placeholder="Например: 11, 12, 28"
                                type="text"
                                value={item.toothCodesText ?? item.toothCodes.join(', ')}
                              />
                            </label>
                            {parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', ')).error && (
                              <p className="form-inline-note" role="status">{parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', ')).error}</p>
                            )}
                            {(() => {
                              const parsed = parseFdiToothList(item.toothCodesText ?? item.toothCodes.join(', '))
                              return <p className="form-inline-note">{parsed.error ? 'Выбрано 0 (—).' : `Выбрано ${parsed.codes.length} (${parsed.codes.join(', ')}).`}</p>
                            })()}
                          </>
                        ) : (
                          <p className="form-muted">Для фиксированной услуги количество зубов не задаётся.</p>
                        )}
                      </>
                    )}
                    {showQuantity && (
                      <label>Количество
                        <input
                          min="1"
                          onChange={(event) => {
                            const units = event.target.value === '' ? 0 : Number(event.target.value)
                            updateWorkItem(item.id, {
                              unitMode: 'FIXED',
                              toothCodes: [],
                              toothCodesText: '',
                              toothSelectionEdited: false,
                              units,
                              acceptedAmount: amountAfterEstimateChange(item, item.pricingItemId, units),
                            })
                          }}
                          step="1"
                          type="number"
                          value={item.units || ''}
                        />
                      </label>
                    )}
                    {showColor && <label>Цвет
                      <input list="current-work-color-options" onChange={(event) => updateWorkItem(item.id, { shade: event.target.value || null })} value={item.shade ?? ''} />
                    </label>}
                    <label>Стоимость работы{amountWasChanged(item.acceptedAmount, calculatedAmount(item.pricingItemId, item.units)) ? ' (Изменено)' : ''}
                      <input min="0" onChange={(event) => updateWorkItem(item.id, { acceptedAmount: event.target.value === '' ? null : Number(event.target.value) })} step="0.01" type="number" value={item.acceptedAmount ?? ''} />
                    </label>
                    <p className="calculated-amount">Расчётная стоимость: {calculatedAmount(item.pricingItemId, item.units) === null ? 'не задана' : money(calculatedAmount(item.pricingItemId, item.units)!)}</p>
                    <label>Комментарий
                      <textarea onChange={(event) => updateWorkItem(item.id, { comment: event.target.value || null })} rows={2} value={item.comment ?? ''} />
                    </label>
                  </>
                )}
                <div className="form-actions work-item-form-actions">
                  <button className="destructive-action" disabled={busy} onClick={() => void removeWorkItem(item)} type="button">Удалить</button>
                  <button className="secondary-action" disabled={busy} onClick={cancelWorkEditor} type="button">Отмена</button>
                  <button className="primary-action" disabled={busy} onClick={() => void saveWorkItem(item)} type="button">Сохранить</button>
                </div>
              </fieldset>
              )
            })}
          </section>

          {expandedWorkItemId === null && !addWorkOpen && (
            <button
              aria-controls="add-work-form"
              aria-expanded={false}
              className="secondary-action add-work-trigger"
              disabled={busy}
              onClick={() => {
                resetNewWorkDraft()
                setError('')
                setAddWorkOpen(true)
              }}
              type="button"
            >Добавить работу</button>
          )}
          {addWorkOpen && (
            <fieldset className="work-item-fields" id="add-work-form">
              <legend>Новая работа</legend>
              {uniqueWorkDraft?.itemId === null ? (
                <form className="data-form compact-form" id="new-work-item-form" onSubmit={(event) => void addWorkItem(event)}>
                  <label>Название работы
                    <input onChange={(event) => setUniqueWorkDraft((current) => current ? { ...current, workType: event.target.value } : current)} required value={uniqueWorkDraft.workType} />
                  </label>
                  <label>Стоимость работы
                    <input min="0" onChange={(event) => setUniqueWorkDraft((current) => current ? { ...current, acceptedAmount: event.target.value } : current)} required step="0.01" type="number" value={uniqueWorkDraft.acceptedAmount} />
                  </label>
                  <p className="form-muted">Уникальная работа не использует прайс и нумерацию зубов.</p>
                </form>
              ) : activePricingItems.length > 0 ? (
                <form className="data-form compact-form" id="new-work-item-form" onSubmit={(event) => void addWorkItem(event)}>
                  <label>Наименование работы
                    <select onChange={(event) => chooseNewPricing(event.target.value)} required value={newPricingItemId}>
                      <option value="">Выберите наименование работы</option>
                      {activePricingItems.map((pricing) => (
                        <option key={pricing.id} value={pricing.id}>{pricing.name}</option>
                      ))}
                    </select>
                  </label>
                  {showNewNumbering && (
                    <>
                      <label>Нумерация
                        <select onChange={(event) => changeNewUnitMode(event.target.value as UnitMode)} value={newUnitMode}>
                          <option value="TOOTH_COUNT">FDI</option>
                          <option value="OTHER">По номерам</option>
                          <option value="FIXED">Фиксированная услуга</option>
                        </select>
                      </label>
                      {newUnitMode === 'TOOTH_COUNT' ? (
                        <>
                          <Odontogram onChange={(toothCodes) => {
                            setNewToothCodes(toothCodes)
                            setNewToothCodesText(toothCodes.join(', '))
                            setNewUnits(toothCodes.length)
                            setNewAcceptedAmount(calculatedAmount(newPricingItemId || null, toothCodes.length))
                          }} selectedCodes={newToothCodes} />
                          {(() => {
                            const parsed = parseFdiToothList(newToothCodesText)
                            return <p className="form-inline-note">{parsed.error ? 'Выбрано 0 (—).' : `Выбрано ${parsed.codes.length} (${parsed.codes.join(', ')}).`}</p>
                          })()}
                        </>
                      ) : newUnitMode === 'OTHER' ? (
                        <>
                          <label>Номера по FDI
                            <input aria-invalid={Boolean(parseFdiToothList(newToothCodesText).error)} onChange={(event) => updateNewManualToothList(event.target.value)} placeholder="Например: 11, 12, 28" type="text" value={newToothCodesText} />
                          </label>
                          {parseFdiToothList(newToothCodesText).error && <p className="form-inline-note" role="status">{parseFdiToothList(newToothCodesText).error}</p>}
                          {(() => {
                            const parsed = parseFdiToothList(newToothCodesText)
                            return <p className="form-inline-note">{parsed.error ? 'Выбрано 0 (—).' : `Выбрано ${parsed.codes.length} (${parsed.codes.join(', ')}).`}</p>
                          })()}
                        </>
                      ) : (
                        <p className="form-muted">Для фиксированной услуги количество зубов не задаётся.</p>
                      )}
                    </>
                  )}
                  {showNewQuantity && (
                    <label>Количество
                      <input
                        min="1"
                        onChange={(event) => {
                          const units = event.target.value === '' ? 0 : Number(event.target.value)
                          setNewUnitMode('FIXED')
                          setNewToothCodes([])
                          setNewToothCodesText('')
                          setNewUnits(units)
                          setNewAcceptedAmount(calculatedAmount(newPricingItemId || null, units))
                        }}
                        step="1"
                        type="number"
                        value={newUnits || ''}
                      />
                    </label>
                  )}
                  {showNewColor && <label>Цвет
                    <input list="current-work-color-options" onChange={(event) => setNewShade(event.target.value)} value={newShade} />
                  </label>}
                  <label>Стоимость работы{amountWasChanged(newAcceptedAmount, calculatedAmount(newPricingItemId || null, newUnits)) ? ' (Изменено)' : ''}
                    <input min="0" onChange={(event) => setNewAcceptedAmount(event.target.value === '' ? null : Number(event.target.value))} step="0.01" type="number" value={newAcceptedAmount ?? ''} />
                  </label>
                  <p className="calculated-amount">Расчётная стоимость: {calculatedAmount(newPricingItemId || null, newUnits) === null
                    ? 'не задана'
                    : money(calculatedAmount(newPricingItemId || null, newUnits)!)}
                  </p>
                  <label>Комментарий<textarea onChange={(event) => setNewComment(event.target.value)} rows={2} value={newComment} /></label>
                </form>
              ) : (
                <p className="form-muted">Нет активных позиций прайса. Добавьте позицию в прайс или создайте уникальную работу.</p>
              )}
              <button className="text-button" disabled={busy} onClick={() => uniqueWorkDraft?.itemId === null ? resetNewWorkDraft() : openUniqueWorkForm()} type="button">
                {uniqueWorkDraft?.itemId === null ? 'Выбрать работу из прайса' : 'Уникальная работа'}
              </button>
              <div className="form-actions work-item-form-actions">
                <button className="destructive-action" disabled={busy} onClick={() => setWorkDeleteTarget({ kind: 'new' })} type="button">Удалить</button>
                <button className="secondary-action" disabled={busy} onClick={cancelWorkEditor} type="button">Отмена</button>
                <button className="primary-action" disabled={busy || (uniqueWorkDraft === null && !newPricingItemId)} form="new-work-item-form" type="submit">Сохранить</button>
              </div>
            </fieldset>
          )}

          <section className="expense-ledger" aria-label="Расходы заказа">
            <div className="form-section-heading">
              <h2>Расходы ({detail.expenses.length})</h2>
            </div>
            {detail.expenses.map((expense) => expandedExpenseId === expense.id ? (
              <ExpenseEditor
                busy={busy}
                initialValue={{
                  pricingItemId: expense.pricingItemId,
                  name: expense.name,
                  unitPrice: expense.unitPrice,
                  quantity: expense.quantity,
                  comment: expense.comment,
                }}
                items={pricingItems}
                key={expense.id}
                onCancel={() => setExpandedExpenseId(null)}
                onDelete={() => void deleteExpense(expense)}
                onSave={(value) => void saveExpense(expense, value)}
              />
            ) : (
              <button className="expense-summary-card" key={expense.id} onClick={() => setExpandedExpenseId(expense.id)} type="button">
                <strong>{expense.name}</strong>
                <span>{money(expense.amount)}</span>
              </button>
            ))}
            {expandedExpenseId === 'new' && (
              <ExpenseEditor items={pricingItems} busy={busy} onCancel={() => setExpandedExpenseId(null)} onSave={(value) => void addExpense(value)} />
            )}
            {expandedExpenseId === null && (
              <button className="secondary-action add-expense-trigger" disabled={busy} onClick={() => setExpandedExpenseId('new')} type="button">Добавить к расходам</button>
            )}
            {detail.expenses.length === 0 ? (
              <p className="form-muted">Расходов пока нет.</p>
            ) : (
              <aside className="expense-summary" aria-label="Краткая сводка расходов">
                <h3>Сводка расходов</h3>
                <ul>
                  {detail.expenses.map((expense) => (
                    <li key={expense.id}>
                      <span>
                        <strong>{expense.name}</strong>
                        <small>{money(expense.unitPrice)} × {money(expense.quantity)}{expense.comment ? ` · ${expense.comment}` : ''}</small>
                      </span>
                      <b>{money(expense.amount)}</b>
                    </li>
                  ))}
                </ul>
                <p className="expense-summary__total"><span>Итого</span><strong>{money(expensesTotal)}</strong></p>
              </aside>
            )}
          </section>

          <section className="financial-summary" aria-label="Сводка по заказу">
            <p className="financial-summary__income">{detail.status === 'ACTIVE' ? 'Расчетная сумма' : 'Доходы'}: {money(incomeTotal)}</p>
            {detail.status !== 'ACTIVE' && <p className="financial-summary__received">Получено при закрытии: {money(detail.financialSummary.receivedAmount)}</p>}
            {detail.status !== 'ACTIVE' && detail.financialSummary.debtRepaid > 0 && <p className="financial-summary__income">Погашено долга: {money(detail.financialSummary.debtRepaid)}</p>}
            <p className="financial-summary__expenses">Расходы: {money(expensesTotal)}</p>
            <p className="financial-summary__debt">Долг: {money(debtTotal)}</p>
            <p className="financial-summary__balance">Баланс (без учёта долга): {money(incomeTotal - expensesTotal)}</p>
          </section>

          {detail.status === 'CLOSED' && (detail.closureType === 'WITH_DEBT' || detail.financialSummary.debt > 0 || detail.debtPayments.length > 0) && (
            <section className="settings-card debt-repayment" aria-labelledby="debt-repayment-title">
              <h2 id="debt-repayment-title">Долг</h2>
              <dl className="finance-record__amounts">
                <div><dt>Погашено</dt><dd>{money(detail.financialSummary.debtRepaid)}</dd></div>
                <div><dt>Осталось</dt><dd>{money(detail.financialSummary.debt)}</dd></div>
              </dl>
              {detail.financialSummary.debt === 0 && <p className="debt-repayment__settled">Долг погашен</p>}
              {detail.debtPayments.length > 0 && (
                <ul className="debt-repayment__history" aria-label="История погашений долга">
                  {detail.debtPayments.map((payment) => (
                    <li key={payment.id}>
                      <span>Получено {displayDate(payment.receivedAt)}</span>
                      <strong>{money(payment.amount)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {detail.financialSummary.debt > 0 && !debtRepaymentMode && (
                <div className="debt-repayment__actions">
                  <button className="destructive-action debt-repayment__forgive" disabled={busy} onClick={() => setDebtForgivenessConfirmationOpen(true)} type="button">Простить</button>
                  <button className="secondary-action debt-repayment__partial" disabled={busy} onClick={() => openDebtRepayment('PARTIAL')} type="button">Частями</button>
                  <button className="primary-action debt-repayment__paid" disabled={busy} onClick={() => openDebtRepayment('FULL')} type="button">Погашен</button>
                </div>
              )}
              {debtRepaymentMode && (
                <form className="data-form compact-form" onSubmit={(event) => void submitDebtRepayment(event)}>
                  <label>Получено при погашении долга
                    <input min="0.01" max={detail.financialSummary.debt} onChange={(event) => setDebtRepaymentAmount(event.target.value)} required step="0.01" type="number" value={debtRepaymentAmount} />
                  </label>
                  <div className="form-actions">
                    <button className="text-button" disabled={busy} onClick={() => setDebtRepaymentMode(null)} type="button">Отмена</button>
                    <button className="primary-action" disabled={busy} type="submit">Сохранить погашение</button>
                  </div>
                </form>
              )}
            </section>
          )}
          <div className="order-save-actions">
            <button className="primary-action" disabled={busy} form="order-basics-form" type="submit">Сохранить заказ</button>
            <button className="primary-action" disabled={busy} onClick={() => void saveOrderAndExit()} type="button">Сохранить и выйти</button>
          </div>

          {detail.status === 'ACTIVE' && <section className="settings-card order-closure" aria-labelledby="order-closure-title">
            <h2 id="order-closure-title">Завершение заказа</h2>
            {!closureMode ? (
              <div className="form-actions order-closure__actions">
                <button className="primary-action order-closure__normal-action" disabled={busy} onClick={() => openClosure('NORMAL')} type="button">Закрыть заказ</button>
              </div>
            ) : (
              <form className="data-form compact-form" onSubmit={(event) => void submitClosure(event)}>
                <p className="form-muted">Доход, расходы и итоговый баланс будут сохранены в архиве заказа. Долг не вычитается из баланса.</p>
                <p className="form-muted">Ожидается: {money(expectedTotal)}</p>
                <label>Дата закрытия
                  <input onChange={(event) => setClosureDate(event.target.value)} required type="date" value={closureDate} />
                </label>
                <label>Получено
                  <input min="0" onChange={(event) => changeClosureReceivedAmount(event.target.value)} required step="0.01" type="number" value={closureReceivedAmount} />
                </label>
                <label className={`order-closure__debt-choice${canSelectClosureDebt ? '' : ' order-closure__debt-choice--locked'}`}>
                  <input
                    checked={closureMode === 'WITH_DEBT'}
                    disabled={busy || !canSelectClosureDebt}
                    onChange={(event) => changeClosureDebtEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Оформить как заказ с долгом</span>
                </label>
                {canSelectClosureDebt && closureMode === 'NORMAL' && (
                  <p className="form-muted">Без флажка заказ закроется без долга; в доход попадёт только полученная сумма.</p>
                )}
                {closureMode === 'WITH_DEBT' && (
                  <>
                    <label>Задолженность
                      <input min="0.01" onChange={(event) => {
                        setClosureDebtAmount(event.target.value)
                        setClosureDebtManuallyEdited(true)
                      }} required step="0.01" type="number" value={closureDebtAmount} />
                    </label>
                    <label>Комментарий к долгу
                      <textarea onChange={(event) => setClosureDebtComment(event.target.value)} rows={2} value={closureDebtComment} />
                    </label>
                    {!canSelectClosureDebt && (
                      <p className="form-error" role="alert">Для закрытия с долгом полученная сумма должна быть меньше ожидаемой.</p>
                    )}
                  </>
                )}
                <div className="financial-summary" aria-label="Итог при закрытии">
                  <p className="financial-summary__income">Ожидается: {money(expectedTotal)}</p>
                  <p className="financial-summary__received">Получено: {money(Number(closureReceivedAmount) || 0)}</p>
                  <p className="financial-summary__debt">Задолженность: {money(closureMode === 'WITH_DEBT' ? (Number(closureDebtAmount) || 0) : 0)}</p>
                  <p className="financial-summary__expenses">Расходы: {money(expensesTotal)}</p>
                  <p className="financial-summary__balance">Баланс (без учёта долга): {money((Number(closureReceivedAmount) || 0) - expensesTotal)}</p>
                </div>
                <div className="form-actions">
                  <button className="text-button" disabled={busy} onClick={() => setClosureMode(null)} type="button">Вернуться к заказу</button>
                  <button className="primary-action" disabled={busy} type="submit">Подтвердить закрытие</button>
                </div>
              </form>
            )}
          </section>}

          <section className="order-delete-section" aria-label="Удаление заказа">
            <button className="destructive-action" disabled={busy} onClick={() => setDeleteConfirmationOpen(true)} type="button">
              Удалить заказ
            </button>
          </section>
        </>
      )}

      {deleteConfirmationOpen && detail && (
        <div
          className="order-delete-dialog-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDeleteConfirmationOpen(false)
          }}
        >
          <section
            aria-describedby="delete-order-description"
            aria-labelledby="delete-order-title"
            aria-modal="true"
            className="order-delete-dialog"
            role="alertdialog"
            tabIndex={-1}
          >
            <h2 id="delete-order-title">Вы уверены, что хотите удалить заказ?</h2>
            <p id="delete-order-description">Все данные заказа будут удалены.</p>
            <div className="form-actions">
              <button className="destructive-action" disabled={busy} onClick={() => void deleteOrder()} type="button">Да</button>
              <button autoFocus className="secondary-action" disabled={busy} onClick={() => setDeleteConfirmationOpen(false)} type="button">Нет</button>
            </div>
          </section>
        </div>
      )}

      {debtForgivenessConfirmationOpen && detail && (
        <div
          className="order-delete-dialog-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDebtForgivenessConfirmationOpen(false)
          }}
        >
          <section
            aria-describedby="forgive-debt-description"
            aria-labelledby="forgive-debt-title"
            aria-modal="true"
            className="order-delete-dialog"
            role="alertdialog"
            tabIndex={-1}
          >
            <h2 id="forgive-debt-title">Простить остаток долга?</h2>
            <p id="forgive-debt-description">Неоплаченный остаток будет удалён из истории долга. Уже внесённые частичные платежи сохранятся как доход. Это изменит статистику и может исказить расчёты.</p>
            <div className="form-actions">
              <button className="destructive-action" disabled={busy} onClick={() => void confirmDebtForgiveness()} type="button">Удалить</button>
              <button autoFocus className="secondary-action" disabled={busy} onClick={() => setDebtForgivenessConfirmationOpen(false)} type="button">Отмена</button>
            </div>
          </section>
        </div>
      )}

      {workDeleteTarget && detail && (
        <div
          className="order-delete-dialog-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setWorkDeleteTarget(null)
          }}
        >
          <section
            aria-describedby="delete-work-description"
            aria-labelledby="delete-work-title"
            aria-modal="true"
            className="order-delete-dialog"
            role="alertdialog"
            tabIndex={-1}
          >
            <h2 id="delete-work-title">Удалить текущую работу?</h2>
            <p id="delete-work-description">Данные этой работы будут удалены.</p>
            <div className="form-actions">
              <button className="destructive-action" disabled={busy} onClick={() => void confirmWorkDeletion()} type="button">Да</button>
              <button autoFocus className="secondary-action" disabled={busy} onClick={() => setWorkDeleteTarget(null)} type="button">Нет</button>
            </div>
          </section>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
    </OrderCardFrame>
  )
}
