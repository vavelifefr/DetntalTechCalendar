import { isPermanentFdiToothCode } from '@dental-tech/domain'

export interface ParsedFdiToothList {
  codes: string[]
  error: string | null
}

export function parseFdiToothList(value: string): ParsedFdiToothList {
  const text = value.trim()
  if (!text) return { codes: [], error: 'Укажите хотя бы один номер зуба FDI.' }

  const codes = text.split(',').map((code) => code.trim())
  if (codes.some((code) => !code)) {
    return { codes: [], error: 'Разделяйте номера запятыми и не оставляйте пустые элементы.' }
  }
  const invalidCode = codes.find((code) => !isPermanentFdiToothCode(code))
  if (invalidCode) {
    return { codes: [], error: `Номер «${invalidCode}» не является номером постоянного зуба FDI.` }
  }
  if (new Set(codes).size !== codes.length) {
    return { codes: [], error: 'В списке не должно быть повторяющихся номеров зубов.' }
  }

  return { codes, error: null }
}
