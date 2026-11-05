import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/model/auth-context'

export function useCrmIdentity() {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('Authenticated route required')
  return { userId: state.profile.id, manager: state.profile.role === 'manager' }
}

export function useCrmMutation<TVariables, TResult>(action: (input: TVariables) => Promise<TResult>, onSaved?: (result: TResult) => void) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: action,
    onSuccess: async result => {
      await cache.invalidateQueries({ queryKey: ['crm'] })
      onSaved?.(result)
    },
  })
}
