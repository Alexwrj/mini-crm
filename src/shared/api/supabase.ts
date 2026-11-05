import { createClient } from '@supabase/supabase-js'

function configurationError(url: string | undefined, key: string | undefined) {
  if (!url?.trim() || !key?.trim()) {
    return 'Не настроен Supabase. Укажите VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в .env.local.'
  }
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    return 'VITE_SUPABASE_URL должен быть корректным HTTP(S)-адресом Supabase.'
  }
  if (key.startsWith('sb_publishable_')) return null
  // Legacy anon keys are public too. Never accept service_role/secret keys.
  try {
    const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    if (claims.role === 'anon') return null
  } catch { /* Show a safe message, never the supplied key. */ }
  return 'Используйте только публичный publishable/anon-ключ Supabase. Секретные ключи в браузере запрещены.'
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabaseConfigurationError = configurationError(url, key)
export const supabase = supabaseConfigurationError ? null : createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: {
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(init?.signal ? [init.signal] : [])]),
    }),
  },
})
