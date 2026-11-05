import { Placeholder } from '../shared/ui/Placeholder'
import { useState, type SubmitEvent } from 'react'
import { Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth, homeForRole } from '@/features/auth/model/auth-context'
import { AuthStatus } from '@/features/auth/ui/AuthGate'

export function LoginPage() {
  const { state, signIn } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.status === 'loading' || state.status === 'error') return <AuthStatus />
  if (state.status === 'authenticated') return <Navigate to={homeForRole(state.profile.role)} replace />

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    setSubmitting(true)
    setError(null)
    const message = await signIn(String(data.get('email')), String(data.get('password')))
    setError(message)
    setSubmitting(false)
  }

  return (
    <Placeholder title="Вход">
      <form onSubmit={event => void submit(event)} className="max-w-sm space-y-4" aria-busy={submitting}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required disabled={submitting} />
        </div>
        {error && <p role="alert" className="text-sm leading-relaxed text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>{submitting ? 'Входим…' : 'Войти'}</Button>
      </form>
    </Placeholder>
  )
}
