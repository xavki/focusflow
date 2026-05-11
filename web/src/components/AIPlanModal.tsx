'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Priority } from '@/lib/types'
import { PRIORITY_COLORS } from '@/lib/types'
import { useI18n } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/dictionaries'

function priorityKey(p: Priority): TranslationKey {
  if (p === 'high') return 'tasks.priorityHigh'
  if (p === 'medium') return 'tasks.priorityMedium'
  return 'tasks.priorityLow'
}

type Suggested = {
  title: string
  description?: string
  due_date?: string
  priority?: Priority
}

type Step = 'input' | 'review'

export function AIPlanModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('input')
  const [prompt, setPrompt] = useState('')
  const [suggestions, setSuggestions] = useState<Suggested[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate plan')
      setSuggestions(data.tasks ?? [])
      setSelected(new Set((data.tasks ?? []).map((_: unknown, i: number) => i)))
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function toggle(i: number) {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  async function addAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = suggestions
      .filter((_, i) => selected.has(i))
      .map((s) => ({
        user_id: user.id,
        title: s.title,
        description: s.description ?? null,
        due_date: s.due_date ?? null,
        priority: s.priority ?? null,
      }))

    if (rows.length === 0) {
      onClose()
      return
    }

    setLoading(true)
    const { error } = await supabase.from('tasks').insert(rows)
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {t('ai.title')}
            </h3>
            <p className="text-xs text-zinc-500">
              {step === 'input'
                ? t('ai.intro')
                : t('ai.selected', { selected: selected.size, total: suggestions.length })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {step === 'input' && (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('ai.placeholder')}
              rows={5}
              autoFocus
              className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {t('tasks.cancel')}
              </button>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? t('ai.generating') : t('ai.generate')}
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {suggestions.map((s, i) => {
                const isSelected = selected.has(i)
                return (
                  <li
                    key={i}
                    onClick={() => toggle(i)}
                    className={`cursor-pointer rounded-lg border p-3 transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {s.priority && (
                            <span
                              className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[s.priority].dot}`}
                            />
                          )}
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {s.title}
                          </p>
                        </div>
                        {s.description && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {s.description}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          {s.due_date && (
                            <span className="text-xs text-zinc-500">
                              📅 {s.due_date}
                            </span>
                          )}
                          {s.priority && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_COLORS[s.priority].badge}`}
                            >
                              {t(priorityKey(s.priority))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-between gap-2">
              <button
                onClick={() => setStep('input')}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {t('ai.back')}
              </button>
              <button
                onClick={addAll}
                disabled={loading || selected.size === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading
                  ? t('ai.adding')
                  : t('ai.addCount', { count: selected.size, tasks: selected.size === 1 ? t('calendar.task') : t('calendar.tasks') })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
