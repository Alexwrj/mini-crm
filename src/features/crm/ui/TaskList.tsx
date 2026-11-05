import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import type { CrmTask } from '../api'
import { statusLabels } from '../status'

export function TaskList({ tasks }: { tasks: CrmTask[] }) {
  if (!tasks.length) return <p className="my-4 text-muted-foreground">Задач пока нет.</p>
  return <ul className="my-4 divide-y rounded-lg border">{tasks.map(task => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
    <Link className="min-w-0 text-primary underline [overflow-wrap:anywhere]" to={`/tasks/${task.id}`}>{task.title}</Link>
    <Badge variant="secondary">{statusLabels[task.status]}</Badge>
  </li>)}</ul>
}
