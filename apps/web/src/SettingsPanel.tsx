import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ApplicationExportDataset, ApplicationPort, CalendarStartupNamedValue, SaveNamedValueCommand } from '@dental-tech/application'
import type { DoctorOption, RequiredFieldOption } from './OrderForm.tsx'
import type { OrderReminderController, OrderReminderSettings } from './android-order-notifications.ts'

interface DirectoryDoctor extends DoctorOption {
  phone: string
  comment: string
}

interface SettingsPanelProps {
  applicationPort: ApplicationPort
  doctors: DirectoryDoctor[]
  colors: CalendarStartupNamedValue[]
  requiredFields: RequiredFieldOption[]
  onDataChanged: () => Promise<void>
  orderReminderController?: OrderReminderController
  notificationSyncError?: string
}

interface NamedDirectorySectionProps {
  title: string
  entries: CalendarStartupNamedValue[]
  nameLabel: string
  onDataChanged: () => Promise<void>
  persistEntry: (entryId: string | null, command: SaveNamedValueCommand) => Promise<void>
  deleteEntry: (entryId: string) => Promise<void>
}

function NamedDirectorySection({ title, entries, nameLabel, onDataChanged, persistEntry, deleteEntry }: NamedDirectorySectionProps) {
  const [entryId, setEntryId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editScrollRequest, setEditScrollRequest] = useState(0)
  const sectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!entryId || editScrollRequest === 0) return
    const frame = window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editScrollRequest, entryId])

  function clearForm() {
    setEntryId('')
    setName('')
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await persistEntry(entryId || null, { name, active: true })
      await onDataChanged()
      clearForm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Не удалось сохранить: ${nameLabel.toLocaleLowerCase('ru')}.`)
    } finally {
      setBusy(false)
    }
  }

  async function removeEntry(entry: CalendarStartupNamedValue) {
    if (!window.confirm(`Удалить «${entry.name}» из справочника? В сохранённых заказах историческое значение останется.`)) return
    setBusy(true)
    setError('')
    try {
      await deleteEntry(entry.id)
      await onDataChanged()
      if (entryId === entry.id) clearForm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Не удалось удалить: ${nameLabel.toLocaleLowerCase('ru')}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-card edit-scroll-target" ref={sectionRef}>
      <h2>{title}</h2>
      <form className="data-form compact-form" onSubmit={(event) => void saveEntry(event)}>
        <label>{nameLabel}<input onChange={(event) => setName(event.target.value)} required value={name} /></label>
        <div className="form-actions">
          <button className="secondary-action" disabled={busy} onClick={clearForm} type="button">Очистить</button>
          <button className="primary-action" disabled={busy} type="submit">{entryId ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </form>
      <ul className="record-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span><strong>{entry.name}</strong></span>
            <span className="record-actions">
              <button aria-label={`Удалить ${entry.name}`} className="text-button destructive-text-button" disabled={busy} onClick={() => void removeEntry(entry)} type="button">×</button>
              <button className="text-button" onClick={() => {
                setEntryId(entry.id)
                setName(entry.name)
                setEditScrollRequest((request) => request + 1)
              }} type="button">Изм.</button>
            </span>
          </li>
        ))}
      </ul>
      {entries.length === 0 && <p className="form-muted">Справочник пока пуст.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

const requiredFieldLabels: Record<string, string> = {
  patient_label: 'Имя пациента',
  doctor_id: 'Врач',
  deadline_at: 'Срок сдачи',
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Не удалось прочитать содержимое выбранного файла.'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать выбранный файл.'))
    reader.onabort = () => reject(new Error('Чтение выбранного файла было прервано.'))
    reader.readAsText(file, 'UTF-8')
  })
}

export function SettingsPanel({ applicationPort, doctors, colors, requiredFields, onDataChanged, orderReminderController, notificationSyncError = '' }: SettingsPanelProps) {
  const [doctorId, setDoctorId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [exchangeMessage, setExchangeMessage] = useState('')
  const [exchangeError, setExchangeError] = useState('')
  const [doctorEditScrollRequest, setDoctorEditScrollRequest] = useState(0)
  const doctorSectionRef = useRef<HTMLElement | null>(null)
  const [reminderSettings, setReminderSettings] = useState<OrderReminderSettings>({ enabled: false, leadDays: 0, time: '11:00' })
  const [reminderSettingsLoaded, setReminderSettingsLoaded] = useState(!orderReminderController)

  useEffect(() => {
    if (!doctorId || doctorEditScrollRequest === 0) return
    const frame = window.requestAnimationFrame(() => {
      doctorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [doctorEditScrollRequest, doctorId])

  useEffect(() => {
    if (!orderReminderController) return
    let current = true
    void orderReminderController.loadSettings().then((settings) => {
      if (!current) return
      setReminderSettings(settings)
      setReminderSettingsLoaded(true)
    }).catch((caught: unknown) => {
      if (!current) return
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройки уведомлений.')
      setReminderSettingsLoaded(true)
    })
    return () => { current = false }
  }, [orderReminderController])

  async function download(dataset: ApplicationExportDataset) {
    setExchangeError('')
    setExchangeMessage('')
    try {
      const content = await applicationPort.exportDataset(dataset)
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${dataset}.json`
      link.click()
      URL.revokeObjectURL(url)
      setExchangeMessage('Файл JSON подготовлен к сохранению.')
    } catch (caught) {
      setExchangeError(caught instanceof Error ? caught.message : 'Не удалось экспортировать файл.')
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    setExchangeError('')
    setExchangeMessage('')
    try {
      const fileText = (await readFileText(file)).replace(/^\uFEFF/, '')
      const payload = JSON.parse(fileText) as { dataset?: string }
      const datasetLabel = payload.dataset === 'directory' || payload.dataset === 'doctor-directory'
        ? 'справочник'
        : payload.dataset === 'pricing'
          ? 'прайс-лист'
          : payload.dataset === 'full-database'
            ? 'всю локальную базу'
            : 'данные'
      const confirmation = payload.dataset === 'full-database'
        ? 'Импортировать всю локальную базу? Все текущие данные приложения будут заменены.'
        : `Импортировать ${datasetLabel}? Текущие записи этого раздела будут заменены.`
      if (!window.confirm(confirmation)) return
      setBusy(true)
      await applicationPort.importDataset(payload)
      await onDataChanged()
      setExchangeMessage(`Импорт завершен: ${file.name}`)
    } catch (caught) {
      setExchangeError(caught instanceof Error ? caught.message : 'Не удалось импортировать JSON-файл.')
    } finally {
      setBusy(false)
    }
  }

  async function saveRequiredField(fieldKey: string, value: boolean) {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const next = requiredFields.map((field) => field.fieldKey === fieldKey ? { ...field, required: value } : field)
      await applicationPort.setRequiredFields(next)
      await onDataChanged()
      setMessage('Обязательные поля сохранены.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить настройки.')
    } finally {
      setBusy(false)
    }
  }

  async function saveReminderSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orderReminderController) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (reminderSettings.enabled) {
        const permissions = await orderReminderController.requestPermissions()
        if (!permissions.notificationsGranted) {
          throw new Error('Android не разрешил уведомления. Включите их в настройках приложения и повторите.')
        }
        if (!permissions.exactAlarmsGranted) {
          throw new Error('Android не разрешил точные будильники. Включите их в настройках приложения и повторите.')
        }
      }
      await orderReminderController.saveSettings(reminderSettings)
      await onDataChanged()
      setMessage('Настройки уведомлений сохранены.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить настройки уведомлений.')
      try {
        setReminderSettings(await orderReminderController.loadSettings())
      } catch {
        // Keep the visible draft if persistent settings cannot be reloaded.
      }
    } finally {
      setBusy(false)
    }
  }

  function editDoctor(doctor: DirectoryDoctor) {
    setDoctorId(doctor.id)
    setFirstName(doctor.firstName)
    setLastName(doctor.lastName)
    setPhone(doctor.phone)
    setComment(doctor.comment)
    setDoctorEditScrollRequest((request) => request + 1)
  }

  function clearDoctorForm() {
    setDoctorId('')
    setFirstName('')
    setLastName('')
    setPhone('')
    setComment('')
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await applicationPort.saveDoctor(doctorId || null, { firstName, lastName, phone, comment, active: true })
      await onDataChanged()
      clearDoctorForm()
      setMessage('Запись врача сохранена.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить врача.')
    } finally {
      setBusy(false)
    }
  }

  async function removeDoctor(doctor: DirectoryDoctor) {
    if (!window.confirm(`Удалить врача ${doctor.lastName} ${doctor.firstName} из справочника?`)) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await applicationPort.deleteDoctor(doctor.id)
      await onDataChanged()
      if (doctorId === doctor.id) clearDoctorForm()
      setMessage('Врач удален из справочника. В заказах сохраняются исторические данные.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить врача.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="section-panel settings-panel">
      <div>
        <p className="eyebrow">Локальная база данных</p>
        <h1>Настройки</h1>
        <p className="form-muted">JSON-файлы копируются в единственную базу SQLite приложения.</p>
      </div>

      <section className="settings-card" aria-labelledby="required-fields-title">
        <h2 id="required-fields-title">Обязательные поля заказа</h2>
        {Object.entries(requiredFieldLabels).map(([fieldKey, label]) => {
          const field = requiredFields.find((item) => item.fieldKey === fieldKey)
          return (
            <label className="setting-toggle" key={fieldKey}>
              <span>{label}</span>
              <input
                checked={field?.required ?? true}
                disabled={busy}
                onChange={(event) => void saveRequiredField(fieldKey, event.target.checked)}
                type="checkbox"
              />
            </label>
          )
        })}
        <p className="form-inline-note">Новая база требует имя пациента, врача и срок сдачи. Старт заказа по умолчанию — сегодня; дату можно изменить.</p>
      </section>

      {orderReminderController && (
        <section className="settings-card" aria-labelledby="order-reminders-title">
          <h2 id="order-reminders-title">Уведомления Android</h2>
          <p className="form-inline-note">Напоминания об активных заказах повторяются ежедневно с выбранного срока до даты сдачи включительно. По умолчанию уведомления выключены.</p>
          <form className="data-form compact-form" onSubmit={(event) => void saveReminderSettings(event)}>
            <label className="setting-toggle">
              <span>Напоминать о сроках сдачи</span>
              <input
                checked={reminderSettings.enabled}
                disabled={busy || !reminderSettingsLoaded}
                onChange={(event) => setReminderSettings((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
            </label>
            <label>Начинать напоминания
              <select
                disabled={busy || !reminderSettingsLoaded}
                onChange={(event) => setReminderSettings((current) => ({ ...current, leadDays: Number(event.target.value) as OrderReminderSettings['leadDays'] }))}
                value={reminderSettings.leadDays}
              >
                <option value={0}>В день сдачи</option>
                <option value={1}>За 1 день</option>
                <option value={2}>За 2 дня</option>
                <option value={3}>За 3 дня</option>
              </select>
            </label>
            <label>Время уведомления
              <input
                disabled={busy || !reminderSettingsLoaded}
                onChange={(event) => setReminderSettings((current) => ({ ...current, time: event.target.value }))}
                required
                type="time"
                value={reminderSettings.time}
              />
            </label>
            <button className="primary-action" disabled={busy || !reminderSettingsLoaded} type="submit">Сохранить настройки уведомлений</button>
          </form>
          <p className="form-inline-note">В уведомлении показываются имя пациента, врач и дата сдачи. Разрешения Android запрашиваются только при включении напоминаний.</p>
          <p className="form-inline-note">Если телефон перезапустится, расписание восстановится при следующем открытии приложения.</p>
          {notificationSyncError && <p className="form-error" role="alert">{notificationSyncError}</p>}
        </section>
      )}

      <section className="settings-card" aria-labelledby="exchange-title">
        <h2 id="exchange-title">Импорт и экспорт</h2>
        <div className="button-stack">
          <button className="secondary-action" disabled={busy} onClick={() => void download('directory')} type="button">Экспортировать справочник</button>
          <button className="secondary-action" disabled={busy} onClick={() => void download('pricing')} type="button">Экспортировать прайс</button>
          <button className="secondary-action" disabled={busy} onClick={() => void download('full-database')} type="button">Экспортировать всю базу</button>
        </div>
        <label className="file-import-label">
          <span>Импортировать JSON-файл</span>
          <input accept=".json,application/json" disabled={busy} onChange={(event) => void importFile(event)} type="file" />
        </label>
        <p className="form-inline-note">Импорт справочника или прайса заменяет только выбранные данные. Полный импорт заменит всю базу после подтверждения.</p>
        {exchangeError && <p className="form-error" role="alert">{exchangeError}</p>}
        {exchangeMessage && <p className="form-success" role="status">{exchangeMessage}</p>}
      </section>

      <section className="settings-card edit-scroll-target" ref={doctorSectionRef} aria-labelledby="doctors-title">
        <h2 id="doctors-title">Справочник врачей</h2>
        <form className="data-form compact-form" onSubmit={(event) => void saveDoctor(event)}>
          <label>Имя<input onChange={(event) => setFirstName(event.target.value)} required value={firstName} /></label>
          <label>Фамилия<input onChange={(event) => setLastName(event.target.value)} required value={lastName} /></label>
          <label>Телефон<input onChange={(event) => setPhone(event.target.value)} value={phone} /></label>
          <label>Комментарий<textarea onChange={(event) => setComment(event.target.value)} rows={2} value={comment} /></label>
          <div className="form-actions">
            <button className="secondary-action" disabled={busy} onClick={clearDoctorForm} type="button">Очистить</button>
            <button className="primary-action" disabled={busy} type="submit">{doctorId ? 'Сохранить врача' : 'Добавить врача'}</button>
          </div>
        </form>
        <ul className="record-list">
          {doctors.map((doctor) => (
            <li key={doctor.id}>
              <span><strong>{doctor.lastName} {doctor.firstName}</strong><small>{doctor.phone || 'Телефон не указан'}</small></span>
              <span className="record-actions">
                <button aria-label={`Удалить ${doctor.lastName} ${doctor.firstName}`} className="text-button destructive-text-button" onClick={() => void removeDoctor(doctor)} type="button">×</button>
                <button aria-label={`Изменить ${doctor.lastName} ${doctor.firstName}`} className="text-button" onClick={() => editDoctor(doctor)} type="button">Изм.</button>
              </span>
            </li>
          ))}
        </ul>
        {doctors.length === 0 && <p className="form-muted">Справочник пока пуст.</p>}
      </section>

      <NamedDirectorySection
        deleteEntry={(entryId) => applicationPort.deleteColor(entryId)}
        entries={colors}
        nameLabel="Название цвета"
        onDataChanged={onDataChanged}
        persistEntry={(entryId, command) => applicationPort.saveColor(entryId, command)}
        title="Справочник Цветов"
      />

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
    </main>
  )
}
