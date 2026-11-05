import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { seedAuthUsers } from './seed-auth-users.mjs'

const local = await seedAuthUsers()
let passed = 0
function check(condition, label) { assert.ok(condition, label); console.log(`PASS: ${label}`); passed++ }
const clients = []
for (const account of local.accounts) {
  const client = createClient(local.url, local.publicKey, local.options)
  const result = await client.auth.signInWithPassword({ email: account.email, password: account.password })
  check(!result.error && Boolean(result.data.session), `${account.email}: real JWT login`)
  clients.push(client)
}
const [manager, a, b] = clients
const [managerUser, aUser, bUser] = local.accounts
const anon = createClient(local.url, local.publicKey, local.options)
const objectIds = []
const taskIds = []
async function object(name) {
  const result = await manager.from('objects').insert({ name: `CRUD-${randomUUID()}-${name}`, address: 'Тестовый адрес' }).select().single()
  check(!result.error && Boolean(result.data?.id), `manager creates object ${name}`)
  objectIds.push(result.data.id)
  return result.data
}
async function task(objectId, assignee, title) {
  const result = await manager.rpc('create_task', { p_object_id: objectId, p_assignee_id: assignee, p_title: title, p_description: 'Описание' }).single()
  check(!result.error && result.data?.author_id === managerUser.id && result.data?.status === 'new', `server creates task ${title} with manager author/new status`)
  taskIds.push(result.data.id)
  return result.data
}
function denied(result) { return Boolean(result.error) || (Array.isArray(result.data) && result.data.length === 0) }

