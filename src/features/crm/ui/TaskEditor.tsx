import { useState, type SubmitEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createTask, updateTask, getExecutors, type CrmTask, type TaskInput } from '../api'
import { useCrmMutation } from '../query'
import { QueryFeedback } from './QueryFeedback'

export function TaskEditor({ objectId, task, onCreated }: { objectId: string; task?: CrmTask; onCreated?: (task: CrmTask) => void }) {
  const [open, setOpen] = useState(false)
  const executors = useQuery({ queryKey: ['crm', 'executors'], queryFn: getExecutors, enabled: open && !task })
  const mutation = useCrmMutation((input: TaskInput & { assigneeId: string }) => task
    ? updateTask(task.id, input)
    : createTask(objectId, input.assigneeId, input), result => { setOpen(false); onCreated?.(result) })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const data = new FormData(event.currentTarget)
    mutation.mutate({ title: String(data.get('title')).trim(), description: String(data.get('description') || ''), assigneeId: String(data.get('assignee') || '') })
  }
  
  return <>
    <Button onClick={() => { mutation.reset(); setOpen(true) }}>{task ? 'Редактировать задачу' : 'Создать задачу'}</Button>
    <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value) }}>
      <DialogContent><DialogHeader><DialogTitle>{task ? 'Редактирование задачи' : 'Новая задача'}</DialogTitle><DialogDescription>{task ? 'Можно изменить название и описание.' : 'Выберите исполнителя. Начальный статус и автор определяются сервером.'}</DialogDescription></DialogHeader>
        {open && <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="task-title">Название</Label><Input id="task-title" name="title" defaultValue={task?.title} required disabled={mutation.isPending} /></div>
          <div className="space-y-2"><Label htmlFor="task-description">Описание</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" id="task-description" name="description" defaultValue={task?.description ?? ''} disabled={mutation.isPending} /></div>
          {!task && <div className="space-y-2"><Label htmlFor="task-assignee">Исполнитель</Label>
            <QueryFeedback pending={executors.isPending} error={executors.error} retry={() => void executors.refetch()} />
            {executors.isSuccess && (!executors.data.length ? <p>Нет исполнителей. Обратитесь к администратору.</p> : <Select name="assignee" required disabled={mutation.isPending}>
              <SelectTrigger id="task-assignee" className="w-full"><SelectValue placeholder="Выберите исполнителя" /></SelectTrigger>
              <SelectContent>{executors.data.map(person => <SelectItem key={person.id} value={person.id}>{person.email || person.id}</SelectItem>)}</SelectContent>
            </Select>)}
          </div>}
          {mutation.error && <p role="alert" className="text-destructive">{mutation.error.message}</p>}
          <div className="flex flex-wrap gap-3"><Button type="submit" disabled={mutation.isPending || (!task && (!executors.isSuccess || !executors.data.length))}>{mutation.isPending ? 'Сохраняем…' : 'Сохранить'}</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Отмена</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>
}
