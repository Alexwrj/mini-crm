import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getExecutors, reassignTask, type CrmTask } from '../api'
import { useTaskCommand } from '../workflow'
import { QueryFeedback } from './QueryFeedback'

export function ReassignTask({ task }: { task: CrmTask }) {
  const [open, setOpen] = useState(false)
  const [assignee, setAssignee] = useState(task.assignee_id)
  
  const executors = useQuery({ queryKey: ['crm', 'executors'], queryFn: getExecutors, enabled: open })
  const command = useTaskCommand(task.id, (id: string) => reassignTask(task.id, id), () => setOpen(false))

  return <section className="space-y-3">
    <Button variant="outline" disabled={command.busy} onClick={() => { command.reset(); setAssignee(task.assignee_id); setOpen(value => !value) }}>Переназначить исполнителя</Button>
    {open && <div className="space-y-3">
      {task.status === 'accepted' && <p role="note" className="rounded-md border bg-muted p-3 text-sm">При переназначении статус останется «Принята», а история переходов сохранится.</p>}
      <QueryFeedback pending={executors.isPending} error={executors.error} retry={() => void executors.refetch()} />
      {executors.isSuccess && <>
        <Label htmlFor="new-assignee">Новый исполнитель</Label>
        <Select value={assignee} onValueChange={setAssignee} disabled={command.busy}><SelectTrigger id="new-assignee" className="w-full"><SelectValue placeholder="Выберите исполнителя" /></SelectTrigger><SelectContent>{executors.data.map(person => <SelectItem key={person.id} value={person.id}>{person.email || person.id}</SelectItem>)}</SelectContent></Select>
        {!executors.data.length && <p>Нет доступных исполнителей.</p>}
        <Button disabled={command.busy || !executors.data.some(person => person.id === assignee)} onClick={() => { if (!command.busy) command.mutate(assignee) }}>{command.busy ? 'Сохраняем…' : 'Сохранить исполнителя'}</Button>
      </>}
    </div>}
    {command.error && <div className="space-y-2"><p role="alert" className="text-destructive">{command.error.message}</p><Button variant="outline" disabled={command.busy} onClick={() => void command.refresh()}>Обновить данные задачи</Button></div>}
  </section>
}
