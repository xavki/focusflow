export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDueDate(iso: string | null): string {
  if (!iso) return ''
  const today = todayISO()
  const tomorrow = addDaysISO(1)
  if (iso === today) return 'Today'
  if (iso === tomorrow) return 'Tomorrow'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function isOverdue(iso: string | null, completed: boolean): boolean {
  if (!iso || completed) return false
  return iso < todayISO()
}
