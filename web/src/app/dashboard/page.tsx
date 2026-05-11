'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Filter, Task } from '@/lib/types'
import { addDaysISO, formatDueDate, isOverdue, todayISO } from '@/lib/dates'
import { NavTabs } from '@/components/NavTabs'

export default function DashboardPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingDate, setEditingDate] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/login')
        return
      }
      setEmail(user.email ?? null)
      await fetchTasks()
      setLoading(false)

      channel = supabase
        .channel('tasks-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Task
              setTasks((prev) =>
                prev.some((t) => t.id === row.id) ? prev : [row, ...prev]
              )
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as Task
              setTasks((prev) => prev.map((t) => (t.id === row.id ? row : t)))
            } else if (payload.eventType === 'DELETE') {
              const row = payload.old as Task
              setTasks((prev) => prev.filter((t) => t.id !== row.id))
            }
          }
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [router])

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }
    setTasks(data ?? [])
  }

  const filteredTasks = useMemo(() => {
    const today = todayISO()
    const inWeek = addDaysISO(7)
    switch (filter) {
      case 'today':
        return tasks.filter((t) => t.due_date === today)
      case 'week':
        return tasks.filter(
          (t) => t.due_date && t.due_date >= today && t.due_date <= inWeek
        )
      case 'no-date':
        return tasks.filter((t) => !t.due_date)
      default:
        return tasks
    }
  }, [tasks, filter])

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('tasks').insert({
      title,
      user_id: user.id,
      due_date: newDate || null,
    })

    if (error) {
      setError(error.message)
      return
    }
    setNewTitle('')
    setNewDate('')
  }

  async function toggleTask(task: Task) {
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
    if (error) setError(error.message)
  }

  async function saveEdit(id: string) {
    const title = editingTitle.trim()
    if (!title) {
      setEditingId(null)
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update({ title, due_date: editingDate || null })
      .eq('id', id)
    if (error) setError(error.message)
    setEditingId(null)
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) setError(error.message)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-400">Loading…</div>
      </div>
    )
  }

  const pending = filteredTasks.filter((t) => !t.completed).length

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">FocusFlow</h1>
            <NavTabs />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-500 sm:inline">{email}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your tasks
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {pending} pending {filter !== 'all' && `· ${filterLabel(filter)}`}
        </p>

        <form onSubmit={addTask} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a new task…"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 [color-scheme:light] dark:[color-scheme:dark]"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95"
          >
            Add
          </button>
        </form>

        <div className="mt-6 flex flex-wrap gap-2">
          {(['all', 'today', 'week', 'no-date'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <ul className="mt-6 space-y-2">
          {filteredTasks.length === 0 && (
            <li className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No tasks here.
            </li>
          )}

          {filteredTasks.map((task) => {
            const overdue = isOverdue(task.due_date, task.completed)
            return (
              <li
                key={task.id}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task)}
                  className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />

                {editingId === task.id ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(task.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <input
                      type="date"
                      value={editingDate}
                      onChange={(e) => setEditingDate(e.target.value)}
                      className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 [color-scheme:light] dark:[color-scheme:dark]"
                    />
                    <button
                      onClick={() => saveEdit(task.id)}
                      className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span
                        onDoubleClick={() => {
                          setEditingId(task.id)
                          setEditingTitle(task.title)
                          setEditingDate(task.due_date ?? '')
                        }}
                        className={`block truncate text-sm ${
                          task.completed
                            ? 'text-zinc-400 line-through'
                            : 'text-zinc-900 dark:text-zinc-50'
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span
                          className={`mt-0.5 inline-block text-xs ${
                            overdue
                              ? 'text-red-500'
                              : 'text-zinc-500'
                          }`}
                        >
                          {overdue && '⚠ '}
                          {formatDueDate(task.due_date)}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingId(task.id)
                          setEditingTitle(task.title)
                          setEditingDate(task.due_date ?? '')
                        }}
                        className="text-xs text-zinc-500 hover:text-indigo-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-xs text-zinc-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}

function filterLabel(f: Filter): string {
  switch (f) {
    case 'all': return 'All'
    case 'today': return 'Today'
    case 'week': return 'This week'
    case 'no-date': return 'No date'
  }
}
