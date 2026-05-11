'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { dictionaries, type Locale, type TranslationKey } from './dictionaries'

type I18nContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem('locale') as Locale | null
  if (stored && stored in dictionaries) return stored
  const browser = navigator.language.toLowerCase()
  if (browser.startsWith('es')) return 'es'
  return 'en'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLocaleState(detectInitialLocale())
    setMounted(true)
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', l)
    }
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>) {
    let str: string = dictionaries[locale][key] ?? dictionaries.en[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v))
      }
    }
    return str
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      <span suppressHydrationWarning>{mounted ? children : children}</span>
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
