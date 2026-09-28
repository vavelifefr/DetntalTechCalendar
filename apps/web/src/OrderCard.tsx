import type { ReactNode } from 'react'
import type { DoctorOption, RequiredFieldOption } from './OrderForm.tsx'

interface OrderCardFrameProps {
  eyebrow: string
  title: string
  onBack: () => void
  backLabel: string
  orderId?: string
  status?: 'ACTIVE' | 'CLOSED' | 'CANCELLED'
  className?: string
  children: ReactNode
}

interface OrderBasicsFieldsProps {
  doctors: DoctorOption[]
  requiredFields: RequiredFieldOption[]
  patientLabel: string
  doctorId: string | null
  orderDate: string
  deadline: string
  closureDate?: string | null
  generalComment?: string | null
  onPatientLabelChange: (value: string) => void
  onDoctorChange: (value: string | null) => void
  onOrderDateChange: (value: string) => void
  onDeadlineChange: (value: string) => void
  onClosureDateChange?: (value: string | null) => void
  onGeneralCommentChange?: (value: string | null) => void
}

function required(requiredFields: RequiredFieldOption[], fieldKey: string, defaultValue = true): boolean {
  return requiredFields.find((field) => field.fieldKey === fieldKey)?.required ?? defaultValue
}

export function OrderCardFrame({ eyebrow, title, onBack, backLabel, orderId, status, className = '', children }: OrderCardFrameProps) {
  const statusLabel = status === 'ACTIVE' ? 'Открыт' : status === 'CANCELLED' ? 'Отменён' : status === 'CLOSED' ? 'Закрыт' : null

  return (
    <main className={`section-panel order-form-panel ${className}`.trim()}>
      {backLabel !== 'Календарь' && <button className="text-button" onClick={onBack} type="button">{backLabel}</button>}
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {orderId && statusLabel && <p className="form-muted">ID заказа: {orderId} · Статус: {statusLabel}</p>}
      </div>
      {children}
    </main>
  )
}

export function OrderBasicsFields({
  doctors,
  requiredFields,
  patientLabel,
  doctorId,
  orderDate,
  deadline,
  closureDate,
  generalComment,
  onPatientLabelChange,
  onDoctorChange,
  onOrderDateChange,
  onDeadlineChange,
  onClosureDateChange,
  onGeneralCommentChange,
}: OrderBasicsFieldsProps) {
  const patientRequired = required(requiredFields, 'patient_label')
  const doctorRequired = required(requiredFields, 'doctor_id')
  const deadlineRequired = required(requiredFields, 'deadline_at')
  const doctorChoices = doctors.filter((doctor) => doctor.active || doctor.id === doctorId)

  return (
    <>
      <label>
        Имя пациента{patientRequired ? ' *' : ''}
        <input autoComplete="off" onChange={(event) => onPatientLabelChange(event.target.value)} required={patientRequired} value={patientLabel} />
      </label>
      <label>
        Врач{doctorRequired ? ' *' : ''}
        <select onChange={(event) => onDoctorChange(event.target.value || null)} required={doctorRequired} value={doctorId ?? ''}>
          <option value="">Выберите врача</option>
          {doctorChoices.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.lastName} {doctor.firstName}</option>)}
        </select>
      </label>
      {doctorChoices.length === 0 && doctorRequired && (
        <p className="form-inline-note">Сначала добавьте врача или импортируйте справочник в настройках.</p>
      )}
      <label>
        Старт заказа *
        <input onChange={(event) => onOrderDateChange(event.target.value)} required type="date" value={orderDate} />
      </label>
      <label>
        Срок сдачи{deadlineRequired ? ' *' : ''}
        <input onChange={(event) => onDeadlineChange(event.target.value)} required={deadlineRequired} type="date" value={deadline} />
      </label>
      {onClosureDateChange && (
        <label>
          Дата закрытия *
          <input onChange={(event) => onClosureDateChange(event.target.value || null)} required type="date" value={closureDate ?? ''} />
        </label>
      )}
      {onGeneralCommentChange && (
        <label>
          Комментарий к заказу
          <textarea maxLength={3000} onChange={(event) => onGeneralCommentChange(event.target.value || null)} rows={3} value={generalComment ?? ''} />
        </label>
      )}
    </>
  )
}
