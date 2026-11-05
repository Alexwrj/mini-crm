import { supabase } from '@/shared/api/supabase'

export type CrmObject = { id: string; name: string; address: string; created_at: string }
export type TaskStatus = 'new' | 'in_progress' | 'in_review' | 'accepted' | 'rework'
export type CrmTask = {
  id: string; object_id: string; assignee_id: string; author_id: string
  title: string; description: string | null; status: TaskStatus; created_at: string
}
export type Executor = { id: string; email: string }
export type ObjectInput = Pick<CrmObject, 'name' | 'address'>
export type TaskInput = Pick<CrmTask, 'title' | 'description'>

function client() {
  if (!supabase) throw new Error('Supabase не настроен.')
  return supabase
}

function fail(error: { code?: string; message: string }) {
  if (error.code === '23514') throw new Error('Проверьте обязательные поля и выбранного исполнителя.')
  if (error.code === '23503') throw new Error('Связанная запись удалена или не существует. Обновите страницу.')
  if (error.code === '42501') throw new Error('Недостаточно прав для этой операции.')
  throw new Error('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.')
}

const objectFields = 'id, name, address, created_at'
const taskFields = 'id, object_id, assignee_id, author_id, title, description, status, created_at'

export async function getObjects(signal?: AbortSignal): Promise<CrmObject[]> {
  const query = client().from('objects').select(objectFields).order('created_at', { ascending: false }).order('id')
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) fail(error)
  return data ?? []
}
export async function getObject(id: string, signal?: AbortSignal): Promise<CrmObject | null> {
  const query = client().from('objects').select(objectFields).eq('id', id)
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle()
  if (error) fail(error)
  return data
}
export async function getTasks(filter: { objectId?: string; assigneeId?: string }, signal?: AbortSignal): Promise<CrmTask[]> {
  let query = client().from('tasks').select(taskFields).order('created_at', { ascending: false }).order('id')
  if (filter.objectId) query = query.eq('object_id', filter.objectId)
  if (filter.assigneeId) query = query.eq('assignee_id', filter.assigneeId)
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) fail(error)
  return (data ?? []) as CrmTask[]
}
export async function getTask(id: string, signal?: AbortSignal): Promise<CrmTask | null> {
  const query = client().from('tasks').select(taskFields).eq('id', id)
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle()
  if (error) fail(error)
  return data as CrmTask | null
}
export async function getExecutors(): Promise<Executor[]> {
  const { data, error } = await client().rpc('list_executors')
  if (error) fail(error)
  return (data ?? []) as Executor[]
}
export async function createObject(input: ObjectInput): Promise<CrmObject> {
  const { data, error } = await client().from('objects').insert({ name: input.name, address: input.address }).select(objectFields).single()
  if (error) fail(error)
  return data!
}
export async function updateObject(id: string, input: ObjectInput): Promise<CrmObject> {
  const { data, error } = await client().from('objects').update({ name: input.name, address: input.address }).eq('id', id).select(objectFields).single()
  if (error) fail(error)
  return data!
}
export async function deleteObject(id: string) {
  const { data, error } = await client().from('objects').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Объект уже удалён или недоступен.')
}
export async function createTask(objectId: string, assigneeId: string, input: TaskInput): Promise<CrmTask> {
  const { data, error } = await client().rpc('create_task', {
    p_object_id: objectId, p_assignee_id: assigneeId, p_title: input.title, p_description: input.description,
  }).single()
  if (error) fail(error)
  return data as CrmTask
}
export async function updateTask(id: string, input: TaskInput): Promise<CrmTask> {
  const { data, error } = await client().from('tasks').update({ title: input.title, description: input.description }).eq('id', id).select(taskFields).single()
  if (error) fail(error)
  return data as CrmTask
}
export async function deleteTask(id: string) {
  const { data, error } = await client().from('tasks').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data?.length) throw new Error('Задача уже удалена или недоступна.')
}
