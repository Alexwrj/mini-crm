import { useQuery } from '@tanstack/react-query'
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table'
import { getTaskHistory } from '../api'
import { statusLabels } from '../status'
import { useCrmIdentity } from '../query'
import { QueryFeedback } from './QueryFeedback'

export function TaskHistory({ taskId }: { taskId: string }) {
  const { userId } = useCrmIdentity()
  const history = useQuery({ queryKey: ['crm', 'history', taskId], queryFn: ({ signal }) => getTaskHistory(taskId, signal) })
  return <section className="min-w-0 space-y-3">
    <h2 className="text-lg font-semibold">История изменений</h2>
    <QueryFeedback pending={history.isPending} error={history.error} retry={() => void history.refetch()} />
    {history.isSuccess && (!history.data.length ? <p className="text-muted-foreground">История пока пуста.</p> : <Table>
      <TableHeader><TableRow><TableHead>Дата и время</TableHead><TableHead>Из статуса</TableHead><TableHead>В статус</TableHead><TableHead>Участник</TableHead><TableHead>Комментарий</TableHead></TableRow></TableHeader>
      <TableBody>{history.data.map(event => <TableRow key={event.id}>
        <TableCell>{new Date(event.created_at).toLocaleString('ru-RU')}</TableCell>
        <TableCell>{event.from_status ? statusLabels[event.from_status] : '—'}</TableCell><TableCell>{statusLabels[event.to_status]}</TableCell>
        <TableCell className="[overflow-wrap:anywhere]">{event.actor_email || event.actor_id}{event.actor_id === userId && ' (вы)'}</TableCell><TableCell className="min-w-40 whitespace-pre-wrap [overflow-wrap:anywhere]">{event.comment || '—'}</TableCell>
      </TableRow>)}</TableBody>
    </Table>)}
  </section>
}
