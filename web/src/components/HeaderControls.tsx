'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useI18n } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n/dictionaries'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { t } = useI18n()

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-8 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
  }

  function cycle() {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')
  }

  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️'
  const label =
    theme === 'dark' ? t('theme.dark') : theme === 'light' ? t('theme.light') : t('theme.system')

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      title={label}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function LanguageToggle() {
  const { locale, setLocale } = useI18n()

  function cycle() {
    setLocale(locale === 'en' ? 'es' : 'en')
  }

  return (
    <button
      onClick={cycle}
      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {locale === 'es' ? '🇪🇸 ES' : '🇬🇧 EN'}
    </button>
  )
}

export function LanguageSelect() {
  const { locale, setLocale } = useI18n()
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    >
      <option value="en">🇬🇧 English</option>
      <option value="es">🇪🇸 Español</option>
    </select>
  )
}
