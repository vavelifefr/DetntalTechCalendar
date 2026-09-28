import { expect, test } from '@playwright/test'

test('Calendar opens as the home screen and hides New Order until a date is selected', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: /Календарь на/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сводка по текущим заказам' })).toBeVisible()
  await expect(page.getByText('Открытых заказов пока нет.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Новый заказ/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ближайший заказ' })).toHaveCount(0)
  await expect(page.getByTestId('device-frame')).toBeVisible()
})

test('main menu contains the current sections and secondary pages return with Home', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const menu = page.getByRole('navigation', { name: 'Основные разделы' })
  for (const section of ['Архив', 'Статистика', 'Долги', 'Прайс-лист', 'Настройки', 'О программе']) {
    await expect(menu.getByRole('button', { name: section, exact: true })).toBeVisible()
  }
  await expect(menu.getByRole('button', { name: 'Календарь', exact: true })).toHaveCount(0)

  await menu.getByRole('button', { name: 'Архив', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Архив', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Домой' }).click()
  await expect(page.getByRole('heading', { name: 'Календарь', exact: true })).toBeVisible()
})

test('selected date toggles the New Order action and prefills its editable deadline', async ({ page }) => {
  await page.goto('/')

  const selectedDate = new Date()
  selectedDate.setDate(selectedDate.getDate() + 2)
  const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
  const dateLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(selectedDate)
  const dayButton = page.getByRole('button', { name: `Выбрать ${dateLabel}` })

  await dayButton.click()
  const newOrderButton = page.getByRole('button', { name: `Новый заказ к : ${dateLabel}`, exact: true })
  await expect(newOrderButton).toBeVisible()
  await expect(page.getByRole('heading', { name: `Активные заказы (${dateLabel})` })).toHaveCount(0)

  await dayButton.click()
  await expect(page.getByRole('button', { name: /^Новый заказ/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Сводка по текущим заказам' })).toBeVisible()

  await dayButton.click()
  await page.getByRole('button', { name: `Новый заказ к : ${dateLabel}`, exact: true }).click()
  const dates = page.locator('input[type="date"]')
  await expect(dates).toHaveCount(2)
  await expect(dates.nth(1)).toHaveValue(dateKey)
  await dates.nth(1).fill(dateKey)
})

test('month arrows move the visible month', async ({ page }) => {
  await page.goto('/')

  const monthLabel = page.getByTestId('calendar-month')
  const currentMonth = new Date()
  const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
  const formatMonth = (date: Date) => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)

  await expect(monthLabel).toHaveText(formatMonth(currentMonth))
  await page.getByRole('button', { name: 'Следующий месяц' }).click()
  await expect(monthLabel).toHaveText(formatMonth(nextMonth))
  await page.getByRole('button', { name: 'Предыдущий месяц' }).click()
  await expect(monthLabel).toHaveText(formatMonth(currentMonth))
})
