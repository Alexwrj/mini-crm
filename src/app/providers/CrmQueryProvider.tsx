import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import { useAuth } from '@/features/auth/model/auth-context'

function SessionQueryProvider() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  useEffect(() => () => { void client.cancelQueries(); client.clear() }, [client])
  return <QueryClientProvider client={client}><Outlet /></QueryClientProvider>
}

export function CrmRoutes() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null
  return <SessionQueryProvider key={`${state.profile.id}:${state.profile.role}`} />
}
