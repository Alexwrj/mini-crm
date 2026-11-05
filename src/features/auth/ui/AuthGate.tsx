import { Navigate, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth, homeForRole } from '../model/auth-context'

export function AuthStatus() {
  const { state, retry, signOut } = useAuth()
  if (state.status === 'loading') return <p role="status" className="my-4 leading-[1.6]">Восстанавливаем сессию…</p>
  if (state.status !== 'error') return null
  return (
    <div className="space-y-4">
      <p role="alert" className="text-destructive">{state.message}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={retry}>Повторить</Button>
        {state.session && <Button variant="outline" onClick={() => void signOut()}>Выйти</Button>}
      </div>
    </div>
  )
}

export function ProtectedRoutes() {
  const { state } = useAuth()
  if (state.status === 'loading' || state.status === 'error') return <AuthStatus />
  return state.status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />
}

export function HomeRedirect() {
  const { state } = useAuth()
  if (state.status === 'loading' || state.status === 'error') return <AuthStatus />
  return <Navigate to={state.status === 'authenticated' ? homeForRole(state.profile.role) : '/login'} replace />
}
