'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Filter, Priority, Task } from '@/lib/types'
import { PRIORITY_COLORS, PRIORITY_LABEL } from '@/lib/types'
import { addDaysISO, formatDueDate, isOverdue, todayISO } from '@/lib/dates'
import { NavTabs } from '@/components/NavTabs'

export default function DashboardPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showAdd, setShowAdd] = useState(false)

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
    const q = search.trim().toLowerCase()

    let result = tasks
    if (q) {
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false)
      )
    }
    switch (filter) {
      case 'today':
        return result.filter((t) => t.due_date === today)
      case 'week':
        return result.filter(
          (t) => t.due_date && t.due_date >= today && t.due_date <= inWeek
        )
      case 'no-date':
        return result.filter((t) => !t.due_date)
      default:
        return result
    }
  }, [tasks, filter, search])

  async function toggleTask(task: Task) {
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
    if (error) setError(error.message)
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
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Your tasks
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {pending} pending {filter !== 'all' && `· ${filterLabel(filter)}`}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95"
          >
            + New task
          </button>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pl-9 text-sm text-zinc-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <svg
              className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
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
              {search ? 'No tasks match your search.' : 'No tasks here.'}
            </li>
          )}

          {filteredTasks.map((task) => {
            const overdue = isOverdue(task.due_date, task.completed)
            return (
              <li
                key={task.id}
                className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task)}
                  className="mt-1 h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {task.priority && (
                      <span
                        className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[task.priority].dot}`}
                        title={`Priority: ${PRIORITY_LABEL[task.priority]}`}
                      />
                    )}
                    <span
                      onDoubleClick={() => setEditingTask(task)}
                      className={`block truncate text-sm font-medium ${
                        task.completed
                          ? 'text-zinc-400 line-through'
                          : 'text-zinc-900 dark:text-zinc-50'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    {task.due_date && (
                      <span
                        className={`text-xs ${
                          overdue ? 'text-red-500 font-medium' : 'text-zinc-500'
                        }`}
                      >
                        {overdue && '⚠ '}
                        {formatDueDate(task.due_date)}
                      </span>
                    )}
                    {task.priority && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_COLORS[task.priority].badge}`}
                      >
                        {PRIORITY_LABEL[task.priority]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => setEditingTask(task)}
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
              </li>
            )
          })}
        </ul>
      </main>

      {showAdd && (
        <TaskModal onClose={() => setShowAdd(false)} onError={setError} />
      )}
      {editingTask && (
        <TaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onError={setError}
        />
      )}
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

function TaskModal({
  task,
  onClose,
  onError,
}: {
  task?: Task
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [priority, setPriority] = useState<Priority | ''>(task?.priority ?? '')
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    setSaving(true)
    const payload = {
      title: trimmed,
      description: description.trim() || null,
      due_date: dueDate || null,
      priority: priority || null,
    }

    if (task) {
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id)
      if (error) onError(error.message)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('tasks')
          .insert({ ...payload, user_id: user.id })
        if (error) onError(error.message)
      }
    }
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {task ? 'Edit task' : 'New task'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500">
            Description <span className="text-zinc-400">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority | '')}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">None</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 active:scale-95"
          >
            {saving ? 'Saving…' : task ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
