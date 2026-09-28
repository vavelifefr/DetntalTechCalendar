import { useState } from 'react'
import type { PricingOption } from './OrderForm.tsx'

export interface ExpenseEditorInitialValue {
  pricingItemId: string | null
  name: string
  unitPrice: number
  quantity: number
  comment: string | null
}

export interface ExpenseEditorSaveValue {
  pricingItemId: string | null
  name: string
  unitPrice: number
  quantity: number
  amount: number
  comment: string | null
}

interface ExpenseEditorProps {
  items: PricingOption[]
  initialValue?: ExpenseEditorInitialValue
  busy?: boolean
  onSave: (value: ExpenseEditorSaveValue) => void
  onDelete?: () => void
  onCancel: () => void
}

function money(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

export function ExpenseEditor({ items, initialValue, busy = false, onSave, onDelete, onCancel }: ExpenseEditorProps) {
  const expenseItems = items.filter((item) => item.itemType === 'EXPENSE')
  const activeItems = expenseItems.filter((item) => item.active)
  const matchingInitial = initialValue
    ? expenseItems.find((item) => item.id === initialValue.pricingItemId)
      ?? expenseItems.find((item) => item.name === initialValue.name)
    : undefined
  const initialSelection = initialValue
    ? matchingInitial?.id ?? (initialValue.name ? '__snapshot__' : '')
    : activeItems[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initialSelection)
  const [name, setName] = useState(initialValue?.name ?? matchingInitial?.name ?? activeItems[0]?.name ?? '')
  const [unitPrice, setUnitPrice] = useState(initialValue
    ? String(initialValue.unitPrice)
    : activeItems[0]?.unitPrice === null || !activeItems[0] ? '' : String(activeItems[0].unitPrice))
  const [quantity, setQuantity] = useState(initialValue ? String(initialValue.quantity) : '1')
  const [comment, setComment] = useState(initialValue?.comment ?? '')
  const [error, setError] = useState('')
  const price = Number(unitPrice)
  const units = Number(quantity)
  const total = Number.isFinite(price) && Number.isFinite(units) ? price * units : null
  const selectedItem = expenseItems.find((item) => item.id === selectedId)

  function save() {
    if (!selectedId || !name.trim()) {
      setError('Выберите категорию расхода из прайса.')
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Укажите издержки больше нуля.')
      return
    }
    if (!Number.isFinite(units) || units <= 0) {
      setError('Укажите количество больше нуля.')
      return
    }
    const numericPrice = Math.round(price * 100) / 100
    const numericQuantity = Math.round(units * 100) / 100
    setError('')
    onSave({
      pricingItemId: selectedId === '__snapshot__' ? null : selectedId,
      name: name.trim(),
      unitPrice: numericPrice,
      quantity: numericQuantity,
      amount: Math.round(numericPrice * numericQuantity * 100) / 100,
      comment: comment.trim() || null,
    })
  }

  return (
    <fieldset className="expense-entry">
      <legend>{initialValue ? 'Редактирование расхода' : 'Новый расход'}</legend>
      <label>Категория
        <select
          onChange={(event) => {
            const id = event.target.value
            const item = expenseItems.find((candidate) => candidate.id === id)
            setSelectedId(id)
            if (item) {
              setName(item.name)
              setUnitPrice(item.unitPrice === null ? '' : String(item.unitPrice))
            } else if (id === '__snapshot__' && initialValue) {
              setName(initialValue.name)
              setUnitPrice(String(initialValue.unitPrice))
            }
          }}
          required
          value={selectedId}
        >
          <option value="">Выберите расход</option>
          {selectedId === '__snapshot__' && initialValue && <option value="__snapshot__">{initialValue.name} · сохранённое название</option>}
          {expenseItems.filter((item) => item.active || item.id === selectedId).map((item) => (
            <option key={item.id} value={item.id}>{item.name}{item.unitPrice === null ? ' · цена не задана' : ''}</option>
          ))}
        </select>
      </label>
      <label>Издержки
        <input min="0.01" onChange={(event) => setUnitPrice(event.target.value)} required step="0.01" type="number" value={unitPrice} />
      </label>
      {selectedItem?.unitPrice === null && <p className="form-muted">Для этой позиции цена не задана в прайсе; укажите сумму вручную.</p>}
      <label>Количество
        <input min="0.01" onChange={(event) => setQuantity(event.target.value)} required step="0.01" type="number" value={quantity} />
      </label>
      <label className="expense-entry__comment">Комментарий
        <textarea onChange={(event) => setComment(event.target.value)} rows={2} value={comment} />
      </label>
      {activeItems.length === 0 && !initialValue && <p className="form-muted">Нет активных расходных позиций. Добавьте их в прайс-листе.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="expense-entry__calculated" aria-live="polite">
        {total !== null && Number.isFinite(total) && total > 0
          ? `Итого: ${money(total)}`
          : 'Итого: укажите издержки и количество'}
      </p>
      <div className="form-actions">
        {onDelete && <button className="destructive-action" disabled={busy} onClick={onDelete} type="button">Удалить расход</button>}
        <button className="secondary-action" disabled={busy} onClick={onCancel} type="button">Отмена</button>
        <button className="primary-action" disabled={busy || !selectedItem && selectedId !== '__snapshot__'} onClick={save} type="button">Сохранить расход</button>
      </div>
    </fieldset>
  )
}
