import { useQuery } from '@tanstack/react-query'
import { getTasks } from '@/features/crm/api'
import { useCrmIdentity } from '@/features/crm/query'
import { QueryFeedback } from '@/features/crm/ui/QueryFeedback'
import { TaskList } from '@/features/crm/ui/TaskList'
import { Placeholder } from '@/shared/ui/Placeholder'

export function MyTasksPage() {
  const { userId } = useCrmIdentity()
  const query = useQuery({ queryKey: ['crm', 'tasks', 'mine', userId], queryFn: ({ signal }) => getTasks({ assigneeId: userId }, signal) })
  return <Placeholder title="Мои задачи"><QueryFeedback pending={query.isPending} error={query.error} retry={() => void query.refetch()} />{query.isSuccess && <TaskList tasks={query.data} />}</Placeholder>
}
