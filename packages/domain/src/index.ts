export const FDI_UPPER_ARCH_ORDER = [
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
] as const

export const FDI_LOWER_ARCH_ORDER = [
  '48', '47', '46', '45', '44', '43', '42', '41',
  '31', '32', '33', '34', '35', '36', '37', '38',
] as const

export const PERMANENT_FDI_TOOTH_CODES = [
  '11', '12', '13', '14', '15', '16', '17', '18',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '31', '32', '33', '34', '35', '36', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48',
] as const

export type PermanentFdiToothCode = typeof PERMANENT_FDI_TOOTH_CODES[number]

const permanentFdiToothCodeSet = new Set<string>(PERMANENT_FDI_TOOTH_CODES)

export function isPermanentFdiToothCode(value: unknown): value is PermanentFdiToothCode {
  return typeof value === 'string' && permanentFdiToothCodeSet.has(value)
}
