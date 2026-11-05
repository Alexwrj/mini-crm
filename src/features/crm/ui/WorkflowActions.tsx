import { useState, type SubmitEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { transitionTask, type CrmTask, type TaskStatus } from '../api'
import { useCrmIdentity } from '../query'
import { taskActions, useTaskCommand } from '../workflow'

export function WorkflowActions({ task }: { task: CrmTask }) {
  const identity = useCrmIdentity()
  const actions = taskActions(task, identity)
  const [returning, setReturning] = useState(false)
  const [comment, setComment] = useState('')
  const command = useTaskCommand(task.id, (input: { target: TaskStatus; comment: string | null }) =>
    transitionTask(task.id, input.target, input.comment), () => { setReturning(false); setComment('') })
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!command.busy && comment.trim() && actions.some(action => action.target === 'rework')) {
      command.mutate({ target: 'rework', comment: comment.trim() })
    }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3">{actions.map(action => <Button key={action.target} disabled={command.busy} onClick={() => {
      if (command.busy) return
      if (action.comment) { command.reset(); setReturning(true) }
      else command.mutate({ target: action.target, comment: null })
    }}>{command.busy ? 'Выполняем…' : action.label}</Button>)}</div>
    {returning && actions.some(action => action.comment) && <form onSubmit={submit} className="space-y-3">
      <Label htmlFor="rework-comment">Комментарий для доработки</Label>
      <textarea id="rework-comment" className="min-h-24 w-full rounded-md border border-input bg-background p-3 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" value={comment} onChange={event => setComment(event.target.value)} required disabled={command.busy} />
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={command.busy || !comment.trim()}>Подтвердить возврат</Button><Button type="button" variant="outline" disabled={command.busy} onClick={() => setReturning(false)}>Отмена</Button></div>
    </form>}
    {command.error && <div className="space-y-2"><p role="alert" className="text-destructive">{command.error.message}</p><Button variant="outline" disabled={command.busy} onClick={() => void command.refresh()}>Обновить данные задачи</Button></div>}
  </div>
}
