import { expect, test } from '@playwright/test'

test('local shell connects to SQLite inside the POCO X7 Pro proportion preview', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'DentalTechCalendar' }).first()).toBeVisible()
  await expect(page.getByTestId('api-status')).toHaveText('Локально')

  const screen = await page.getByTestId('device-frame').evaluate((element) => {
    const frame = element as HTMLElement & { metrics: { screen: { width: number; height: number } } }
    return frame.metrics.screen
  })

  expect(screen.width / screen.height).toBeCloseTo(1220 / 2712, 2)
})
