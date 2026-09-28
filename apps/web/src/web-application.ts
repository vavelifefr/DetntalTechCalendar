import type {
  ApplicationArchivedOrder,
  ApplicationDebtRecord,
  ApplicationExportDataset,
  ApplicationOrderDetail,
  ApplicationOrderExpenseInput,
  ApplicationPort,
  ApplicationStatistics,
  ApplicationWorkItemInput,
  ApplicationWorkItemStatus,
  CalendarStartupDoctor,
  CalendarStartupNamedValue,
  CalendarStartupOrder,
  CalendarStartupPricingItem,
  CalendarStartupRequiredField,
  CalendarStartupSnapshot,
  CloseOrderCommand,
  CreateOrderCommand,
  SaveDoctorCommand,
  SaveNamedValueCommand,
  SavePricingCommand,
  UpdateOrderCommand,
} from '@dental-tech/application'

interface HealthResponse {
  status: string
  database: string
}

interface SettingsResponse {
  requiredFields: CalendarStartupRequiredField[]
  values: Record<string, string>
}

interface DeleteAllOrdersResponse {
  deletedCount: number
}

interface RecalculationResponse {
  orderCount: number
}

interface ImportResponse {
  imported: boolean
  count: number
}

async function readError(response: Response): Promise<string> {
  const result = await response.json().catch(() => ({})) as { error?: string }
  return result.error ?? `Ошибка запроса: ${response.status}`
}

