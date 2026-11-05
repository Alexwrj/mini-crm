import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CrmTask, TaskStatus } from './api'

type Action = { target: TaskStatus; label: string; comment?: boolean }

export function taskActions(task: CrmTask, identity: { manager: boolean; userId: string }): Action[] {
  if (identity.manager) return task.status === 'in_review' ? [
    { target: 'accepted', label: 'Принять' }, { target: 'rework', label: 'Вернуть на доработку', comment: true },
  ] : []
  if (task.assignee_id !== identity.userId) return []
  if (task.status === 'new') return [{ target: 'in_progress', label: 'Взять в работу' }]
  if (task.status === 'in_progress') return [{ target: 'in_review', label: 'Отправить на проверку' }]
  if (task.status === 'rework') return [{ target: 'in_progress', label: 'Вернуть в работу' }]
  return []
}

export function useTaskCommand<T>(taskId: string, action: (input: T) => Promise<CrmTask>, saved?: (task: CrmTask) => void) {
  const cache = useQueryClient()
  const key = ['crm', 'task-command', taskId]
  const running = useIsMutating({ mutationKey: key })
  const refresh = () => cache.invalidateQueries({ queryKey: ['crm'] })
  const mutation = useMutation({
    mutationKey: key, mutationFn: action, retry: false,
    onSuccess: async task => { await refresh(); saved?.(task) },
    // Refresh status/visibility/history after conflicts, never replay the command.
    onError: async () => { await refresh() },
  })
  return { ...mutation, busy: mutation.isPending || running > 0, refresh }
}
