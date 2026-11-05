import { useParams } from 'react-router'
import { Placeholder } from '../shared/ui/Placeholder'

export function ObjectPage() {
  const { objectId } = useParams()

  return (
    <Placeholder title="Карточка объекта">
      <p className="my-4 leading-[1.6]">Идентификатор из адреса: <code className="[overflow-wrap:anywhere]">{objectId}</code></p>
      <p className="my-4 leading-[1.6]">Здесь будут название, адрес и задачи объекта. Данные пока не загружаются.</p>
    </Placeholder>
  )
}
