'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Filter, Priority, Task } from '@/lib/types'
import { PRIORITY_COLORS, PRIORITY_LABEL } from '@/lib/types'
import { addDaysISO, formatDueDate, isOverdue, todayISO } from '@/lib/dates'
import { NavTabs } from '@/components/NavTabs'
import { AIPlanModal } from '@/components/AIPlanModal'
import { ThemeToggle } from '@/components/HeaderControls'
import { useI18n } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/dictionaries'

function filterKey(f: Filter): TranslationKey {
  switch (f) {
    case 'all': return 'filter.all'
    case 'today': return 'filter.today'
    case 'week': return 'filter.week'
    case 'no-date': return 'filter.noDate'
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
        .channel(`tasks-changes-${Math.random().toString(36).slice(2)}`)
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
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completed: !t.completed } : t
      )
    )
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
    if (error) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, completed: task.completed } : t
        )
      )
      setError(error.message)
    }
  }

  async function deleteTask(id: string) {
    const backup = tasks
    setTasks((prev) => prev.filter((t) => t.id !== id))
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) {
      setTasks(backup)
      setError(error.message)
    }
  }

  function toggleSelected(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const backup = tasks
    setTasks((prev) => prev.filter((t) => !selected.has(t.id)))
    exitSelectMode()
    const { error } = await supabase.from('tasks').delete().in('id', ids)
    if (error) {
      setTasks(backup)
      setError(error.message)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-400">{t('common.loading')}</div>
      </div>
    )
  }

  const pending = filteredTasks.filter((t) => !t.completed).length

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t('app.name')}</h1>
            <NavTabs />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t('tasks.your')}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {pending} {t('tasks.pending')} {filter !== 'all' && `· ${t(filterKey(filter))}`}
            </p>
          </div>
          <div className="flex gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={exitSelectMode}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  {t('tasks.cancel')}
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={selected.size === 0}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50 active:scale-95"
                >
                  {t('tasks.delete')} ({selected.size})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  {t('tasks.select')}
                </button>
                <button
                  onClick={() => setShowAI(true)}
                  className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 active:scale-95 dark:border-indigo-800 dark:bg-zinc-950 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                >
                  {t('tasks.planWithAI')}
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95"
                >
                  {t('tasks.newTask')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tasks.search')}
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
              {t(filterKey(f))}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <ul className="mt-6 space-y-2">
          {filteredTasks.length === 0 && (
            <li className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
              {search ? t('tasks.noMatch') : t('tasks.none')}
            </li>
          )}

          {filteredTasks.map((task) => {
            const overdue = isOverdue(task.due_date, task.completed)
            const isSelected = selected.has(task.id)
            return (
              <li
                key={task.id}
                onClick={selectMode ? () => toggleSelected(task.id) : undefined}
                className={`group flex items-start gap-3 rounded-xl border bg-white px-4 py-3 transition hover:shadow-sm dark:bg-zinc-950 ${
                  selectMode ? 'cursor-pointer' : ''
                } ${
                  isSelected
                    ? 'border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950/30'
                    : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectMode ? isSelected : task.completed}
                  onChange={() =>
                    selectMode ? toggleSelected(task.id) : toggleTask(task)
                  }
                  onClick={(e) => e.stopPropagation()}
                  className={`mt-1 h-4 w-4 cursor-pointer rounded border-zinc-300 focus:ring-indigo-500 ${
                    selectMode ? 'text-red-600 focus:ring-red-500' : 'text-indigo-600'
                  }`}
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
                    {t('tasks.edit')}
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-xs text-zinc-500 hover:text-red-600"
                  >
                    {t('tasks.delete')}
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
      {showAI && <AIPlanModal onClose={() => setShowAI(false)} />}
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

function TaskModal({
  task,
  onClose,
  onError,
}: {
  task?: Task
  onClose: () => void
  onError: (msg: string) => void
}) {
  const { t } = useI18n()
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
            {task ? t('tasks.editTask') : t('tasks.newTaskTitle')}
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
          <label className="block text-xs font-medium text-zinc-500">{t('tasks.title')}</label>
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
            {t('tasks.description')} <span className="text-zinc-400">{t('tasks.descriptionOptional')}</span>
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
            <label className="block text-xs font-medium text-zinc-500">{t('tasks.dueDate')}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">{t('tasks.priority')}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority | '')}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">{t('tasks.priorityNone')}</option>
              <option value="high">{t('tasks.priorityHigh')}</option>
              <option value="medium">{t('tasks.priorityMedium')}</option>
              <option value="low">{t('tasks.priorityLow')}</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {t('tasks.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 active:scale-95"
          >
            {saving ? t('tasks.saving') : task ? t('tasks.save') : t('tasks.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
