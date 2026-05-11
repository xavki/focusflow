'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/lib/types'
import { todayISO } from '@/lib/dates'
import { NavTabs } from '@/components/NavTabs'
import { ThemeToggle } from '@/components/HeaderControls'
import { useI18n } from '@/lib/i18n/context'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export default function CalendarPage() {
  const router = useRouter()
  const { t, locale } = useI18n()
  const WEEK_DAYS = [
    t('calendar.weekday.0'),
    t('calendar.weekday.1'),
    t('calendar.weekday.2'),
    t('calendar.weekday.3'),
    t('calendar.weekday.4'),
    t('calendar.weekday.5'),
    t('calendar.weekday.6'),
  ]
  const MONTHS = [
    t('calendar.month.0'),
    t('calendar.month.1'),
    t('calendar.month.2'),
    t('calendar.month.3'),
    t('calendar.month.4'),
    t('calendar.month.5'),
    t('calendar.month.6'),
    t('calendar.month.7'),
    t('calendar.month.8'),
    t('calendar.month.9'),
    t('calendar.month.10'),
    t('calendar.month.11'),
  ]
  const [email, setEmail] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

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
        .channel(`calendar-tasks-${Math.random().toString(36).slice(2)}`)
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
                prev.some((t) => t.id === row.id) ? prev : [...prev, row]
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
    const { data, error } = await supabase.from('tasks').select('*')
    if (error) {
      setError(error.message)
      return
    }
    setTasks(data ?? [])
  }

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due_date) continue
      const arr = map.get(t.due_date) ?? []
      arr.push(t)
      map.set(t.due_date, arr)
    }
    return map
  }, [tasks])

  const grid = useMemo(() => buildGrid(year, month), [year, month])

  function goPrev() {
    if (month === 0) {
      setYear(year - 1)
      setMonth(11)
    } else {
      setMonth(month - 1)
    }
  }

  function goNext() {
    if (month === 11) {
      setYear(year + 1)
      setMonth(0)
    } else {
      setMonth(month + 1)
    }
  }

  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
    setSelectedDay(todayISO())
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

  const today = todayISO()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {t('calendar.todayBtn')}
            </button>
            <button
              onClick={goPrev}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              onClick={goNext}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800">
          {WEEK_DAYS.map((d) => (
            <div
              key={d}
              className="bg-zinc-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
            >
              {d}
            </div>
          ))}

          {grid.map((cell, i) => {
            const iso = cell.iso
            const dayTasks = tasksByDate.get(iso) ?? []
            const isToday = iso === today
            const isOther = !cell.inMonth
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(iso)}
                className={`min-h-[96px] bg-white px-2 py-1.5 text-left transition hover:bg-indigo-50 dark:bg-zinc-950 dark:hover:bg-indigo-950/30 ${
                  isOther ? 'opacity-40' : ''
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {cell.day}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => {
                    let bg = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                    if (t.completed) {
                      bg = 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-900'
                    } else if (t.priority === 'high') {
                      bg = 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                    } else if (t.priority === 'medium') {
                      bg = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    } else if (t.priority === 'low') {
                      bg = 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
                    }
                    return (
                      <div
                        key={t.id}
                        className={`truncate rounded px-1.5 py-0.5 text-[11px] ${bg}`}
                      >
                        {t.title}
                      </div>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <div className="px-1.5 text-[10px] text-zinc-500">
                      {t('calendar.moreCount', { count: dayTasks.length - 3 })}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </main>

      {selectedDay && (
        <DayModal
          iso={selectedDay}
          tasks={tasksByDate.get(selectedDay) ?? []}
          onClose={() => setSelectedDay(null)}
          onError={setError}
          locale={locale}
        />
      )}
    </div>
  )
}

type GridCell = { day: number; iso: string; inMonth: boolean }

function buildGrid(year: number, month: number): GridCell[] {
  const first = new Date(year, month, 1)
  const firstWeekday = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: GridCell[] = []

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    cells.push({ day, iso: toIso(prevYear, prevMonth, day), inMonth: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: toIso(year, month, d), inMonth: true })
  }

  let next = 1
  while (cells.length < 42) {
    const nextMonth = month === 11 ? 0 : month + 1
    const nextYear = month === 11 ? year + 1 : year
    cells.push({ day: next, iso: toIso(nextYear, nextMonth, next), inMonth: false })
    next++
  }

  return cells
}

function DayModal({
  iso,
  tasks,
  onClose,
  onError,
  locale,
}: {
  iso: string
  tasks: Task[]
  onClose: () => void
  onError: (msg: string) => void
  locale: string
}) {
  const { t } = useI18n()
  const [newTitle, setNewTitle] = useState('')

  const niceDate = new Date(iso + 'T00:00:00').toLocaleDateString(
    locale === 'es' ? 'es-ES' : 'en-US',
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }
  )

  async function addForDay(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('tasks')
      .insert({ title, user_id: user.id, due_date: iso })
    if (error) {
      onError(error.message)
      return
    }
    setNewTitle('')
  }

  async function toggle(t: Task) {
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !t.completed })
      .eq('id', t.id)
    if (error) onError(error.message)
  }

  async function remove(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) onError(error.message)
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {niceDate}
            </h3>
            <p className="text-sm text-zinc-500">
              {tasks.length} {tasks.length === 1 ? t('calendar.task') : t('calendar.tasks')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={addForDay} className="mt-4 flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('calendar.addForDay')}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95"
          >
            {t('tasks.add')}
          </button>
        </form>

        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {tasks.length === 0 && (
            <li className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              {t('calendar.noTasksDay')}
            </li>
          )}

          {tasks.map((task) => (
            <li
              key={task.id}
              className="group flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggle(task)}
                className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span
                className={`flex-1 text-sm ${
                  task.completed
                    ? 'text-zinc-400 line-through'
                    : 'text-zinc-900 dark:text-zinc-50'
                }`}
              >
                {task.title}
              </span>
              <button
                onClick={() => remove(task.id)}
                className="text-xs text-zinc-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
              >
                {t('tasks.delete')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
