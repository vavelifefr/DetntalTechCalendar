import Fastify, { type FastifyInstance } from 'fastify'
import {
  DataValidationError,
  addOrderExpense,
  addOrderDebtPayment,
  forgiveOrderDebt,
  appendWorkItem,
  closeOrder,
  createOrder,
  currentSchemaVersion,
  getOrderStatistics,
  recalculateOrderFinancials,
  deleteColor,
  deleteDoctor,
  deleteExpenseCategory,
  deletePricing,
  exportDirectory,
  exportDoctorDirectory,
  exportFullDatabase,
  exportPricing,
  getAppSettings,
  getColors,
  getDoctors,
  getExpenseCategories,
  getOrder,
  getPricing,
  getRequiredFields,
  importDataset,
  listCalendarOrders,
  listOrders,
  listArchivedOrders,
  listDebts,
  removeOrder,
  removeAllOrders,
  removeWorkItem,
  removeOrderExpense,
  saveColor,
  saveDoctor,
  saveExpenseCategory,
  savePricing,
  setRequiredFields,
  type CreateOrderInput,
  type CloseOrderInput,
  type DoctorInput,
  type NamedDirectoryInput,
  type OrderStatus,
  type OrderExpenseInput,
  type OrderDebtPaymentInput,
  type PricingInput,
  type SqliteDatabase,
  type WorkItemInput,
  type WorkItemStatus,
  type UpdateOrderInput,
  updateOrderDetails,
  updateAcceptedWorkItemAmount,
  setWorkItemStatus,
  updateOrderExpense,
  updateWorkItem,
} from '@dental-tech/persistence-sqlite'

export interface CreateAppOptions {
  database: SqliteDatabase
}