async function requestJson<T>(request: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await request(url, init)
  if (!response.ok) throw new Error(await readError(response))
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

function orderPath(orderId: string): string {
  return `/api/orders/${encodeURIComponent(orderId)}`
}

export function createWebApplicationPort(request: typeof fetch = fetch): ApplicationPort {
  const requestEmpty = async (url: string, init?: RequestInit): Promise<void> => {
    await requestJson<unknown>(request, url, init)
  }

  return {
    async loadStartupSnapshot(): Promise<CalendarStartupSnapshot> {
      const health = await requestJson<HealthResponse>(request, '/api/health')
      if (health.status !== 'ok' || health.database !== 'ok') {
        throw new Error('Локальная база данных недоступна.')
      }

      const [orders, doctors, colors, expenseCategories, pricingItems, settings] = await Promise.all([
        requestJson<CalendarStartupOrder[]>(request, '/api/calendar/orders'),
        requestJson<CalendarStartupDoctor[]>(request, '/api/doctors'),
        requestJson<CalendarStartupNamedValue[]>(request, '/api/colors'),
        requestJson<CalendarStartupNamedValue[]>(request, '/api/expense-categories'),
        requestJson<CalendarStartupPricingItem[]>(request, '/api/pricing'),
        requestJson<SettingsResponse>(request, '/api/settings'),
      ])

      return { orders, doctors, colors, expenseCategories, pricingItems, requiredFields: settings.requiredFields }
    },

    async createOrder(command: CreateOrderCommand): Promise<void> {
      await requestEmpty('/api/orders', jsonRequest('POST', command))
    },

    getOrder(orderId: string): Promise<ApplicationOrderDetail> {
      return requestJson(request, orderPath(orderId))
    },

    async updateOrder(orderId: string, command: UpdateOrderCommand): Promise<void> {
      await requestEmpty(orderPath(orderId), jsonRequest('PATCH', command))
    },

    async deleteOrder(orderId: string): Promise<void> {
      await requestEmpty(orderPath(orderId), { method: 'DELETE' })
    },

    async deleteAllOrders(): Promise<number> {
      const result = await requestJson<DeleteAllOrdersResponse>(request, '/api/orders', { method: 'DELETE' })
      return result.deletedCount
    },

    async createWorkItem(orderId: string, command: ApplicationWorkItemInput): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/work-items`, jsonRequest('POST', command))
    },

    async updateWorkItem(orderId: string, itemId: string, command: ApplicationWorkItemInput): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/work-items/${encodeURIComponent(itemId)}`, jsonRequest('PATCH', command))
    },

    async setWorkItemStatus(orderId: string, itemId: string, status: ApplicationWorkItemStatus): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/work-items/${encodeURIComponent(itemId)}/status`, jsonRequest('PATCH', { status }))
    },

    async updateAcceptedWorkItemAmount(orderId: string, itemId: string, acceptedAmount: number | null): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/work-items/${encodeURIComponent(itemId)}/accepted-amount`, jsonRequest('PATCH', { acceptedAmount }))
    },

    async deleteWorkItem(orderId: string, itemId: string): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/work-items/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
    },

    async createOrderExpense(orderId: string, command: ApplicationOrderExpenseInput): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/expenses`, jsonRequest('POST', command))
    },

    async updateOrderExpense(orderId: string, expenseId: string, command: ApplicationOrderExpenseInput): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/expenses/${encodeURIComponent(expenseId)}`, jsonRequest('PATCH', command))
    },

    async deleteOrderExpense(orderId: string, expenseId: string): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' })
    },

    async closeOrder(orderId: string, command: CloseOrderCommand): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/close`, jsonRequest('POST', command))
    },

    async recordDebtPayment(orderId: string, amount: number): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/debt-payments`, jsonRequest('POST', { amount }))
    },

    async forgiveOrderDebt(orderId: string): Promise<void> {
      await requestEmpty(`${orderPath(orderId)}/debt-forgiveness`, { method: 'POST' })
    },

    listArchivedOrders(): Promise<ApplicationArchivedOrder[]> {
      return requestJson(request, '/api/archive/orders')
    },

    listDebts(): Promise<ApplicationDebtRecord[]> {
      return requestJson(request, '/api/debts')
    },

    getStatistics(fromDate: string | null, toDate: string | null): Promise<ApplicationStatistics> {
      const query = new URLSearchParams()
      if (fromDate) query.set('from', fromDate)
      if (toDate) query.set('to', toDate)
      return requestJson(request, `/api/statistics?${query}`)
    },

    async recalculateStatistics(fromDate: string | null, toDate: string | null): Promise<number> {
      const result = await requestJson<RecalculationResponse>(request, '/api/statistics/recalculate', jsonRequest('POST', {
        fromDate,
        toDate,
      }))
      return result.orderCount
    },

    async savePricingItem(itemId: string | null, command: SavePricingCommand): Promise<void> {
      const path = itemId ? `/api/pricing/${encodeURIComponent(itemId)}` : '/api/pricing'
      await requestEmpty(path, jsonRequest(itemId ? 'PATCH' : 'POST', command))
    },

    async deletePricingItem(itemId: string): Promise<void> {
      await requestEmpty(`/api/pricing/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
    },

    async saveDoctor(doctorId: string | null, command: SaveDoctorCommand): Promise<void> {
      const path = doctorId ? `/api/doctors/${encodeURIComponent(doctorId)}` : '/api/doctors'
      await requestEmpty(path, jsonRequest(doctorId ? 'PATCH' : 'POST', command))
    },

    async deleteDoctor(doctorId: string): Promise<void> {
      await requestEmpty(`/api/doctors/${encodeURIComponent(doctorId)}`, { method: 'DELETE' })
    },

    async saveColor(colorId: string | null, command: SaveNamedValueCommand): Promise<void> {
      const path = colorId ? `/api/colors/${encodeURIComponent(colorId)}` : '/api/colors'
      await requestEmpty(path, jsonRequest(colorId ? 'PATCH' : 'POST', command))
    },

    async deleteColor(colorId: string): Promise<void> {
      await requestEmpty(`/api/colors/${encodeURIComponent(colorId)}`, { method: 'DELETE' })
    },

    async setRequiredFields(requiredFields: CalendarStartupRequiredField[]): Promise<void> {
      await requestEmpty('/api/settings/required-fields', jsonRequest('PUT', { requiredFields }))
    },

    async exportDataset(dataset: ApplicationExportDataset): Promise<string> {
      const response = await request(`/api/export/${dataset}`)
      if (!response.ok) throw new Error(await readError(response))
      return response.text()
    },

    async importDataset(payload: unknown): Promise<{ count: number }> {
      const result = await requestJson<ImportResponse>(request, '/api/import', jsonRequest('POST', payload))
      return { count: result.count }
    },
  }
}
