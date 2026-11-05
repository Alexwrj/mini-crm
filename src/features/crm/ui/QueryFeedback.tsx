import { Button } from '@/components/ui/button'

export function QueryFeedback({ pending, error, retry }: { pending: boolean; error: Error | null; retry: () => void }) {
  if (pending) return <p role="status" className="my-4">Загрузка…</p>
  if (!error) return null
  return <div className="my-4 space-y-3"><p role="alert" className="text-destructive">{error.message}</p><Button variant="outline" onClick={retry}>Повторить запрос</Button></div>
}
