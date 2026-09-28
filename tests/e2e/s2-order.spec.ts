import { expect, test } from '@playwright/test'

function businessDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

test('creates, edits, and closes an Order with debt using the current Order card', async ({ page }) => {
  const backupResponse = await page.request.get('/api/export/full-database')
  expect(backupResponse.ok()).toBe(true)
  const backup = await backupResponse.json()

  try {
    const doctorResponse = await page.request.post('/api/doctors', {
      data: { firstName: 'S2', lastName: 'Тестовый', phone: '', comment: '', active: true },
    })
    expect(doctorResponse.ok()).toBe(true)
    const doctor = await doctorResponse.json() as { id: string }

    const workPricing = await page.request.post('/api/pricing', {
      data: {
        itemType: 'WORK', name: 'Коронка S2', calculationMode: 'PER_UNIT', unitPrice: 10000,
        fixedPrice: null, active: true, metadata: { orderEditorFields: [] },
      },
    })
    expect(workPricing.ok()).toBe(true)
    const expensePricing = await page.request.post('/api/pricing', {
      data: {
        itemType: 'EXPENSE', name: 'Литьё S2', calculationMode: 'PER_UNIT', unitPrice: 3000,
        fixedPrice: null, active: true, metadata: {},
      },
    })
    expect(expensePricing.ok()).toBe(true)

    await page.goto('/')
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 3)
    const deadlineKey = businessDate(deadline)
    const deadlineLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(deadline)
    await page.getByRole('button', { name: `Выбрать ${deadlineLabel}` }).click()
    await page.getByRole('button', { name: `Новый заказ к : ${deadlineLabel}`, exact: true }).click()

    const patientLabel = 'Тестовый пациент S2'
    await page.getByLabel(/Имя пациента/).fill(patientLabel)
    await page.getByLabel(/^Врач/).selectOption({ value: doctor.id })
    await page.getByLabel('Срок сдачи *').fill(deadlineKey)

    await page.getByRole('button', { name: 'Добавить работу', exact: true }).click()
    const newWork = page.getByRole('group', { name: /Работа 1/ })
    await newWork.getByLabel('Наименование работы').selectOption({ label: 'Коронка S2' })
    await expect(newWork.getByText('Расчётная стоимость: 10 000')).toBeVisible()
    await newWork.getByRole('button', { name: 'Сохранить', exact: true }).click()

    const newExpenseRegion = page.getByRole('region', { name: 'Расходы заказа' })
    await newExpenseRegion.getByRole('button', { name: 'Добавить к расходам' }).click()
    await newExpenseRegion.getByLabel('Категория').selectOption({ label: 'Литьё S2' })
    await newExpenseRegion.getByLabel('Комментарий').fill('Тестовый расход')
    await newExpenseRegion.getByRole('button', { name: 'Сохранить расход' }).click()
    await expect(newExpenseRegion.getByRole('heading', { name: 'Расходы (1)' })).toBeVisible()

    await page.getByRole('button', { name: 'Сохранить заказ', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
    const activeOrders = await (await page.request.get('/api/orders?status=ACTIVE')).json()
    const createdOrder = activeOrders.find((order: { patientLabel: string }) => order.patientLabel === patientLabel)
    expect(createdOrder).toBeTruthy()
    expect(createdOrder.orderDate).toBe(businessDate(new Date()))
    expect(createdOrder.deadlineAt.slice(0, 10)).toBe(deadlineKey)
    expect(createdOrder).not.toHaveProperty('createdAt')

    await page.getByRole('button', { name: `Открыть заказ: ${patientLabel}` }).click()
    const workRegion = page.getByRole('region', { name: 'Работы в заказе' })
    await workRegion.getByRole('button').filter({ hasText: 'Коронка S2' }).click()
    const savedWork = workRegion.getByRole('group', { name: /Работа 1/ })
    await savedWork.getByLabel('Стоимость работы').fill('12000')
    await savedWork.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText('Работа сохранена.')).toBeVisible()

    const expenseRegion = page.getByRole('region', { name: 'Расходы заказа' })
    await expenseRegion.getByRole('button').filter({ hasText: 'Литьё S2' }).click()
    await expenseRegion.getByLabel('Издержки').fill('3200')
    await expenseRegion.getByRole('button', { name: 'Сохранить расход' }).click()
    await expect(page.getByText('Расход сохранён.')).toBeVisible()
    await page.getByLabel('Имя пациента *').fill(`${patientLabel} изменен`)
    await expect(page.getByLabel('Имя пациента *')).toHaveValue(`${patientLabel} изменен`)
    await page.getByRole('button', { name: 'Сохранить заказ', exact: true }).click()
    await expect(page.getByText('Заказ сохранён.')).toBeVisible()

    const updatedDetail = await (await page.request.get(`/api/orders/${createdOrder.id}`)).json()
    expect(updatedDetail.patientLabel).toBe(`${patientLabel} изменен`)
    expect(updatedDetail.workItems[0].acceptedAmount).toBe(12000)
    expect(updatedDetail.expenses[0]).toMatchObject({ unitPrice: 3200, quantity: 1, amount: 3200, comment: 'Тестовый расход' })
    expect(updatedDetail.financialSummary).toMatchObject({ expectedIncome: 0, income: 0, expenses: 3200, balance: -3200 })

    await workRegion.getByRole('button').filter({ hasText: 'Коронка S2' }).click()
    const expandedWork = workRegion.getByRole('group', { name: /Работа 1/ })
    const closurePrompt = page.waitForEvent('dialog')
    await expandedWork.getByRole('button', { name: 'Выполнено', exact: true }).click()
    const dialog = await closurePrompt
    expect(dialog.message()).toContain('не осталось работ')
    await dialog.accept()

    await expect(page.getByLabel('Получено')).toBeVisible()
    await expect(page.getByLabel('Итог при закрытии').getByText('Ожидается: 12')).toBeVisible()
    await page.getByLabel('Получено').fill('4000')
    const debtCheckbox = page.getByLabel('Оформить как заказ с долгом')
    await expect(debtCheckbox).toBeEnabled()
    await expect(debtCheckbox).not.toBeChecked()
    await debtCheckbox.check()
    await expect(page.getByLabel('Задолженность')).toHaveValue('8000')
    await page.getByLabel('Комментарий к долгу').fill('Остаток не оплачен')
    await page.getByRole('button', { name: 'Подтвердить закрытие' }).click()
    await expect(page.getByText('Заказ закрыт и перенесён в архив.')).toBeVisible()

    const closedDetail = await (await page.request.get(`/api/orders/${createdOrder.id}`)).json()
    expect(closedDetail).toMatchObject({ status: 'CLOSED', closureDate: businessDate(new Date()) })
    expect(closedDetail.financialSummary).toMatchObject({
      expectedIncome: 12000,
      income: 4000,
      expenses: 3200,
      debt: 8000,
      receivedAmount: 4000,
      balance: 800,
    })
  } finally {
    const restoreResponse = await page.request.post('/api/import', { data: backup })
    expect(restoreResponse.ok()).toBe(true)
  }
})
