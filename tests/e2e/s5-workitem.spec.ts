import { expect, test } from '@playwright/test'

function businessDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

test('active WorkItems can change status and only suggest closure when none remain active', async ({ page }) => {
  const backupResponse = await page.request.get('/api/export/full-database')
  expect(backupResponse.ok()).toBe(true)
  const backup = await backupResponse.json()

  try {
    const patientLabel = `Проверка процесса S5 ${Date.now()}`
    const doctorResponse = await page.request.post('/api/doctors', {
      data: { firstName: 'Тестовый', lastName: `Врач S5 ${Date.now()}`, phone: '', comment: '', active: true },
    })
    expect(doctorResponse.ok()).toBe(true)
    const doctor = await doctorResponse.json() as { id: string }
    const today = new Date()
    const deadline = new Date(today)
    deadline.setDate(deadline.getDate() + 5)
    const createdResponse = await page.request.post('/api/orders', {
      data: {
        patientLabel,
        doctorId: doctor.id,
        orderDate: businessDate(today),
        deadlineAt: `${businessDate(deadline)}T12:00:00.000Z`,
        workItems: [
          { workType: 'Коронка S5', acceptedAmount: 5000 },
          { workType: 'Починка S5', acceptedAmount: 2000 },
        ],
      },
    })
    expect(createdResponse.ok()).toBe(true)
    const order = await createdResponse.json() as { id: string }

    await page.goto('/')
    await page.getByRole('button', { name: `Открыть заказ: ${patientLabel}` }).click()
    const workItems = page.getByRole('region', { name: 'Работы в заказе' })
    await expect(workItems.getByRole('heading', { name: 'Работы (2)' })).toBeVisible()
    const firstWorkCard = workItems.getByRole('button').filter({ hasText: 'Коронка S5' })
    await firstWorkCard.click()
    const firstWork = workItems.getByRole('group', { name: /Коронка S5/ })
    await firstWork.getByRole('button', { name: 'Выполнено', exact: true }).click()
    await expect(workItems.getByText('Открыто: 1 · Закрыто: 1 · Отменено: 0')).toBeVisible()
    await expect(page.getByLabel('Дата закрытия')).toHaveCount(0)

    await workItems.getByRole('button').filter({ hasText: 'Коронка S5' }).click()
    const completedWork = workItems.getByRole('group', { name: /Коронка S5/ })
    await completedWork.getByRole('button', { name: 'Отменено', exact: true }).click()
    await expect(workItems.getByText('Открыто: 1 · Закрыто: 0 · Отменено: 1')).toBeVisible()

    await workItems.getByRole('button').filter({ hasText: 'Коронка S5' }).click()
    const cancelledWork = workItems.getByRole('group', { name: /Коронка S5/ })
    await cancelledWork.getByRole('button', { name: 'В работе', exact: true }).click()
    await expect(workItems.getByText('Открыто: 2 · Закрыто: 0 · Отменено: 0')).toBeVisible()

    await workItems.getByRole('button').filter({ hasText: 'Коронка S5' }).click()
    const reopenedWork = workItems.getByRole('group', { name: /Коронка S5/ })
    await reopenedWork.getByRole('button', { name: 'Выполнено', exact: true }).click()
    await expect(workItems.getByText('Открыто: 1 · Закрыто: 1 · Отменено: 0')).toBeVisible()

    const secondWorkCard = workItems.getByRole('button').filter({ hasText: 'Починка S5' })
    await secondWorkCard.click()
    const secondWork = workItems.getByRole('group', { name: /Починка S5/ })
    const dialogPromise = page.waitForEvent('dialog')
    await secondWork.getByRole('button', { name: 'Выполнено', exact: true }).click()
    const dialog = await dialogPromise
    expect(dialog.message()).toContain('не осталось работ')
    await dialog.accept()

    await expect(page.getByLabel('Дата закрытия')).toBeVisible()
    const savedOrder = await (await page.request.get(`/api/orders/${order.id}`)).json()
    expect(savedOrder).toMatchObject({ status: 'ACTIVE' })
    expect(savedOrder.workItems.map((item: { workType: string; status: string }) => [item.workType, item.status]).sort())
      .toEqual([['Коронка S5', 'COMPLETED'], ['Починка S5', 'COMPLETED']].sort())

    await page.getByRole('button', { name: 'Вернуться к заказу' }).click()
    await expect(page.getByLabel('Дата закрытия')).toHaveCount(0)
    expect((await (await page.request.get(`/api/orders/${order.id}`)).json()).status).toBe('ACTIVE')
  } finally {
    const restoreResponse = await page.request.post('/api/import', { data: backup })
    expect(restoreResponse.ok()).toBe(true)
  }
})
