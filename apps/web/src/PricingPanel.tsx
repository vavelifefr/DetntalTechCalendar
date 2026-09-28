import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ApplicationPort, SavePricingCommand } from '@dental-tech/application'
import type { PricingOption } from './OrderForm.tsx'
import { pricingEditorFields, PRICING_EDITOR_FIELDS } from './pricing-editor-fields.ts'

interface PricingPanelProps {
  applicationPort: ApplicationPort
  items: PricingOption[]
  onDataChanged: () => Promise<void>
}

type PricingItemType = 'WORK' | 'EXPENSE'

function formatPrice(item: PricingOption): string {
  if (item.itemType === 'EXPENSE') {
    return item.unitPrice === null ? 'Цена не задана' : `${money(item.unitPrice)} за единицу`
  }
  const amount = item.calculationMode === 'PER_UNIT' ? item.unitPrice : item.fixedPrice
  if (amount === null) return 'Цена не задана'
  return item.calculationMode === 'PER_UNIT' ? `${money(amount)} за единицу` : money(amount)
}

function money(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

function itemTypeOf(item: PricingOption): PricingItemType {
  return item.itemType === 'EXPENSE' ? 'EXPENSE' : 'WORK'
}

export function PricingPanel({ applicationPort, items, onDataChanged }: PricingPanelProps) {
  const [itemId, setItemId] = useState('')
  const [itemType, setItemType] = useState<PricingItemType>('WORK')
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'PER_UNIT' | 'FIXED'>('PER_UNIT')
  const [amount, setAmount] = useState('')
  const [active, setActive] = useState(true)
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})
  const [editorFields, setEditorFields] = useState<string[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editScrollRequest, setEditScrollRequest] = useState(0)
  const pricingFormRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!formOpen || !itemId || editScrollRequest === 0) return
    const frame = window.requestAnimationFrame(() => {
      pricingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editScrollRequest, formOpen, itemId])

  function resetForm(nextType = itemType) {
    setItemId('')
    setItemType(nextType)
    setName('')
    setMode('PER_UNIT')
    setAmount('')
    setActive(true)
    setMetadata({})
    setEditorFields([])
    setFormOpen(false)
  }

  function addItem(type: PricingItemType) {
    resetForm(type)
    setFormOpen(true)
    setError('')
    setMessage('')
  }

  function editItem(item: PricingOption) {
    setItemId(item.id)
    setItemType(itemTypeOf(item))
    setName(item.name)
    setMode(item.calculationMode === 'FIXED' ? 'FIXED' : 'PER_UNIT')
    setAmount(String(item.calculationMode === 'FIXED' ? item.fixedPrice ?? '' : item.unitPrice ?? ''))
    setActive(item.active)
    setMetadata(item.metadata ?? {})
    setEditorFields(pricingEditorFields(item))
    setFormOpen(true)
    setError('')
    setMessage('')
    setEditScrollRequest((request) => request + 1)
  }

  function toggleEditorField(field: string, checked: boolean) {
    setEditorFields((current) => checked
      ? current.includes(field) ? current : [...current, field]
      : current.filter((value) => value !== field))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const numericAmount = amount.trim() === '' ? null : Number(amount)
      const command: SavePricingCommand = {
        itemType,
        name,
        calculationMode: itemType === 'EXPENSE' ? 'PER_UNIT' : mode,
        unitPrice: itemType === 'EXPENSE' || mode === 'PER_UNIT' ? numericAmount : null,
        fixedPrice: itemType === 'WORK' && mode === 'FIXED' ? numericAmount : null,
        active,
        metadata: itemType === 'WORK' ? { ...metadata, orderEditorFields: editorFields } : {},
      }
      await applicationPort.savePricingItem(itemId || null, command)
      await onDataChanged()
      resetForm(itemType)
      setMessage(itemType === 'EXPENSE' ? 'Расходная позиция сохранена.' : 'Работа сохранена.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить позицию прайса.')
    } finally {
      setBusy(false)
    }
  }

  async function removeItem(item: PricingOption) {
    if (!window.confirm(`Удалить «${item.name}» из прайса? Уже сохранённые суммы в заказах останутся.`)) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await applicationPort.deletePricingItem(item.id)
      await onDataChanged()
      if (itemId === item.id) resetForm(itemType)
      setMessage('Позиция удалена. Сохранённые расходы и работы не изменены.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить позицию прайса.')
    } finally {
      setBusy(false)
    }
  }

  const typedItems = (type: PricingItemType) => items.filter((item) => itemTypeOf(item) === type)

  return (
    <main className="section-panel pricing-panel">
      <div>
        <p className="eyebrow">Работы и расходы</p>
        <h1>Прайс-лист</h1>
        <p className="form-muted">Сохранённые в заказах суммы не меняются при редактировании прайса.</p>
      </div>

      {formOpen && (
        <section className="settings-card edit-scroll-target" ref={pricingFormRef} aria-labelledby="pricing-form-title">
          <h2 id="pricing-form-title">{itemId ? 'Изменить' : 'Добавить'} {itemType === 'WORK' ? 'работу' : 'расход'}</h2>
          <form className="data-form compact-form" onSubmit={(event) => void save(event)}>
            <label>{itemType === 'WORK' ? 'Наименование работы' : 'Наименование расхода'}
              <input onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            {itemType === 'WORK' && (
              <label>
                Расчёт
                <select onChange={(event) => setMode(event.target.value as 'PER_UNIT' | 'FIXED')} value={mode}>
                  <option value="PER_UNIT">За единицу</option>
                  <option value="FIXED">Фиксированная цена</option>
                </select>
              </label>
            )}
            <label>
              {itemType === 'EXPENSE' ? 'Издержки за единицу' : mode === 'PER_UNIT' ? 'Цена за единицу' : 'Цена за услугу'}
              <input
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                required={itemType === 'WORK'}
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            {itemType === 'EXPENSE' && <p className="form-muted">Если цена пока неизвестна, её можно указать при добавлении расхода в заказ.</p>}
            <label className="setting-toggle">
              <span>Использовать в новых заказах</span>
              <input checked={active} onChange={(event) => setActive(event.target.checked)} type="checkbox" />
            </label>
            <p className="form-muted">Определяет, доступна ли позиция при добавлении в заказ.</p>
            {itemType === 'WORK' && (
              <fieldset className="pricing-editor-fields">
                <legend>Поля редактора заказа</legend>
                <p className="form-muted">Отмеченные поля показываются при выборе этой работы. У новой работы они выключены.</p>
                {PRICING_EDITOR_FIELDS.map((field) => (
                  <label className="setting-toggle" key={field.key}>
                    <span>{field.label}</span>
                    <input checked={editorFields.includes(field.key)} onChange={(event) => toggleEditorField(field.key, event.target.checked)} type="checkbox" />
                  </label>
                ))}
              </fieldset>
            )}
            <div className="form-actions">
              <button className="secondary-action" disabled={busy} onClick={() => resetForm(itemType)} type="button">Отмена</button>
              <button className="primary-action" disabled={busy} type="submit">{itemId ? 'Сохранить' : 'Добавить'}</button>
            </div>
          </form>
        </section>
      )}

      {(['WORK', 'EXPENSE'] as const).map((type) => (
        <section className="settings-card pricing-category" key={type} aria-labelledby={`pricing-${type.toLowerCase()}-title`}>
          <div className="form-section-heading">
            <h2 id={`pricing-${type.toLowerCase()}-title`}>{type === 'WORK' ? 'Работы' : 'Расходы'} ({typedItems(type).length})</h2>
            <button className="secondary-action" disabled={busy} onClick={() => addItem(type)} type="button">
              {type === 'WORK' ? 'Добавить работу' : 'Добавить расход'}
            </button>
          </div>
          {typedItems(type).length > 0 ? (
            <ul className="record-list">
              {typedItems(type).map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{formatPrice(item)}{item.active ? '' : ' · отключена'}</small>
                  </span>
                  <span className="record-actions">
                    <button aria-label={`Удалить ${item.name}`} className="text-button destructive-text-button" onClick={() => void removeItem(item)} type="button">×</button>
                    <button aria-label={`Изменить ${item.name}`} className="text-button" onClick={() => editItem(item)} type="button">Изм.</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="form-muted">Раздел пока пуст.</p>}
        </section>
      ))}

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
    </main>
  )
}
