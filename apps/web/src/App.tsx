import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { type DeviceProfile } from '@devicekit/devices'
import { DeviceFrame } from '@devicekit/frame/react'
import type { ApplicationPort, CalendarStartupDoctor, CalendarStartupNamedValue, CalendarStartupPricingItem, CalendarStartupRequiredField } from '@dental-tech/application'
import { CalendarScreen } from './CalendarScreen.tsx'
import type { CalendarOrder } from './calendar-state.ts'
import type { OrderReminderController } from './android-order-notifications.ts'

type ConnectionState = 'connecting' | 'ready' | 'unavailable'

const pocoX7ProPreview: DeviceProfile = {
  name: 'POCO X7 Pro — пропорции экрана',
  os: 'android',
  screen: { width: 360, height: 800 },
  pixelRatio: 1,
}

interface AppProps {
  applicationPort: ApplicationPort
  orderReminderController?: OrderReminderController
}

export default function App({ applicationPort, orderReminderController }: AppProps) {
  const computerUseMode = Capacitor.isNativePlatform()
    || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('computerUse') === '1')
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [orders, setOrders] = useState<CalendarOrder[]>([])
  const [doctors, setDoctors] = useState<CalendarStartupDoctor[]>([])
  const [colors, setColors] = useState<CalendarStartupNamedValue[]>([])
  const [expenseCategories, setExpenseCategories] = useState<CalendarStartupNamedValue[]>([])
  const [pricingItems, setPricingItems] = useState<CalendarStartupPricingItem[]>([])
  const [requiredFields, setRequiredFields] = useState<CalendarStartupRequiredField[]>([])
  const [loadError, setLoadError] = useState('')
  const [notificationSyncError, setNotificationSyncError] = useState('')

  const refreshData = useCallback(async () => {
    setConnection('connecting')
    setLoadError('')
    try {
      const snapshot = await applicationPort.loadStartupSnapshot()
      if (orderReminderController) {
        try {
          await orderReminderController.sync(snapshot.orders)
          setNotificationSyncError('')
        } catch (caught) {
          setNotificationSyncError(caught instanceof Error ? caught.message : 'Не удалось обновить напоминания Android.')
        }
      }
      setOrders(snapshot.orders.map((order) => ({
        id: order.id,
        label: order.patientLabel || order.doctorName || 'Работа без имени',
        patientLabel: order.patientLabel,
        doctorName: order.doctorName,
        deadlineAt: order.deadlineAt,
        status: order.status,
        workTypes: order.workTypes,
        financialSummary: order.financialSummary,
      })))
      setDoctors(snapshot.doctors)
      setColors(snapshot.colors)
      setExpenseCategories(snapshot.expenseCategories)
      setPricingItems(snapshot.pricingItems)
      setRequiredFields(snapshot.requiredFields)
      setConnection('ready')
    } catch (caught) {
      setConnection('unavailable')
      setLoadError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные приложения.')
    }
  }, [applicationPort, orderReminderController])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  const calendarScreen = (
    <CalendarScreen
      applicationPort={applicationPort}
      orderReminderController={orderReminderController}
      colors={colors}
      doctors={doctors}
      expenseCategories={expenseCategories}
      notificationSyncError={notificationSyncError}
      onDataChanged={refreshData}
      orders={orders}
      pricingItems={pricingItems}
      requiredFields={requiredFields}
    />
  )

  return (
    <main className={`app-shell${computerUseMode ? ' app-shell--computer-use' : ''}`} data-computer-use-mode={computerUseMode || undefined}>
      {!computerUseMode && <header className="app-header">
        <div>
          <p className="eyebrow">Локальный просмотр</p>
          <h1>DentalTechCalendar</h1>
        </div>
        <span className={`connection-pill connection-pill--${connection}`} data-testid="api-status">
          {connection === 'ready' ? 'Локально' : connection === 'connecting' ? 'Подключение' : 'Нет связи'}
        </span>
      </header>}

      <section className={computerUseMode ? 'computer-use-section' : 'preview-section'} aria-labelledby={computerUseMode ? undefined : 'preview-title'}>
        {!computerUseMode && <div className="preview-caption">
          <h2 id="preview-title">Предпросмотр экрана</h2>
          <p>POCO X7 Pro · портретные пропорции</p>
        </div>}

        {loadError && (
          <div className="app-load-error" role="alert">
            <span>{loadError}</span>
            <button className="secondary-action" onClick={() => void refreshData()} type="button">Повторить</button>
          </div>
        )}

        {computerUseMode ? (
          <section className="computer-use-content" aria-label="DentalTechCalendar — режим проверки">
            {calendarScreen}
          </section>
        ) : (
          <div className="device-stage">
            <DeviceFrame
              data-testid="device-frame"
              deviceProfile={pocoX7ProPreview}
              orientation="portrait"
              interactionMode="mobile"
              statusBar="live"
            >
              <section className="device-content" aria-label="DentalTechCalendar">
                {calendarScreen}
              </section>
            </DeviceFrame>
          </div>
        )}
      </section>
    </main>
  )
}
