import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { supabase, supabaseConfigurationError } from '@/shared/api/supabase'
import { AuthContext, type AuthState } from '@/features/auth/model/auth-context'
import { loadProfile } from '@/features/auth/api/profile'

export function AuthProvider({ children, client = supabase }: { children: ReactNode; client?: SupabaseClient | null }) {
  const [state, setState] = useState<AuthState>(() => client ? { status: 'loading' } : {
    status: 'error', session: null, message: supabaseConfigurationError ?? 'Supabase не настроен.',
  })
  const [attempt, setAttempt] = useState(0)
  const active = useRef(true)
  const receiveSession = useRef<(session: Session | null) => void>(() => {})

  useEffect(() => {
    active.current = true
    let alive = true
    let revision = 0
    let eventSeen = false
    let request: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    function receive(session: Session | null) {
      const currentRevision = ++revision
      request?.abort()
      clearTimeout(timer)
      if (!alive) return
      if (!session) {
        setState({ status: 'anonymous' })
        return
      }
      setState({ status: 'loading' })
      // Never make Supabase API calls inside the auth event callback/lock.
      timer = setTimeout(() => {
        request = new AbortController()
        void loadProfile(client!, session.user.id, request.signal).then(
          profile => {
            if (alive && revision === currentRevision) setState({ status: 'authenticated', session, profile })
          },
          error => {
            if (alive && revision === currentRevision) setState({
              status: 'error', session,
              message: error instanceof Error ? error.message : 'Не удалось загрузить профиль.',
            })
          },
        )
      }, 0)
    }
    receiveSession.current = receive

    if (!client) {
      return () => { alive = false; active.current = false }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      eventSeen = true
      receive(session)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (!alive || eventSeen) return
      if (error) {
        setState({ status: 'error', session: null, message: 'Не удалось восстановить сессию. Проверьте соединение.' })
      } else receive(data.session)
    }).catch(() => {
      if (alive && !eventSeen) setState({ status: 'error', session: null, message: 'Не удалось восстановить сессию. Проверьте соединение.' })
    })

    return () => {
      alive = false
      active.current = false
      revision++
      request?.abort()
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [client, attempt])

  async function signIn(email: string, password: string) {
    if (!client) return supabaseConfigurationError ?? 'Supabase не настроен.'
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (!error) return null
      if (error.code === 'invalid_credentials') return 'Неверный email или пароль.'
      if (error.status === 0 || error.name === 'AuthRetryableFetchError') return 'Нет соединения с сервером. Проверьте подключение.'
      if (error.status === 429) return 'Слишком много попыток входа. Попробуйте позже.'
      return 'Не удалось войти. Проверьте данные и попробуйте ещё раз.'
    } catch {
      return 'Нет соединения с сервером. Проверьте подключение.'
    }
  }

  async function signOut() {
    if (!client) return
    const session = state.status === 'authenticated' || state.status === 'error' ? state.session : null
    // Immediately block routes and invalidate any in-flight profile response.
    receiveSession.current(null)
    setState({ status: 'loading' })
    try {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw error
      if (active.current) receiveSession.current(null)
    } catch {
      if (active.current) setState({ status: 'error', session, message: 'Не удалось выйти. Проверьте соединение и повторите выход.' })
    }
  }

  return <AuthContext value={{ state, signIn, signOut, retry: () => {
    if (client) setState({ status: 'loading' })
    setAttempt(value => value + 1)
  } }}>{children}</AuthContext>
}
