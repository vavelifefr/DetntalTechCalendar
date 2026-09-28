import { isPermanentFdiToothCode } from '@dental-tech/domain'

export interface ParsedToothList {
  codes: string[]
  error: string | null
}

export function parseFdiToothList(value: string): ParsedToothList {
  const trimmed = value.trim()
  if (!trimmed) return { codes: [], error: 'Введите хотя бы один номер зуба через запятую.' }

  const codes = trimmed.split(',').map((entry) => entry.trim())
  if (codes.some((code) => !code)) {
    return { codes: [], error: 'Разделяйте номера запятыми; пустых значений быть не должно.' }
  }

  const invalidCodes = [...new Set(codes.filter((code) => !isPermanentFdiToothCode(code)))]
  if (invalidCodes.length > 0) {
    return { codes: [], error: `Неверный FDI-номер: ${invalidCodes.join(', ')}. Используйте номера постоянных зубов FDI.` }
  }

  const duplicateCodes = [...new Set(codes.filter((code, index) => codes.indexOf(code) !== index))]
  if (duplicateCodes.length > 0) {
    return { codes: [], error: `Номер зуба указан повторно: ${duplicateCodes.join(', ')}.` }
  }

  return { codes, error: null }
}
