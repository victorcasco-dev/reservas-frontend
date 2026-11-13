const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Partes de una fecha ISO (yyyy-mm-dd) para los bloques de calendario de los listados. */
export function dateParts(value: string): { day: string; month: string; year: string } {
  const [year, month, day] = value.split('-')
  return { day: String(Number(day)), month: MONTHS[Number(month) - 1] ?? month, year }
}

/** "lunes, 11 de enero de 2027" sin desfase de zona horaria. */
export function longDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const text = new Intl.DateTimeFormat('es', { dateStyle: 'full' }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Minutos entre dos horas "HH:mm[:ss]". */
export function durationMinutes(start: string, end: string): number {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  return toMinutes(end) - toMinutes(start)
}

/** Clases Tailwind comunes para los controles de filtro de los listados. */
export const filterControl =
  'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft'

export const filterLabel = 'flex min-w-0 flex-col gap-0.5 text-[0.7rem] font-medium text-muted'
