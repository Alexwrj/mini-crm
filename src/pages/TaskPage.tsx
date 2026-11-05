import { useParams } from 'react-router'
import { Placeholder } from '../shared/ui/Placeholder'

export function TaskPage() {
  const { taskId } = useParams()

  return (
    <Placeholder title="Карточка задачи">
      <p className="my-4 leading-[1.6]">Идентификатор из адреса: <code className="[overflow-wrap:anywhere]">{taskId}</code></p>
      <p className="my-4 leading-[1.6]">Здесь будут данные задачи, доступные действия и история статусов.</p>
    </Placeholder>
  )
}
