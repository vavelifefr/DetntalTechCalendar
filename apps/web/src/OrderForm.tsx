import { useState, type FormEvent } from 'react'
import type { CalendarStartupNamedValue, CreateOrderCommand } from '@dental-tech/application'
import { Odontogram } from './Odontogram.tsx'
import { OrderBasicsFields, OrderCardFrame } from './OrderCard.tsx'
import { parseFdiToothList } from './fdi-tooth-list.ts'
import { initialUnitMode, pricingEditorFieldIsVisible } from './pricing-editor-fields.ts'
import { ExpenseEditor, type ExpenseEditorSaveValue } from './ExpenseEditor.tsx'

export interface DoctorOption {
  id: string
  firstName: string
  lastName: string
  active: boolean
}

export interface PricingOption {
  id: string
  itemType?: 'WORK' | 'EXPENSE'
  name: string
  calculationMode: 'PER_UNIT' | 'FIXED' | 'COMPOSITE'
  unitPrice: number | null
  fixedPrice: number | null
  active: boolean
  metadata: Record<string, unknown>
}

export interface RequiredFieldOption {
  fieldKey: string
  required: boolean
}

interface DraftWorkItem {
  pricingItemId: string
  workType: string
  unitMode: 'TOOTH_COUNT' | 'FIXED' | 'OTHER'
  units: number
  toothCodes: string[]
  toothCodesText: string
  isUnique: boolean
  shade: string
  acceptedAmount: number | null
  amountEdited: boolean
  comment: string
}

interface DraftExpense {
  id: string
  pricingItemId: string | null
  name: string
  unitPrice: number
  quantity: number
  amount: number
  comment: string | null
}

type UnitMode = DraftWorkItem['unitMode']

function emptyWorkItem(): DraftWorkItem {
  return { pricingItemId: '', workType: '', unitMode: 'TOOTH_COUNT', units: 0, toothCodes: [], toothCodesText: '', isUnique: false, shade: '', acceptedAmount: null, amountEdited: false, comment: '' }
}

function fieldIsRequired(requiredFields: RequiredFieldOption[], fieldKey: string): boolean {
  return requiredFields.find((field) => field.fieldKey === fieldKey)?.required ?? true
}

interface OrderFormProps {
  initialDeadline?: string | null
  doctors: DoctorOption[]
  colors: CalendarStartupNamedValue[]
  pricingItems: PricingOption[]
  requiredFields: RequiredFieldOption[]
  onCreateOrder: (command: CreateOrderCommand) => Promise<void>
  onCancel: () => void
  onSaved: () => void
}

function localDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function deadlineToIso(value: string): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 17, 0, 0).toISOString()
}

function calculatedPrice(pricing: PricingOption | undefined, units: number): number | null {
  if (!pricing) return null
  if (pricing.calculationMode === 'PER_UNIT') return (pricing.unitPrice ?? 0) * units
  return pricing.fixedPrice
}

