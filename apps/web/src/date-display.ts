export function localDateFromValue(value: string | null): Date | null {
  if (!value) return null

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(value)

  if (Number.isNaN(date.getTime())) return null
  if (dateOnly && (date.getFullYear() !== Number(dateOnly[1])
    || date.getMonth() !== Number(dateOnly[2]) - 1
    || date.getDate() !== Number(dateOnly[3]))) return null
  return date
}

export function formatLocalDate(value: string | null): string | null {
  const date = localDateFromValue(value)
  return date
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
    : null
}

export function formatLocalNumericDate(value: string | null): string | null {
  const date = localDateFromValue(value)
  if (!date) return null
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}
