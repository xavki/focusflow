export type Priority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  user_id: string
  title: string
  description: string | null
  priority: Priority | null
  completed: boolean
  due_date: string | null
  created_at: string
}

export type Filter = 'all' | 'today' | 'week' | 'no-date'

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const PRIORITY_COLORS: Record<Priority, { dot: string; badge: string }> = {
  high: {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  medium: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  low: {
    dot: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  },
}
