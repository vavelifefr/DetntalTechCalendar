export type PricingEditorField = 'numbering' | 'color'

export interface PricingEditorPricingItem {
  calculationMode: 'PER_UNIT' | 'FIXED' | 'COMPOSITE'
  metadata: Record<string, unknown>
}

export const PRICING_EDITOR_FIELDS: Array<{ key: PricingEditorField; label: string }> = [
  { key: 'numbering', label: 'Нумерация' },
  { key: 'color', label: 'Цвет' },
]

const LEGACY_VISIBLE_FIELDS: PricingEditorField[] = ['numbering', 'color']

export function pricingEditorFields(item: PricingEditorPricingItem | undefined): string[] {
  if (!item) return []
  const savedFields = item.metadata?.orderEditorFields
  if (!Array.isArray(savedFields)) return LEGACY_VISIBLE_FIELDS
  return savedFields.filter((field): field is string => typeof field === 'string')
}

export function pricingEditorFieldIsVisible(item: PricingEditorPricingItem | undefined, field: PricingEditorField): boolean {
  return pricingEditorFields(item).includes(field)
}

export function initialUnitMode(item: PricingEditorPricingItem | undefined): 'TOOTH_COUNT' | 'FIXED' {
  return item?.calculationMode === 'PER_UNIT' && pricingEditorFieldIsVisible(item, 'numbering')
    ? 'TOOTH_COUNT'
    : 'FIXED'
}
