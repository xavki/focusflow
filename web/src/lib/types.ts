export type Task = {
  id: string
  user_id: string
  title: string
  completed: boolean
  due_date: string | null
  created_at: string
}

export type Filter = 'all' | 'today' | 'week' | 'no-date'