function money(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

function amountWasChanged(acceptedAmount: number | null, calculatedAmount: number | null): boolean {
  return calculatedAmount !== null && (acceptedAmount === null || Math.abs(acceptedAmount - calculatedAmount) > 0.000001)
}

export function OrderForm({ initialDeadline, doctors, colors, pricingItems, requiredFields, onCreateOrder, onCancel, onSaved }: OrderFormProps) {
  const [patientLabel, setPatientLabel] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [orderDate, setOrderDate] = useState(() => localDateInputValue(new Date()))
  const [deadline, setDeadline] = useState(() => initialDeadline ?? '')
  const [generalComment, setGeneralComment] = useState('')
  const [items, setItems] = useState<DraftWorkItem[]>([])
  const [editingWorkIndex, setEditingWorkIndex] = useState<number | 'new' | null>(null)
  const [workDraft, setWorkDraft] = useState<DraftWorkItem | null>(null)
  const [deleteWorkConfirmationOpen, setDeleteWorkConfirmationOpen] = useState(false)
  const [expenses, setExpenses] = useState<DraftExpense[]>([])
  const [editingExpenseId, setEditingExpenseId] = useState<string | 'new' | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const activePricing = pricingItems.filter((item) => item.active && item.itemType !== 'EXPENSE')
  const incomeTotal = items.reduce((sum, item) => sum + (item.acceptedAmount ?? 0), 0)
  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  function updateDraft(patch: Partial<DraftWorkItem>) {
    setWorkDraft((current) => current ? { ...current, ...patch } : current)
  }

  function openNewWork() {
    setWorkDraft(emptyWorkItem())
    setEditingWorkIndex('new')
    setError('')
  }

  function openWork(index: number) {
    if (editingWorkIndex !== null) return
    setWorkDraft({ ...items[index], toothCodes: [...items[index].toothCodes] })
    setEditingWorkIndex(index)
    setError('')
  }

  function choosePricing(pricingId: string) {
    if (!workDraft) return
    const pricing = activePricing.find((item) => item.id === pricingId)
    const unitMode = pricing ? initialUnitMode(pricing) : workDraft.unitMode
    const toothCodes = unitMode === 'FIXED' ? [] : workDraft.toothCodes
    const units = unitMode === 'FIXED' ? 1 : toothCodes.length
    updateDraft({
      pricingItemId: pricingId,
      workType: pricing?.name ?? '',
      unitMode,
      units,
      toothCodes,
      toothCodesText: toothCodes.join(', '),
      isUnique: false,
      acceptedAmount: calculatedPrice(pricing, units),
      amountEdited: false,
    })
  }

  function chooseUnitMode(unitMode: UnitMode) {
    if (!workDraft) return
    const current = workDraft
    const toothCodes = unitMode === 'FIXED' ? [] : current.toothCodes
    updateDraft({
      unitMode,
      toothCodes,
      toothCodesText: toothCodes.join(', '),
      units: unitMode === 'FIXED' ? 1 : toothCodes.length,
      acceptedAmount: current.amountEdited ? current.acceptedAmount : calculatedPrice(
        activePricing.find((pricing) => pricing.id === current.pricingItemId),
        unitMode === 'FIXED' ? 1 : toothCodes.length,
      ),
    })
  }

  function updateManualToothList(value: string) {
    if (!workDraft) return
    const parsed = parseFdiToothList(value)
    const current = workDraft
    if (!parsed.error) {
      updateDraft({
        toothCodesText: value,
        toothCodes: parsed.codes,
        units: parsed.codes.length,
        acceptedAmount: current.amountEdited ? current.acceptedAmount : calculatedPrice(
          activePricing.find((pricing) => pricing.id === current.pricingItemId),
          parsed.codes.length,
        ),
      })
      return
    }
    updateDraft({ toothCodesText: value })
  }

  function switchToUniqueWork() {
    if (!workDraft) return
    updateDraft({
      pricingItemId: '',
      workType: '',
      unitMode: 'FIXED',
      units: 1,
      toothCodes: [],
      toothCodesText: '',
      isUnique: true,
      acceptedAmount: null,
      amountEdited: true,
      shade: '',
      comment: '',
    })
  }

  function switchToPricingWork() {
    updateDraft({ ...emptyWorkItem(), amountEdited: false })
  }

  function saveWorkDraft() {
    if (!workDraft || editingWorkIndex === null) return
    const issues: string[] = []
    if (workDraft.isUnique) {
      if (!workDraft.workType.trim()) issues.push('укажите название уникальной работы')
    } else if (!workDraft.pricingItemId || !workDraft.workType.trim()) {
      issues.push('выберите наименование работы из прайса')
    }
    if (workDraft.acceptedAmount === null || !Number.isFinite(workDraft.acceptedAmount) || workDraft.acceptedAmount < 0) {
      issues.push('укажите корректную стоимость работы')
    }
    if (!workDraft.isUnique && workDraft.unitMode === 'TOOTH_COUNT' && workDraft.toothCodes.length === 0) {
      issues.push('отметьте хотя бы один зуб FDI')
    }
    if (!workDraft.isUnique && workDraft.unitMode === 'OTHER') {
      const parsed = parseFdiToothList(workDraft.toothCodesText)
      if (parsed.error) issues.push(parsed.error)
    }
    if (!workDraft.isUnique) {
      const selectedPricing = pricingItems.find((pricing) => pricing.id === workDraft.pricingItemId)
      if (selectedPricing?.calculationMode === 'PER_UNIT' && !pricingEditorFieldIsVisible(selectedPricing, 'numbering')
        && (!Number.isInteger(workDraft.units) || workDraft.units < 1)) {
        issues.push('укажите целое количество единиц от 1')
      }
    }
    if (issues.length > 0) {
      setError(`Исправьте работу: ${issues.join('; ')}.`)
      return
    }

    if (editingWorkIndex === 'new') {
      setItems((current) => [...current, workDraft])
    } else {
      setItems((current) => current.map((item, index) => index === editingWorkIndex ? workDraft : item))
    }
    setEditingWorkIndex(null)
    setWorkDraft(null)
    setError('')
  }

  function deleteWorkDraft() {
    if (editingWorkIndex === null) return
    if (typeof editingWorkIndex === 'number') {
      setItems((current) => current.filter((_, index) => index !== editingWorkIndex))
    }
    setEditingWorkIndex(null)
    setWorkDraft(null)
    setDeleteWorkConfirmationOpen(false)
    setError('')
  }

  function cancelWorkEditor() {
    setEditingWorkIndex(null)
    setWorkDraft(null)
    setError('')
  }

  function renderWorkEditor(draft: DraftWorkItem, workNumber: number) {
    const selectedPricing = pricingItems.find((pricing) => pricing.id === draft.pricingItemId)
    const showNumbering = pricingEditorFieldIsVisible(selectedPricing, 'numbering')
    const showColor = pricingEditorFieldIsVisible(selectedPricing, 'color')
    const showQuantity = !showNumbering && selectedPricing?.calculationMode === 'PER_UNIT'
    const estimate = calculatedPrice(selectedPricing, draft.units)
    const parsedManualTeeth = parseFdiToothList(draft.toothCodesText)
    return (
      <fieldset className="work-item-fields" key="work-editor">
        <legend>Работа {workNumber}</legend>
        {draft.isUnique ? (
          <>
            <label>Название работы
              <input onChange={(event) => updateDraft({ workType: event.target.value })} value={draft.workType} />
            </label>
            <label>Стоимость работы
              <input min="0" onChange={(event) => updateDraft({ acceptedAmount: event.target.value === '' ? null : Number(event.target.value) })} step="0.01" type="number" value={draft.acceptedAmount ?? ''} />
            </label>
            <p className="form-muted">Уникальная работа не использует прайс и нумерацию зубов.</p>
            <button className="text-button" onClick={switchToPricingWork} type="button">Выбрать работу из прайса</button>
          </>
        ) : (
          <>
            <label>Наименование работы
              <select onChange={(event) => choosePricing(event.target.value)} required value={draft.pricingItemId}>
                <option value="">Выберите наименование работы</option>
                {activePricing.map((pricing) => <option key={pricing.id} value={pricing.id}>{pricing.name}</option>)}
              </select>
            </label>
            <button className="text-button" onClick={switchToUniqueWork} type="button">Уникальная работа</button>
            {showNumbering && (
              <>
                <label>Нумерация
                  <select onChange={(event) => chooseUnitMode(event.target.value as UnitMode)} value={draft.unitMode}>
                    <option value="TOOTH_COUNT">FDI</option>
                    <option value="OTHER">По номерам</option>
                    <option value="FIXED">Фиксированная услуга</option>
                  </select>
                </label>
                {draft.unitMode === 'TOOTH_COUNT' ? (
                  <>
                    <Odontogram onChange={(toothCodes) => updateDraft({
                      toothCodes,
                      toothCodesText: toothCodes.join(', '),
                      units: toothCodes.length,
                      acceptedAmount: draft.amountEdited ? draft.acceptedAmount : calculatedPrice(selectedPricing, toothCodes.length),
                    })} selectedCodes={draft.toothCodes} />
                    <p className="form-inline-note">{parsedManualTeeth.error ? 'Выбрано 0 (—).' : `Выбрано ${draft.toothCodes.length} (${draft.toothCodes.join(', ')}).`}</p>
                  </>
                ) : draft.unitMode === 'OTHER' ? (
                  <>
                    <label>Номера по FDI
                      <input aria-invalid={Boolean(parsedManualTeeth.error)} onChange={(event) => updateManualToothList(event.target.value)} placeholder="Например: 11, 12, 28" type="text" value={draft.toothCodesText} />
                    </label>
                    {parsedManualTeeth.error && <p className="form-inline-note" role="status">{parsedManualTeeth.error}</p>}
                    <p className="form-inline-note">{parsedManualTeeth.error ? 'Выбрано 0 (—).' : `Выбрано ${parsedManualTeeth.codes.length} (${parsedManualTeeth.codes.join(', ')}).`}</p>
                  </>
                ) : <p className="form-muted">Для фиксированной услуги количество зубов не задаётся.</p>}
              </>
            )}
            {showQuantity && (
              <label>Количество
                <input
                  min="1"
                  onChange={(event) => {
                    const units = event.target.value === '' ? 0 : Number(event.target.value)
                    updateDraft({
                      unitMode: 'FIXED',
                      units,
                      toothCodes: [],
                      toothCodesText: '',
                      acceptedAmount: draft.amountEdited ? draft.acceptedAmount : calculatedPrice(selectedPricing, units),
                    })
                  }}
                  step="1"
                  type="number"
                  value={draft.units || ''}
                />
              </label>
            )}
            {showColor && <label>Цвет
              <input list="new-order-color-options" onChange={(event) => updateDraft({ shade: event.target.value })} value={draft.shade} />
            </label>}
            <label>Стоимость работы{amountWasChanged(draft.acceptedAmount, estimate) ? ' (Изменено)' : ''}
              <input min="0" onChange={(event) => updateDraft({ acceptedAmount: event.target.value === '' ? null : Number(event.target.value), amountEdited: true })} step="0.01" type="number" value={draft.acceptedAmount ?? ''} />
            </label>
            <p className="calculated-amount">Расчётная стоимость: {estimate === null ? 'не задана' : money(estimate)}</p>
            <label>Комментарий
              <textarea onChange={(event) => updateDraft({ comment: event.target.value })} rows={2} value={draft.comment} />
            </label>
          </>
        )}
        <div className="form-actions work-item-form-actions">
          <button className="destructive-action" disabled={saving} onClick={() => setDeleteWorkConfirmationOpen(true)} type="button">Удалить</button>
          <button className="secondary-action" disabled={saving} onClick={cancelWorkEditor} type="button">Отмена</button>
          <button className="primary-action" disabled={saving} onClick={saveWorkDraft} type="button">Сохранить</button>
        </div>
      </fieldset>
    )
  }

  function saveExpenseDraft(value: ExpenseEditorSaveValue) {
    if (editingExpenseId === 'new') {
      setExpenses((current) => [...current, { id: crypto.randomUUID(), ...value }])
    } else if (editingExpenseId) {
      setExpenses((current) => current.map((expense) => expense.id === editingExpenseId ? { ...expense, ...value } : expense))
    }
    setEditingExpenseId(null)
    setError('')
  }

  function removeExpenseDraft(expenseId: string) {
    if (!window.confirm('Удалить этот расход?')) return
    setExpenses((current) => current.filter((expense) => expense.id !== expenseId))
    setEditingExpenseId(null)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const issues: string[] = []
    if (fieldIsRequired(requiredFields, 'patient_label') && !patientLabel.trim()) issues.push('укажите имя пациента')
    if (fieldIsRequired(requiredFields, 'doctor_id') && !doctorId) issues.push('выберите врача')
    if (!orderDate) issues.push('укажите старт заказа')
    if (fieldIsRequired(requiredFields, 'deadline_at') && !deadline) issues.push('укажите срок сдачи')
    if (editingWorkIndex !== null) issues.push('сохраните, удалите или отмените открытую работу')
    if (editingExpenseId !== null) issues.push('сохраните или отмените открытый расход')
    if (items.length === 0) issues.push('добавьте и сохраните хотя бы одну работу')
    items.forEach((item, index) => {
      const workNumber = index + 1
      if (item.isUnique) {
        if (!item.workType.trim()) issues.push(`в работе ${workNumber} укажите название уникальной работы`)
        if (item.acceptedAmount === null || !Number.isFinite(item.acceptedAmount) || item.acceptedAmount < 0) {
          issues.push(`в работе ${workNumber} укажите корректную стоимость уникальной работы`)
        }
        return
      }
      if (!item.pricingItemId || !item.workType.trim()) issues.push(`в работе ${workNumber} выберите наименование работы из прайса`)
      if (item.unitMode === 'TOOTH_COUNT' && item.toothCodes.length === 0) {
        issues.push(`в работе ${workNumber} отметьте хотя бы один зуб FDI`)
      } else if (item.unitMode === 'OTHER') {
        const parsed = parseFdiToothList(item.toothCodesText)
        if (parsed.error) issues.push(`в работе ${workNumber}: ${parsed.error}`)
      }
      const selectedPricing = pricingItems.find((pricing) => pricing.id === item.pricingItemId)
      if (selectedPricing?.calculationMode === 'PER_UNIT' && !pricingEditorFieldIsVisible(selectedPricing, 'numbering')
        && (!Number.isInteger(item.units) || item.units < 1)) {
        issues.push(`в работе ${workNumber} укажите целое количество единиц от 1`)
      }
    })
    expenses.forEach((expense, index) => {
      if (!expense.pricingItemId || !expense.name.trim()) issues.push(`выберите категорию расхода ${index + 1}`)
      if (!Number.isFinite(expense.unitPrice) || expense.unitPrice <= 0 || !Number.isFinite(expense.quantity) || expense.quantity <= 0 || !Number.isFinite(expense.amount) || expense.amount <= 0) {
        issues.push(`укажите корректные издержки и количество для расхода ${index + 1}`)
      }
    })
    if (issues.length > 0) {
      setError(`Исправьте поля: ${issues.join('; ')}.`)
      return
    }
    let acceptedDeadline = deadline
    if (deadline && deadline < orderDate) {
      const accepted = window.confirm('Срок сдачи раньше старта заказа. Оформить однодневный заказ со сроком сдачи в день старта?')
      if (!accepted) return
      acceptedDeadline = orderDate
      setDeadline(orderDate)
    }
    setSaving(true)
    try {
      await onCreateOrder({
        patientLabel,
        doctorId: doctorId || null,
        orderDate,
        deadlineAt: deadlineToIso(acceptedDeadline),
        generalComment: generalComment || null,
        expenses: expenses.map((expense) => ({
          pricingItemId: expense.pricingItemId,
          name: expense.name,
          unitPrice: expense.unitPrice,
          quantity: expense.quantity,
          amount: expense.amount,
          category: expense.name,
          comment: expense.comment,
        })),
        workItems: items.map((item) => ({
          pricingItemId: item.isUnique ? null : item.pricingItemId || null,
          workType: item.workType,
          unitMode: item.unitMode,
          units: item.units,
          toothCodes: item.toothCodes,
          acceptedAmount: item.acceptedAmount,
          shade: item.shade || null,
          comment: item.comment || null,
        })),
      })
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить заказ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <OrderCardFrame backLabel="Календарь" eyebrow="Новый заказ" onBack={onCancel} title="Новый заказ">
      <form className="data-form" noValidate onSubmit={submit}>
        <datalist id="new-order-color-options">
          {colors.filter((color) => color.active).map((color) => <option key={color.id} value={color.name} />)}
        </datalist>
        <OrderBasicsFields
          doctors={doctors}
          requiredFields={requiredFields}
          patientLabel={patientLabel}
          doctorId={doctorId || null}
          orderDate={orderDate}
          deadline={deadline}
          onPatientLabelChange={setPatientLabel}
          onDoctorChange={(value) => setDoctorId(value ?? '')}
          onOrderDateChange={setOrderDate}
          onDeadlineChange={setDeadline}
          generalComment={generalComment}
          onGeneralCommentChange={(value) => setGeneralComment(value ?? '')}
        />

        <section className="work-item-editor" aria-label="Работы в заказе">
          <div className="form-section-heading">
            <h2>Работы ({items.length})</h2>
            <p className="work-item-status-summary">Открыто: {items.length} · Закрыто: 0 · Отменено: 0</p>
          </div>
          {items.map((item, index) => editingWorkIndex === index && workDraft ? (
            renderWorkEditor(workDraft, index + 1)
          ) : (
            <button
              aria-expanded={false}
              className="work-item-summary-card"
              disabled={editingWorkIndex !== null}
              key={`work-${index}`}
              onClick={() => openWork(index)}
              type="button"
            >
              <strong>{item.workType || 'Работа без названия'}</strong>
              <span>{money(item.acceptedAmount ?? 0)}</span>
            </button>
          ))}
          {editingWorkIndex === 'new' && workDraft && renderWorkEditor(workDraft, items.length + 1)}
        </section>
        {editingWorkIndex === null && (
          <button className="secondary-action add-work-trigger" onClick={openNewWork} type="button">Добавить работу</button>
        )}

        <section className="expense-ledger" aria-label="Расходы заказа">
          <div className="form-section-heading">
            <h2>Расходы ({expenses.length})</h2>
          </div>
          {expenses.map((expense) => editingExpenseId === expense.id ? (
            <ExpenseEditor
              busy={saving}
              initialValue={expense}
              items={pricingItems}
              key={expense.id}
              onCancel={() => setEditingExpenseId(null)}
              onDelete={() => removeExpenseDraft(expense.id)}
              onSave={saveExpenseDraft}
            />
          ) : (
            <button
              aria-expanded={false}
              className="expense-summary-card"
              key={expense.id}
              onClick={() => setEditingExpenseId(expense.id)}
              type="button"
            >
              <strong>{expense.name}</strong>
              <span>{money(expense.amount)}</span>
            </button>
          ))}
          {editingExpenseId === 'new' && (
            <ExpenseEditor items={pricingItems} onCancel={() => setEditingExpenseId(null)} onSave={saveExpenseDraft} />
          )}
          {editingExpenseId === null && (
            <button className="secondary-action add-expense-trigger" onClick={() => setEditingExpenseId('new')} type="button">Добавить к расходам</button>
          )}
          {expenses.length === 0 ? (
            <p className="form-muted">Расходов пока нет.</p>
          ) : (
            <aside className="expense-summary" aria-label="Краткая сводка расходов">
              <h3>Сводка расходов</h3>
              <ul>
                {expenses.map((expense) => (
                  <li key={expense.id}>
                    <span><strong>{expense.name}</strong><small>{money(expense.unitPrice)} × {money(expense.quantity)}</small></span>
                    <b>{money(expense.amount)}</b>
                  </li>
                ))}
              </ul>
              <p className="expense-summary__total"><span>Итого</span><strong>{money(expensesTotal)}</strong></p>
            </aside>
          )}
        </section>

        <section className="financial-summary" aria-label="Сводка по заказу">
          <p className="financial-summary__income">Расчетная сумма: {money(incomeTotal)}</p>
          <p className="financial-summary__expenses">Расходы: {money(expensesTotal)}</p>
          <p className="financial-summary__debt">Долг: 0</p>
          <p className="financial-summary__balance">Баланс: {money(incomeTotal - expensesTotal)}</p>
        </section>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="secondary-action" onClick={onCancel} type="button">Отмена</button>
          <button className="primary-action" disabled={saving} type="submit">
            {saving ? 'Сохраняю…' : 'Сохранить заказ'}
          </button>
        </div>
      </form>
      {deleteWorkConfirmationOpen && (
        <div className="order-delete-dialog-backdrop" onKeyDown={(event) => {
          if (event.key === 'Escape') setDeleteWorkConfirmationOpen(false)
        }}>
          <section aria-labelledby="delete-work-title" aria-modal="true" className="order-delete-dialog" role="alertdialog">
            <h2 id="delete-work-title">Удалить текущую работу?</h2>
            <div className="form-actions">
              <button className="destructive-action" disabled={saving} onClick={deleteWorkDraft} type="button">Да</button>
              <button className="secondary-action" disabled={saving} onClick={() => setDeleteWorkConfirmationOpen(false)} type="button">Нет</button>
            </div>
          </section>
        </div>
      )}
    </OrderCardFrame>
  )
}
