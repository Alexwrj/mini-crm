import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { deleteObject, getObject, getTasks } from '@/features/crm/api'
import { useCrmIdentity } from '@/features/crm/query'
import { ObjectEditor } from '@/features/crm/ui/ObjectEditor'
import { TaskEditor } from '@/features/crm/ui/TaskEditor'
import { DeleteAction } from '@/features/crm/ui/DeleteAction'
import { QueryFeedback } from '@/features/crm/ui/QueryFeedback'
import { TaskList } from '@/features/crm/ui/TaskList'
import { Placeholder } from '@/shared/ui/Placeholder'

export function ObjectPage() {
  const objectId = useParams().objectId!
  const { manager } = useCrmIdentity()
  const navigate = useNavigate()
  const object = useQuery({ queryKey: ['crm', 'object', objectId], queryFn: ({ signal }) => getObject(objectId, signal) })
  const tasks = useQuery({ queryKey: ['crm', 'tasks', 'object', objectId], queryFn: ({ signal }) => getTasks({ objectId }, signal), enabled: Boolean(object.data) })
  return <Placeholder title="Карточка объекта">
    <QueryFeedback pending={object.isPending} error={object.error} retry={() => void object.refetch()} />
    {object.isSuccess && !object.data && <p className="my-4">Объект не найден или недоступен.</p>}
    {object.data && <div className="space-y-4">
      <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{object.data.name}</h2><p className="[overflow-wrap:anywhere]">{object.data.address}</p>
      {manager && <div className="flex flex-wrap gap-3"><ObjectEditor object={object.data} /><DeleteAction label="Удалить объект" description="Объект, все его задачи и их история будут удалены без возможности восстановления." remove={() => deleteObject(objectId)} onRemoved={() => navigate('/objects', { replace: true })} /></div>}
      <h2 className="text-lg font-semibold">Задачи объекта</h2>
      {manager && <TaskEditor objectId={objectId} onCreated={task => navigate(`/tasks/${task.id}`)} />}
      <QueryFeedback pending={tasks.isPending} error={tasks.error} retry={() => void tasks.refetch()} />
      {tasks.isSuccess && <TaskList tasks={tasks.data} />}
    </div>}
  </Placeholder>
}
