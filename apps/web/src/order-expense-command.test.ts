import { describe, expect, it } from 'vitest'
import { toOrderExpenseUpdateCommand } from './order-expense-command.ts'

describe('toOrderExpenseUpdateCommand', () => {
  it('preserves the saved expense price, quantity, name, and total', () => {
    expect(toOrderExpenseUpdateCommand({
      id: 'expense-1',
      orderId: 'order-1',
      amount: 1840,
      pricingItemId: 'expense-pricing-1',
      name: 'Курьерская доставка',
      unitPrice: 920,
      quantity: 2,
      category: 'Транспортные расходы',
      comment: 'Срочная доставка',
    })).toEqual({
      amount: 1840,
      pricingItemId: 'expense-pricing-1',
      name: 'Курьерская доставка',
      unitPrice: 920,
      quantity: 2,
      category: 'Транспортные расходы',
      comment: 'Срочная доставка',
    })
  })
})
