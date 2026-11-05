import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { deleteTask, getTask } from '@/features/crm/api'
import { useCrmIdentity } from '@/features/crm/query'
import { statusLabels } from '@/features/crm/status'
import { TaskEditor } from '@/features/crm/ui/TaskEditor'
import { DeleteAction } from '@/features/crm/ui/DeleteAction'
import { QueryFeedback } from '@/features/crm/ui/QueryFeedback'
import { Placeholder } from '@/shared/ui/Placeholder'

export function TaskPage() {
  const taskId = useParams().taskId!
  const { manager, userId } = useCrmIdentity()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['crm', 'task', taskId], queryFn: ({ signal }) => getTask(taskId, signal) })
  const task = query.data
  return <Placeholder title="Карточка задачи">
    <QueryFeedback pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    {query.isSuccess && !task && <p className="my-4">Задача не найдена или недоступна.</p>}
    {task && <div className="space-y-4">
      <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{task.title}</h2><Badge variant="secondary">{statusLabels[task.status]}</Badge>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{task.description || 'Описание не добавлено.'}</p>
      <dl className="space-y-2 text-sm [overflow-wrap:anywhere]"><div><dt className="font-semibold">Автор</dt><dd>{task.author_id}{task.author_id === userId && ' (вы)'}</dd></div><div><dt className="font-semibold">Исполнитель</dt><dd>{task.assignee_id}{task.assignee_id === userId && ' (вы)'}</dd></div><div><dt className="font-semibold">Создана</dt><dd>{new Date(task.created_at).toLocaleString('ru-RU')}</dd></div></dl>
      <Link className="inline-block text-primary underline" to={`/objects/${task.object_id}`}>К объекту</Link>
      {manager && <div className="flex flex-wrap gap-3"><TaskEditor task={task} objectId={task.object_id} /><DeleteAction label="Удалить задачу" description="Задача и её история будут удалены без возможности восстановления." remove={() => deleteTask(task.id)} onRemoved={() => navigate(`/objects/${task.object_id}`, { replace: true })} /></div>}
    </div>}
  </Placeholder>
}
