import { useState, type SubmitEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createObject, updateObject, type CrmObject, type ObjectInput } from '../api'
import { useCrmMutation } from '../query'

export function ObjectEditor({ object, onCreated }: { object?: CrmObject; onCreated?: (object: CrmObject) => void }) {
  const [open, setOpen] = useState(false)
  const mutation = useCrmMutation((input: ObjectInput) => object ? updateObject(object.id, input) : createObject(input), result => {
    setOpen(false)
    onCreated?.(result)
  })
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const data = new FormData(event.currentTarget)
    mutation.mutate({ name: String(data.get('name')).trim(), address: String(data.get('address')).trim() })
  }
  return <>
    <Button onClick={() => { mutation.reset(); setOpen(true) }}>{object ? 'Редактировать объект' : 'Создать объект'}</Button>
    <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value) }}>
      <DialogContent><DialogHeader><DialogTitle>{object ? 'Редактирование объекта' : 'Новый объект'}</DialogTitle><DialogDescription>Название и адрес строительного объекта.</DialogDescription></DialogHeader>
        {open && <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="object-name">Название</Label><Input id="object-name" name="name" defaultValue={object?.name} required disabled={mutation.isPending} /></div>
          <div className="space-y-2"><Label htmlFor="object-address">Адрес</Label><Input id="object-address" name="address" defaultValue={object?.address} required disabled={mutation.isPending} /></div>
          {mutation.error && <p role="alert" className="text-destructive">{mutation.error.message}</p>}
          <div className="flex flex-wrap gap-3"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Сохраняем…' : 'Сохранить'}</Button><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Отмена</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>
}
