import { registerPlugin } from '@capacitor/core'
import type { CalendarStartupOrder } from '@dental-tech/application'
import { getLocalDateKey } from './calendar-state.ts'
import { getAndroidAppSetting, setAndroidAppSettings } from './android-application.ts'

export interface OrderReminderSettings {
  enabled: boolean
  leadDays: 0 | 1 | 2 | 3
  time: string
}

export interface OrderReminderPermissionState {
  notificationsGranted: boolean
  exactAlarmsGranted: boolean
}

export interface OrderReminderController {
  loadSettings(): Promise<OrderReminderSettings>
  saveSettings(settings: OrderReminderSettings): Promise<void>
  requestPermissions(): Promise<OrderReminderPermissionState>
  sync(orders: CalendarStartupOrder[]): Promise<void>
}

interface NativeOrderNotificationsPlugin {
  requestPermissions(): Promise<OrderReminderPermissionState>
  sync(options: { settings: OrderReminderSettings; orders: Array<{ id: string; patientName: string; doctorName: string; deadline: string }> }): Promise<void>
}

const nativeNotifications = registerPlugin<NativeOrderNotificationsPlugin>('OrderNotifications')
const defaultSettings: OrderReminderSettings = { enabled: false, leadDays: 0, time: '11:00' }
let syncQueue: Promise<void> = Promise.resolve()

function parseLeadDays(value: string): OrderReminderSettings['leadDays'] {
  const parsed = Number(value)
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : 0
}

export function createAndroidOrderReminderController(): OrderReminderController {
  async function loadSettings(): Promise<OrderReminderSettings> {
    const [enabled, leadDays, time] = await Promise.all([
      getAndroidAppSetting('android_order_reminders_enabled', String(defaultSettings.enabled)),
      getAndroidAppSetting('android_order_reminders_lead_days', String(defaultSettings.leadDays)),
      getAndroidAppSetting('android_order_reminders_time', defaultSettings.time),
    ])
    return {
      enabled: enabled === 'true',
      leadDays: parseLeadDays(leadDays),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : defaultSettings.time,
    }
  }

  return {
    loadSettings,
    async saveSettings(settings) {
      await setAndroidAppSettings({
        android_order_reminders_enabled: String(settings.enabled),
        android_order_reminders_lead_days: String(settings.leadDays),
        android_order_reminders_time: settings.time,
      })
    },
    requestPermissions: () => nativeNotifications.requestPermissions(),
    async sync(orders) {
      const operation = syncQueue.then(async () => {
        const settings = await loadSettings()
        await nativeNotifications.sync({
          settings,
          orders: orders.flatMap((order) => {
            if (order.status !== 'ACTIVE' || !order.deadlineAt) return []
            const deadlineDate = new Date(order.deadlineAt)
            if (Number.isNaN(deadlineDate.getTime())) return []
            return [{
              id: order.id,
              patientName: order.patientLabel?.trim() || 'Без имени',
              doctorName: order.doctorName.trim() || 'Не указан',
              deadline: getLocalDateKey(deadlineDate),
            }]
          }),
        })
      })
      syncQueue = operation.catch(() => undefined)
      await operation
    },
  }
}
