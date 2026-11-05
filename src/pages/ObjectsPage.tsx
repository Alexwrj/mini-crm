import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { getObjects } from '@/features/crm/api'
import { useCrmIdentity } from '@/features/crm/query'
import { ObjectEditor } from '@/features/crm/ui/ObjectEditor'
import { QueryFeedback } from '@/features/crm/ui/QueryFeedback'
import { Placeholder } from '@/shared/ui/Placeholder'

export function ObjectsPage() {
  const { manager } = useCrmIdentity()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['crm', 'objects'], queryFn: ({ signal }) => getObjects(signal) })
  return <Placeholder title="Объекты">
    {manager && <ObjectEditor onCreated={object => navigate(`/objects/${object.id}`)} />}
    <QueryFeedback pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    {query.isSuccess && (!query.data.length ? <p className="my-4 text-muted-foreground">Доступных объектов пока нет.</p> : <ul className="my-4 divide-y rounded-lg border">{query.data.map(object => <li key={object.id} className="space-y-2 p-4">
      <Link className="text-primary underline [overflow-wrap:anywhere]" to={`/objects/${object.id}`}>{object.name}</Link><p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{object.address}</p>
    </li>)}</ul>)}
  </Placeholder>
}