export function createApp({ database }: CreateAppOptions): FastifyInstance {
  const app = Fastify({ logger: true })

  function handleError(error: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }) {
    if (error instanceof DataValidationError) return reply.code(400).send({ error: error.message })
    app.log.error(error)
    return reply.code(500).send({ error: 'Внутренняя ошибка локального API.' })
  }

  app.get('/api/health', async () => {
    const result = database.prepare('SELECT 1 AS connected').get() as { connected: number }
    return {
      status: 'ok',
      database: result.connected === 1 ? 'ok' : 'down',
      schemaVersion: currentSchemaVersion(database),
    }
  })

  app.get('/api/calendar/orders', async () => listCalendarOrders(database))

  app.get('/api/archive/orders', async () => listArchivedOrders(database))

  app.get('/api/debts', async () => listDebts(database))

  app.get<{ Querystring: { from?: string; to?: string } }>('/api/statistics', async (request, reply) => {
    try {
      return getOrderStatistics(database, request.query.from, request.query.to)
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.post<{ Body: { fromDate?: string | null; toDate?: string | null } }>('/api/statistics/recalculate', async (request, reply) => {
    try {
      return recalculateOrderFinancials(database, request.body?.fromDate, request.body?.toDate)
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get<{ Querystring: { status?: string } }>('/api/orders', async (request, reply) => {
    const status = request.query.status
    if (status && !['ACTIVE', 'CLOSED', 'CANCELLED'].includes(status)) {
      return reply.code(400).send({ error: 'Недопустимый статус заказа.' })
    }
    return listOrders(database, status as OrderStatus | undefined)
  })

  app.post<{ Body: CreateOrderInput }>('/api/orders', async (request, reply) => {
    try {
      return reply.code(201).send(createOrder(database, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get<{ Params: { orderId: string } }>('/api/orders/:orderId', async (request, reply) => {
    const order = getOrder(database, request.params.orderId)
    if (!order) return reply.code(404).send({ error: 'Заказ не найден.' })
    return order
  })

  app.patch<{ Params: { orderId: string }; Body: UpdateOrderInput }>('/api/orders/:orderId', async (request, reply) => {
    try {
      return updateOrderDetails(database, request.params.orderId, request.body)
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.delete<{ Params: { orderId: string } }>('/api/orders/:orderId', async (request, reply) => {
    try {
      removeOrder(database, request.params.orderId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.delete('/api/orders', async (_request, reply) => {
    try {
      return { deletedCount: removeAllOrders(database) }
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.post<{ Params: { orderId: string }; Body: WorkItemInput }>('/api/orders/:orderId/work-items', async (request, reply) => {
    try {
      const id = appendWorkItem(database, request.params.orderId, request.body)
      return reply.code(201).send({ id })
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.patch<{ Params: { orderId: string; itemId: string }; Body: WorkItemInput }>('/api/orders/:orderId/work-items/:itemId', async (request, reply) => {
    try {
      updateWorkItem(database, request.params.orderId, request.params.itemId, request.body)
      return { id: request.params.itemId }
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.patch<{ Params: { orderId: string; itemId: string }; Body: { status: WorkItemStatus } }>('/api/orders/:orderId/work-items/:itemId/status', async (request, reply) => {
    try {
      setWorkItemStatus(database, request.params.orderId, request.params.itemId, request.body?.status)
      return { id: request.params.itemId, status: request.body?.status }
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.patch<{ Params: { orderId: string; itemId: string }; Body: { acceptedAmount: number | null } }>('/api/orders/:orderId/work-items/:itemId/accepted-amount', async (request, reply) => {
    try {
      updateAcceptedWorkItemAmount(database, request.params.orderId, request.params.itemId, request.body?.acceptedAmount)
      return { id: request.params.itemId }
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.delete<{ Params: { orderId: string; itemId: string } }>('/api/orders/:orderId/work-items/:itemId', async (request, reply) => {
    try {
      removeWorkItem(database, request.params.orderId, request.params.itemId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.post<{ Params: { orderId: string }; Body: OrderExpenseInput }>('/api/orders/:orderId/expenses', async (request, reply) => {
    try {
      return reply.code(201).send(addOrderExpense(database, request.params.orderId, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.patch<{ Params: { orderId: string; expenseId: string }; Body: OrderExpenseInput }>('/api/orders/:orderId/expenses/:expenseId', async (request, reply) => {
    try {
      return updateOrderExpense(database, request.params.orderId, request.params.expenseId, request.body)
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.delete<{ Params: { orderId: string; expenseId: string } }>('/api/orders/:orderId/expenses/:expenseId', async (request, reply) => {
    try {
      removeOrderExpense(database, request.params.orderId, request.params.expenseId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.post<{ Params: { orderId: string }; Body: OrderDebtPaymentInput }>('/api/orders/:orderId/debt-payments', async (request, reply) => {
    try {
      return reply.code(201).send(addOrderDebtPayment(database, request.params.orderId, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.post<{ Params: { orderId: string } }>('/api/orders/:orderId/debt-forgiveness', async (request, reply) => {
    try {
      return forgiveOrderDebt(database, request.params.orderId)
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.post<{ Params: { orderId: string }; Body: CloseOrderInput }>('/api/orders/:orderId/close', async (request, reply) => {
    try {
      return closeOrder(database, request.params.orderId, request.body)
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get('/api/doctors', async () => getDoctors(database))
  app.post<{ Body: DoctorInput }>('/api/doctors', async (request, reply) => {
    try {
      return reply.code(201).send(saveDoctor(database, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.patch<{ Params: { doctorId: string }; Body: DoctorInput }>('/api/doctors/:doctorId', async (request, reply) => {
    try {
      return saveDoctor(database, { ...request.body, id: request.params.doctorId })
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.delete<{ Params: { doctorId: string } }>('/api/doctors/:doctorId', async (request, reply) => {
    try {
      deleteDoctor(database, request.params.doctorId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get('/api/colors', async () => getColors(database))
  app.post<{ Body: NamedDirectoryInput }>('/api/colors', async (request, reply) => {
    try {
      return reply.code(201).send(saveColor(database, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.patch<{ Params: { colorId: string }; Body: NamedDirectoryInput }>('/api/colors/:colorId', async (request, reply) => {
    try {
      return saveColor(database, { ...request.body, id: request.params.colorId })
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.delete<{ Params: { colorId: string } }>('/api/colors/:colorId', async (request, reply) => {
    try {
      deleteColor(database, request.params.colorId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get('/api/expense-categories', async () => getExpenseCategories(database))
  app.post<{ Body: NamedDirectoryInput }>('/api/expense-categories', async (request, reply) => {
    try {
      return reply.code(201).send(saveExpenseCategory(database, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.patch<{ Params: { categoryId: string }; Body: NamedDirectoryInput }>('/api/expense-categories/:categoryId', async (request, reply) => {
    try {
      return saveExpenseCategory(database, { ...request.body, id: request.params.categoryId })
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.delete<{ Params: { categoryId: string } }>('/api/expense-categories/:categoryId', async (request, reply) => {
    try {
      deleteExpenseCategory(database, request.params.categoryId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get('/api/pricing', async () => getPricing(database))
  app.post<{ Body: PricingInput }>('/api/pricing', async (request, reply) => {
    try {
      return reply.code(201).send(savePricing(database, request.body))
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.patch<{ Params: { itemId: string }; Body: PricingInput }>('/api/pricing/:itemId', async (request, reply) => {
    try {
      return savePricing(database, { ...request.body, id: request.params.itemId })
    } catch (error) {
      return handleError(error, reply)
    }
  })
  app.delete<{ Params: { itemId: string } }>('/api/pricing/:itemId', async (request, reply) => {
    try {
      deletePricing(database, request.params.itemId)
      return reply.code(204).send()
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get('/api/settings', async () => ({ requiredFields: getRequiredFields(database), values: getAppSettings(database) }))

  app.put<{ Body: { requiredFields: unknown } }>('/api/settings/required-fields', async (request, reply) => {
    try {
      return { requiredFields: setRequiredFields(database, request.body?.requiredFields) }
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.get<{ Params: { dataset: string } }>('/api/export/:dataset', async (request, reply) => {
    const payload = request.params.dataset === 'directory'
      ? exportDirectory(database)
      : request.params.dataset === 'doctor-directory'
        ? exportDoctorDirectory(database)
        : request.params.dataset === 'pricing'
          ? exportPricing(database)
          : request.params.dataset === 'full-database'
            ? exportFullDatabase(database)
            : undefined
    if (!payload) return reply.code(404).send({ error: 'Неизвестный тип экспорта.' })
    return reply.header('content-disposition', `attachment; filename="${request.params.dataset}.json"`).send(payload)
  })

  app.post<{ Body: unknown }>('/api/import', async (request, reply) => {
    try {
      const count = importDataset(database, request.body)
      return { imported: true, count }
    } catch (error) {
      return handleError(error, reply)
    }
  })

  app.addHook('onClose', async () => {
    if (database.open) database.close()
  })

  return app
}
