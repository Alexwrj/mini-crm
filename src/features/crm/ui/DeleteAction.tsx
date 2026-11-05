import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useCrmMutation } from '../query'

export function DeleteAction({ label, description, remove, onRemoved }: { label: string; description: string; remove: () => Promise<void>; onRemoved: () => void }) {
  const [open, setOpen] = useState(false)
  const mutation = useCrmMutation(remove, () => { setOpen(false); onRemoved() })
  return <>
    <Button variant="destructive" onClick={() => { mutation.reset(); setOpen(true) }}>{label}</Button>
    <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value) }}>
      <DialogContent><DialogHeader><DialogTitle>Подтверждение удаления</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {mutation.error && <p role="alert" className="text-destructive">{mutation.error.message}</p>}
        <div className="flex flex-wrap gap-3"><Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate(undefined)}>{mutation.isPending ? 'Удаляем…' : 'Подтвердить удаление'}</Button><Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Отмена</Button></div>
      </DialogContent>
    </Dialog>
  </>
}
