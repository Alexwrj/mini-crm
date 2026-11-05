import { Link } from 'react-router'
import { Placeholder } from '../shared/ui/Placeholder'

export function NotFoundPage() {
  return (
    <Placeholder title="Страница не найдена">
      <p className="my-4 leading-[1.6]">Такого экрана нет. <Link className="text-primary underline underline-offset-[3px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/objects">Перейти к объектам</Link>.</p>
    </Placeholder>
  )
}