try {
  const shared = await object('shared')
  const onlyA = await object('A')
  const onlyB = await object('B')
  const empty = await object('empty')
  const taskA = await task(shared.id, aUser.id, 'Общая / A')
  const taskB = await task(shared.id, bUser.id, 'Общая / B')
  const taskOnlyA = await task(onlyA.id, aUser.id, 'Только A')
  const taskOnlyB = await task(onlyB.id, bUser.id, 'Только B')

  const allObjects = await manager.from('objects').select('id')
  const allTasks = await manager.from('tasks').select('id')
  check(!allObjects.error && objectIds.every(id => allObjects.data.some(row => row.id === id)), 'manager reads all objects without recursive RLS')
  check(!allTasks.error && taskIds.every(id => allTasks.data.some(row => row.id === id)), 'manager reads all tasks')
  for (const [client, account, otherTask, foreignObject] of [[a, aUser, taskB, onlyB], [b, bUser, taskA, onlyA]]) {
    const tasks = await client.from('tasks').select('*')
    check(!tasks.error && tasks.data.length >= 2 && tasks.data.every(row => row.assignee_id === account.id), `${account.email}: sees only assigned tasks`)
    check(!(await client.from('tasks').select('*').eq('id', otherTask.id)).data?.length, `${account.email}: foreign task by ID invisible`)
    const visibleObjects = await client.from('objects').select('id')
    check(!visibleObjects.error && visibleObjects.data.some(row => row.id === shared.id), `${account.email}: assigned shared object visible`)
    check(!visibleObjects.error && !visibleObjects.data.some(row => [foreignObject.id, empty.id].includes(row.id)), `${account.email}: objects without own tasks invisible`)
    check(!(await client.from('objects').select('*').eq('id', foreignObject.id)).data?.length, `${account.email}: foreign object by ID invisible`)
    check(Boolean((await client.from('objects').insert({ name: 'Forbidden', address: 'Forbidden' })).error), `${account.email}: object creation denied`)
    check(denied(await client.from('objects').update({ name: 'Forbidden' }).eq('id', shared.id).select('id')), `${account.email}: object update denied`)
    check(denied(await client.from('objects').delete().eq('id', shared.id).select('id')), `${account.email}: object delete denied`)
    check(Boolean((await client.rpc('create_task', { p_object_id: shared.id, p_assignee_id: account.id, p_title: 'Forbidden' })).error), `${account.email}: task RPC creation denied`)
    check(Boolean((await client.from('tasks').insert({ object_id: shared.id, assignee_id: account.id, title: 'Forbidden' })).error), `${account.email}: direct task insert denied`)
    const ownTask = account.id === aUser.id ? taskA : taskB
    check(denied(await client.from('tasks').update({ title: 'Forbidden' }).eq('id', ownTask.id).select('id')), `${account.email}: own task update denied`)
    check(denied(await client.from('tasks').delete().eq('id', ownTask.id).select('id')), `${account.email}: own task delete denied`)
    check(Boolean((await client.rpc('list_executors')).error), `${account.email}: executor directory RPC denied`)
    check(Boolean((await client.from('profiles').update({ role: 'manager' }).eq('id', account.id)).error), `${account.email}: own role update denied`)
  }

  const executors = await manager.rpc('list_executors')
  check(!executors.error && [aUser.id, bUser.id].every(id => executors.data.some(row => row.id === id))
    && !executors.data.some(row => row.id === managerUser.id), 'manager can list only executor IDs/emails')
  check((await manager.from('profiles').select('id,role')).data?.length === 1, 'profiles self-only RLS remains unchanged')

  const updatedObject = await manager.from('objects').update({ name: 'Обновлённый объект', address: 'Новый адрес' }).eq('id', shared.id).select().single()
  check(!updatedObject.error && updatedObject.data.name === 'Обновлённый объект', 'manager edits object fields')
  const updatedTask = await manager.from('tasks').update({ title: 'Обновлённая задача', description: 'Новое описание' }).eq('id', taskA.id).select().single()
  check(!updatedTask.error && updatedTask.data.title === 'Обновлённая задача', 'manager edits task fields')

  for (const [column, value] of Object.entries({ status: 'in_progress', author_id: bUser.id, assignee_id: bUser.id, object_id: onlyB.id, id: randomUUID(), created_at: '2000-01-01T00:00:00Z' })) {
    check(Boolean((await manager.from('tasks').update({ [column]: value }).eq('id', taskA.id)).error), `manager direct PATCH ${column} denied`)
  }
  for (const column of ['id', 'created_at']) {
    check(Boolean((await manager.from('objects').update({ [column]: column === 'id' ? randomUUID() : '2000-01-01T00:00:00Z' }).eq('id', shared.id)).error), `object service field ${column} update denied`)
  }
  check(Boolean((await manager.from('tasks').insert({ object_id: shared.id, assignee_id: aUser.id, author_id: bUser.id, title: 'Forged', status: 'accepted' })).error), 'direct INSERT cannot forge author/status')
  check(Boolean((await manager.rpc('create_task', { p_object_id: shared.id, p_assignee_id: aUser.id, p_title: 'Forged', p_author_id: bUser.id })).error), 'RPC rejects browser-supplied author parameter')
  check(Boolean((await manager.rpc('create_task', { p_object_id: shared.id, p_assignee_id: aUser.id, p_title: 'Forged', p_status: 'accepted' })).error), 'RPC rejects browser-supplied status parameter')
  check(Boolean((await manager.rpc('create_task', { p_object_id: shared.id, p_assignee_id: managerUser.id, p_title: 'Wrong assignee' })).error), 'manager cannot assign manager as executor')
  check(Boolean((await manager.rpc('create_task', { p_object_id: shared.id, p_assignee_id: randomUUID(), p_title: 'Missing assignee' })).error), 'nonexistent executor rejected')
  check(Boolean((await manager.rpc('create_task', { p_object_id: randomUUID(), p_assignee_id: aUser.id, p_title: 'Missing object' })).error), 'nonexistent object rejected')
  check(Boolean((await manager.rpc('create_task', { p_object_id: shared.id, p_assignee_id: aUser.id, p_title: '  ' })).error), 'blank task title rejected by database')
  check(Boolean((await manager.from('objects').insert({ name: ' ', address: ' ' })).error), 'blank object fields rejected')

  await a.auth.updateUser({ data: { role: 'manager' } })
  check(Boolean((await a.rpc('create_task', { p_object_id: shared.id, p_assignee_id: aUser.id, p_title: 'Escalation' })).error), 'editable JWT user metadata cannot elevate executor')

  for (const client of [manager, a, b, anon]) {
    check(Boolean((await client.from('task_status_history').insert({ task_id: taskA.id, actor_id: managerUser.id, to_status: 'new' })).error), 'history INSERT denied')
    check(Boolean((await client.from('task_status_history').update({ to_status: 'accepted' }).eq('task_id', taskA.id)).error), 'history UPDATE denied')
    check(Boolean((await client.from('task_status_history').delete().eq('task_id', taskA.id)).error), 'history DELETE denied')
  }
  for (const table of ['objects', 'tasks', 'task_status_history']) {
    check(Boolean((await anon.from(table).select('*')).error), `anonymous ${table} read denied`)
  }
  check(Boolean((await anon.rpc('create_task', { p_object_id: shared.id, p_assignee_id: aUser.id, p_title: 'Anon' })).error), 'anonymous task RPC denied')
  check(Boolean((await anon.rpc('list_executors')).error), 'anonymous directory RPC denied')

  // Admin creates audit fixtures only. No workflow/history API is introduced.
  const historyFixture = await local.admin.from('task_status_history').insert([
    { task_id: taskA.id, actor_id: managerUser.id, to_status: 'new' },
    { task_id: taskB.id, actor_id: managerUser.id, to_status: 'new' },
    { task_id: taskOnlyA.id, actor_id: managerUser.id, to_status: 'new' },
  ])
  check(!historyFixture.error, 'admin-only history fixtures created for cascade test')
  const removedTask = await manager.from('tasks').delete().eq('id', taskOnlyA.id).select('id')
  check(!removedTask.error && removedTask.data.length === 1, 'manager deletes task')
  const deletedHistory = await local.admin.from('task_status_history').select('id').eq('task_id', taskOnlyA.id)
  check(!deletedHistory.error && deletedHistory.data.length === 0, 'task deletion cascades history')
  const removedObject = await manager.from('objects').delete().eq('id', shared.id).select('id')
  check(!removedObject.error && removedObject.data.length === 1, 'manager deletes object')
  const cascadeTasks = await local.admin.from('tasks').select('id').in('id', [taskA.id, taskB.id])
  const cascadeHistory = await local.admin.from('task_status_history').select('id').in('task_id', [taskA.id, taskB.id])
  check(!cascadeTasks.error && cascadeTasks.data.length === 0, 'object deletion cascades tasks')
  check(!cascadeHistory.error && cascadeHistory.data.length === 0, 'object deletion cascades task history')
  const unaffected = await b.from('tasks').select('id').eq('id', taskOnlyB.id)
  check(!unaffected.error && unaffected.data.length === 1, 'unrelated object/task remains intact')
  const lostObject = await a.from('objects').select('id').eq('id', onlyA.id)
  check(!lostObject.error && lostObject.data.length === 0, 'executor loses object access after last own task deleted')
  console.log(`Stage 3B + 4: ${passed} real JWT/API checks passed.`)
} finally {
  // Only UUIDs created by this invocation are removed, never unrelated objects.
  if (objectIds.length) {
    const cleanup = await local.admin.from('objects').delete().in('id', objectIds)
    assert.ok(!cleanup.error, 'cleanup of integration fixtures')
  }
  for (const client of clients) await client.auth.signOut({ scope: 'local' })
}
