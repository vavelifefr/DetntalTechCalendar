import { expect, test } from '@playwright/test'

function businessDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

test('FDI selections stay with their WorkItems and determine their units', async ({ page }) => {
  const backupResponse = await page.request.get('/api/export/full-database')
  expect(backupResponse.ok()).toBe(true)
  const backup = await backupResponse.json()

  try {
    const doctorResponse = await page.request.post('/api/doctors', {
      data: { firstName: 'S3', lastName: 'Тестовый', phone: '', comment: '', active: true },
    })
    expect(doctorResponse.ok()).toBe(true)
    const doctor = await doctorResponse.json() as { id: string }
    const pricingResponse = await page.request.post('/api/pricing', {
      data: {
        itemType: 'WORK', name: 'Работа FDI S3', calculationMode: 'PER_UNIT', unitPrice: 10000,
        fixedPrice: null, active: true, metadata: { orderEditorFields: ['numbering'] },
      },
    })
    expect(pricingResponse.ok()).toBe(true)
    const pricing = await pricingResponse.json() as { id: string }

    await page.goto('/')
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 3)
    const deadlineKey = businessDate(deadline)
    const deadlineLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(deadline)
    await page.getByRole('button', { name: `Выбрать ${deadlineLabel}` }).click()
    await page.getByRole('button', { name: `Новый заказ к : ${deadlineLabel}`, exact: true }).click()
    await page.getByLabel(/Имя пациента/).fill('Тестовый пациент S3 FDI')
    await page.getByLabel(/^Врач/).selectOption({ value: doctor.id })
    await page.getByLabel(/Срок сдачи/).fill(deadlineKey)

    const workSection = page.getByRole('region', { name: 'Работы в заказе' })
    await page.getByRole('button', { name: 'Добавить работу', exact: true }).click()
    const firstWork = workSection.getByRole('group', { name: 'Работа 1' })
    await firstWork.getByLabel('Наименование работы').selectOption({ value: pricing.id })
    await expect(firstWork.getByLabel('Нумерация')).toHaveValue('TOOTH_COUNT')
    const firstMap = firstWork.getByRole('region', { name: 'Карта постоянных зубов FDI' })
    await expect(firstMap.getByRole('button', { name: /постоянный зуб FDI/ })).toHaveCount(32)
    await firstMap.getByRole('button', { name: /постоянный зуб FDI 11$/ }).click()
    await firstMap.getByRole('button', { name: /постоянный зуб FDI 13$/ }).click()
    await expect(firstMap.locator('.odontogram-selected-tooth')).toHaveCount(2)
    await expect(firstWork.getByText('Выбрано 2 (11, 13).')).toBeVisible()
    await firstWork.getByRole('button', { name: 'Сохранить', exact: true }).click()

    await page.getByRole('button', { name: 'Добавить работу', exact: true }).click()
    const secondWork = workSection.getByRole('group', { name: 'Работа 2' })
    await secondWork.getByLabel('Наименование работы').selectOption({ value: pricing.id })
    const secondMap = secondWork.getByRole('region', { name: 'Карта постоянных зубов FDI' })
    await secondMap.getByRole('button', { name: /постоянный зуб FDI 21$/ }).click()
    await expect(secondMap.locator('.odontogram-selected-tooth')).toHaveCount(1)
    await expect(secondWork.getByText('Выбрано 1 (21).')).toBeVisible()

    await secondWork.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await page.getByRole('button', { name: 'Сохранить заказ', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()

    const activeOrdersResponse = await page.request.get('/api/orders?status=ACTIVE')
    const createdOrder = (await activeOrdersResponse.json()).find((order: { patientLabel: string }) => order.patientLabel === 'Тестовый пациент S3 FDI')
    expect(createdOrder).toBeTruthy()
    const detailResponse = await page.request.get(`/api/orders/${createdOrder.id}`)
    expect(detailResponse.ok()).toBe(true)
    const details = await detailResponse.json()
    const savedWorkItems = details.workItems
      .map((item: { unitMode: string; units: number; toothCodes: string[] }) => ({
        unitMode: item.unitMode,
        units: item.units,
        toothCodes: item.toothCodes,
      }))
      .sort((left: { units: number }, right: { units: number }) => left.units - right.units)
    expect(savedWorkItems).toEqual([
      { unitMode: 'TOOTH_COUNT', units: 1, toothCodes: ['21'] },
      { unitMode: 'TOOTH_COUNT', units: 2, toothCodes: ['11', '13'] },
    ])
  } finally {
    const restoreResponse = await page.request.post('/api/import', { data: backup })
    expect(restoreResponse.ok()).toBe(true)
  }
})
