import type { ApplicationOrderExpenseInput, ApplicationOrderExpenseRecord } from '@dental-tech/application'

export function toOrderExpenseUpdateCommand(expense: ApplicationOrderExpenseRecord): ApplicationOrderExpenseInput {
  return {
    amount: expense.amount,
    pricingItemId: expense.pricingItemId,
    name: expense.name,
    unitPrice: expense.unitPrice,
    quantity: expense.quantity,
    category: expense.category,
    comment: expense.comment,
  }
}
