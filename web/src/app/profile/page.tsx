'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { NavTabs } from '@/components/NavTabs'
import { ThemeToggle, LanguageSelect } from '@/components/HeaderControls'
import { useI18n } from '@/lib/i18n/context'
import { useTheme } from 'next-themes'

export default function ProfilePage() {
  const router = useRouter()
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/login')
        return
      }
      setEmail(user.email ?? null)
      setLoading(false)
    })
  }, [router])

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    if (newPassword !== confirmPassword) {
      setError(t('profile.passwordMismatch'))
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setMessage(t('profile.passwordChanged'))
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t('profile.title')}
        </h2>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t('profile.account')}
          </h3>
          <p className="mt-2 text-lg text-zinc-900 dark:text-zinc-50">{email}</p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t('profile.preferences')}
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500">
                {t('profile.language')}
              </label>
              <div className="mt-1">
                <LanguageSelect />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">{t('profile.theme')}</label>
              <div className="mt-1 inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                {([
                  { value: 'system', key: 'theme.system' },
                  { value: 'light', key: 'theme.light' },
                  { value: 'dark', key: 'theme.dark' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      theme === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {t(opt.key)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {t('profile.changePassword')}
          </h3>
          <form onSubmit={updatePassword} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500">
                {t('profile.newPassword')}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">
                {t('profile.confirmPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? t('tasks.saving') : t('profile.updatePassword')}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-red-200 bg-red-50/50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            {t('profile.dangerZone')}
          </h3>
          <button
            onClick={handleLogout}
            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:border-red-800 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {t('auth.signOut')}
          </button>
        </section>
      </main>
    </div>
  )
}
