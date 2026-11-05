import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { seedAuthUsers } from './seed-auth-users.mjs'

// Fault-injection SQL is permitted exclusively in this disposable project.
const local = await seedAuthUsers()
const isolated = process.env.SUPABASE_WORKFLOW_ISOLATED === '1'
  && local.workdir.endsWith('/node_modules/.tmp/workflow-supabase')
if (!isolated) throw new Error('Workflow tests run only via npm run test:workflow-isolated in the disposable project.')
const sql = command => execFileSync('docker', ['exec', 'supabase_db_mini-crm-workflow-isolated', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', command], { encoding: 'utf8' }).trim()
let passed = 0
function check(condition, label) { assert.ok(condition, label); passed++; console.log(`PASS: ${label}`) }
const [managerUser, aUser, bUser] = local.accounts
const clients = []
for (const user of local.accounts) {
  const client = createClient(local.url, local.publicKey, local.options)
  const login = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  check(!login.error && Boolean(login.data.session), `${user.email}: real Auth JWT`)
  clients.push(client)
}
const [manager, a, b] = clients
const anon = createClient(local.url, local.publicKey, local.options)
const created = await manager.from('objects').insert({ name: `Workflow-${randomUUID()}`, address: 'Тестовый объект' }).select().single()
check(!created.error && Boolean(created.data?.id), 'manager creates workflow object')
const objectId = created.data.id
const command = (client, id, target, comment = null) => client.rpc('transition_task', { p_task_id: id, p_target_status: target, p_comment: comment }).single()
const assign = (client, id, assignee) => client.rpc('reassign_task', { p_task_id: id, p_assignee_id: assignee }).single()
async function checkHistoryEmails(client, id, expected, label) {
  const response = await client.rpc('read_task_history', { p_task_id: id })
  check(!response.error, `${label}: read succeeds`)
  assert.deepEqual(response.data, expected.map(event => ({ ...event, actor_email: local.accounts.find(user => user.id === event.actor_id)?.email ?? null })))
  check(true, `${label}: exact events, actor emails and deterministic order`)
}
async function checkTaskEmails(client, id, expected, label) {
  const response = await client.rpc('read_task', { p_task_id: id }).maybeSingle()
  check(!response.error, `${label}: read succeeds`)
  assert.deepEqual(response.data, expected ? {
    ...expected,
    author_email: local.accounts.find(user => user.id === expected.author_id)?.email ?? null,
    assignee_email: local.accounts.find(user => user.id === expected.assignee_id)?.email ?? null,
  } : null)
  check(true, `${label}: exact task and participant emails`)
}
async function snapshot(id) {
  const task = await local.admin.from('tasks').select('*').eq('id', id).single()
  const history = await local.admin.from('task_status_history').select('*').eq('task_id', id).order('created_at').order('id')
  assert.ok(!task.error && !history.error, 'admin read only to verify state')
  return { task: task.data, history: history.data }
}
async function makeTask(title = 'Задача', assignee = aUser.id) {
  const result = await manager.rpc('create_task', { p_object_id: objectId, p_assignee_id: assignee, p_title: title }).single()
  check(!result.error && result.data.status === 'new' && result.data.author_id === managerUser.id, 'server creates new task')
  const initial = await snapshot(result.data.id)
  check(initial.history.length === 1 && initial.history[0].from_status === null && initial.history[0].to_status === 'new'
    && initial.history[0].actor_id === managerUser.id, 'atomic initial NULL -> new history by manager')
  return result.data
}
async function failsUnchanged(id, request, label) {
  const before = await snapshot(id)
  const response = await request()
  check(Boolean(response.error), `${label}: rejected`)
  assert.deepEqual(await snapshot(id), before, `${label}: no task/history mutation`)
  check(true, `${label}: database unchanged`)
}
async function transition(client, user, id, target, comment = null) {
  const before = await snapshot(id)
  const response = await command(client, id, target, comment)
  check(!response.error && response.data.status === target, `allowed ${before.task.status} -> ${target}`)
  const after = await snapshot(id)
  check(after.task.status === target && after.history.length === before.history.length + 1, 'status + one audit event persisted')
  const event = after.history.find(row => !before.history.some(old => old.id === row.id))
  check(event.actor_id === user.id && event.from_status === before.task.status && event.to_status === target
    && event.comment === comment && Number.isFinite(Date.parse(event.created_at)), 'server actor/time and exact event payload')
}

try {
  const metadata = JSON.parse(sql(`select json_agg(json_build_object('name',p.proname,'owner',r.rolname,'definer',p.prosecdef,'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname in ('create_task','transition_task','reassign_task','read_task_history','read_task')`))
  check(metadata.length === 5 && metadata.every(row => row.owner === 'postgres' && row.definer && row.config.includes('search_path=""') && !row.anon && row.authenticated), 'RPC owner/search_path/SECURITY DEFINER/EXECUTE verified in PostgreSQL')
  check(sql(`select count(*) from pg_policies where schemaname='public' and tablename='task_status_history' and cmd='SELECT'`) === '1', 'one minimal history SELECT policy')
  check(sql(`select bool_and(relrowsecurity) from pg_class where oid in ('public.tasks'::regclass,'public.objects'::regclass,'public.task_status_history'::regclass,'public.profiles'::regclass)`) === 't', 'RLS still enabled on all four tables')

  const task = await makeTask()
  await checkTaskEmails(manager, task.id, task, 'manager reads task author and assignee emails')
  await checkTaskEmails(a, task.id, task, 'assignee reads task participant emails')
  await checkTaskEmails(b, task.id, null, 'foreign executor cannot read task participant emails')
  await checkTaskEmails(a, randomUUID(), null, 'missing task exposes no participant emails')
  check(Boolean((await anon.rpc('read_task', { p_task_id: task.id })).error), 'anonymous cannot call task email RPC')
  await checkHistoryEmails(manager, task.id, (await snapshot(task.id)).history, 'manager reads participant email')
  await checkHistoryEmails(b, task.id, [], 'foreign executor cannot read participant emails')
  await checkHistoryEmails(a, randomUUID(), [], 'missing task exposes no emails')
  check(Boolean((await anon.rpc('read_task_history', { p_task_id: task.id })).error), 'anonymous cannot call history email RPC')
  // Profile-less JWT must not acquire task/history access.
  const removedProfile = await local.admin.from('profiles').delete().eq('id', bUser.id)
  check(!removedProfile.error, 'temporarily remove unused B profile fixture')
  try {
    await failsUnchanged(task.id, () => command(b, task.id, 'in_progress'), 'profile-less transition')
    check((await b.from('task_status_history').select('*').eq('task_id', task.id)).data?.length === 0, 'profile-less user cannot read history')
    await checkHistoryEmails(b, task.id, [], 'profile-less user cannot read participant emails')
    await checkTaskEmails(b, task.id, null, 'profile-less user cannot read task participant emails')
  } finally {
    assert.ok(!(await local.admin.from('profiles').upsert({ id: bUser.id, role: 'executor' })).error)
  }
  for (const [client, target, label] of [[manager, 'in_progress', 'manager cannot take work'], [a, 'in_review', 'executor cannot skip new'], [a, 'accepted', 'executor cannot accept'], [b, 'in_progress', 'foreign executor denied']]) {
    await failsUnchanged(task.id, () => command(client, task.id, target), label)
  }
  await failsUnchanged(task.id, () => command(a, task.id, null), 'null target')
  await failsUnchanged(task.id, () => command(a, task.id, 'invalid'), 'unknown target')
  await transition(a, aUser, task.id, 'in_progress')
  await failsUnchanged(task.id, () => command(manager, task.id, 'in_review'), 'manager cannot submit review')
  await transition(a, aUser, task.id, 'in_review')
  await failsUnchanged(task.id, () => command(a, task.id, 'accepted'), 'executor cannot accept review')
  for (const comment of [null, '', '   ', '\t\n']) {
    await failsUnchanged(task.id, () => command(manager, task.id, 'rework', comment), 'rework requires non-whitespace comment')
  }
  await transition(manager, managerUser, task.id, 'rework', 'Исправить замечания')
  await transition(a, aUser, task.id, 'in_progress')
  await transition(a, aUser, task.id, 'in_review')
  await transition(manager, managerUser, task.id, 'accepted')
  for (const client of [manager, a]) for (const target of ['new', 'in_progress', 'in_review', 'rework', 'accepted']) {
    await failsUnchanged(task.id, () => command(client, task.id, target), 'accepted is terminal')
  }

  const visibleHistory = await a.from('task_status_history').select('*').eq('task_id', task.id).order('created_at').order('id')
  check(!visibleHistory.error && visibleHistory.data.length === 7, 'assignee sees complete ordered history including creation')
  assert.deepEqual(visibleHistory.data.map(row => row.id), (await snapshot(task.id)).history.map(row => row.id))
  check(true, 'history order matches created_at + UUID tie-breaker')
  check((await b.from('task_status_history').select('*').eq('task_id', task.id)).data?.length === 0, 'executor B cannot read A history')
  check((await manager.from('task_status_history').select('*').eq('task_id', task.id)).data?.length === 7, 'manager can read all history')
  await checkHistoryEmails(a, task.id, (await snapshot(task.id)).history, 'assignee sees manager and executor emails')
  const eventId = visibleHistory.data[0].id
  for (const client of [manager, a, b, anon]) {
    await failsUnchanged(task.id, () => client.from('tasks').update({ status: 'in_progress' }).eq('id', task.id), 'direct status PATCH forbidden')
    await failsUnchanged(task.id, () => client.from('task_status_history').insert({ task_id: task.id, actor_id: bUser.id, to_status: 'accepted', created_at: '1900-01-01T00:00:00Z' }), 'forged history INSERT forbidden')
    await failsUnchanged(task.id, () => client.from('task_status_history').update({ actor_id: bUser.id, created_at: '1900-01-01T00:00:00Z', comment: 'forged' }).eq('id', eventId), 'history actor/time/content PATCH forbidden')
    await failsUnchanged(task.id, () => client.from('task_status_history').delete().eq('id', eventId), 'history DELETE forbidden')
  }
  check(Boolean((await anon.from('task_status_history').select('*')).error), 'anon cannot read history')
  await failsUnchanged(task.id, () => command(anon, task.id, 'rework', 'test'), 'anonymous transition RPC')
  await failsUnchanged(task.id, () => assign(anon, task.id, bUser.id), 'anonymous reassign RPC')
  await failsUnchanged(task.id, () => assign(a, task.id, bUser.id), 'executor cannot reassign')
  await failsUnchanged(task.id, () => assign(manager, task.id, managerUser.id), 'cannot reassign to manager')
  await failsUnchanged(task.id, () => assign(manager, task.id, randomUUID()), 'cannot reassign to missing user')
  await failsUnchanged(task.id, () => manager.from('tasks').update({ assignee_id: bUser.id }).eq('id', task.id), 'direct assignee PATCH forbidden')

  const beforeAssignment = await snapshot(task.id)
  const reassigned = await assign(manager, task.id, bUser.id)
  check(!reassigned.error && reassigned.data.assignee_id === bUser.id && reassigned.data.status === 'accepted', 'accepted task reassigned successfully')
  const afterAssignment = await snapshot(task.id)
  assert.deepEqual(afterAssignment.history, beforeAssignment.history)
  check(true, 'reassign preserves full history and accepted status')
  const xminBefore = sql(`select xmin::text from public.tasks where id='${task.id}'`)
  const noop = await assign(manager, task.id, bUser.id)
  check(!noop.error && sql(`select xmin::text from public.tasks where id='${task.id}'`) === xminBefore, 'same-assignee RPC is a true no-op (no row version change)')
  check((await a.from('tasks').select('*').eq('id', task.id)).data?.length === 0, 'old executor immediately loses task on new request')
  check((await a.from('task_status_history').select('*').eq('task_id', task.id)).data?.length === 0, 'old executor immediately loses history')
  check((await b.from('tasks').select('*').eq('id', task.id)).data?.length === 1, 'new executor immediately sees task')
  check((await b.from('task_status_history').select('*').eq('task_id', task.id)).data?.length === 7, 'new executor sees complete old history')
  await checkHistoryEmails(a, task.id, [], 'old assignee loses participant emails')
  await checkHistoryEmails(b, task.id, afterAssignment.history, 'new assignee sees historical participant emails')
  await checkTaskEmails(a, task.id, null, 'old assignee loses task participant emails')
  await checkTaskEmails(b, task.id, afterAssignment.task, 'new assignee sees updated task participant emails')

  const raceTask = await makeTask('Concurrent transition')
  const races = await Promise.all([command(a, raceTask.id, 'in_progress'), command(a, raceTask.id, 'in_progress')])
  check(races.filter(result => !result.error).length === 1, 'two concurrent transitions cannot both succeed')
  const raced = await snapshot(raceTask.id)
  check(raced.task.status === 'in_progress' && raced.history.length === 2, 'concurrent transition adds exactly one event')
  await transition(a, aUser, raceTask.id, 'in_review')
  const reviewRace = await Promise.all([command(manager, raceTask.id, 'accepted'), command(manager, raceTask.id, 'rework', 'Исправить')])
  check(reviewRace.filter(result => !result.error).length === 1, 'concurrent accepted/rework choices serialize')
  check((await snapshot(raceTask.id)).history.length === 4, 'only the winning review transition is audited')

  const moveRaceTask = await makeTask('Reassignment versus transition')
  const moveRace = await Promise.all([command(a, moveRaceTask.id, 'in_progress'), assign(manager, moveRaceTask.id, bUser.id)])
  check(!moveRace[1].error, 'concurrent reassignment succeeds')
  const moved = await snapshot(moveRaceTask.id)
  check(moved.task.assignee_id === bUser.id && moved.task.status === (moveRace[0].error ? 'new' : 'in_progress')
    && moved.history.length === (moveRace[0].error ? 1 : 2), 'transition and reassign serialize without lost status or history')
  await failsUnchanged(moveRaceTask.id, () => command(a, moveRaceTask.id, 'in_review'), 'old assignee cannot act after concurrent reassign')
  // Reassignment works in each nonterminal state as well as accepted.
  const stagesTask = await makeTask('Reassign all states')
  for (const target of ['new', 'in_progress', 'in_review', 'rework']) {
    if (target === 'in_progress') await transition(a, aUser, stagesTask.id, target)
    if (target === 'in_review') await transition(a, aUser, stagesTask.id, target)
    if (target === 'rework') await transition(manager, managerUser, stagesTask.id, target, 'Доработать')
    const before = await snapshot(stagesTask.id)
    check(!(await assign(manager, stagesTask.id, bUser.id)).error, `reassign allowed in ${target}`)
    const after = await snapshot(stagesTask.id)
    check(after.task.status === before.task.status && JSON.stringify(after.history) === JSON.stringify(before.history), `${target}: no status/history change`)
    assert.ok(!(await assign(manager, stagesTask.id, aUser.id)).error)
  }

  const spoofTask = await makeTask('Spoof RPC payload')
  for (const payload of [{ p_actor_id: bUser.id }, { p_created_at: '1900-01-01T00:00:00Z' }]) {
    await failsUnchanged(spoofTask.id, () => a.rpc('transition_task', { p_task_id: spoofTask.id, p_target_status: 'in_progress', ...payload }), 'RPC rejects forged actor/time arguments')
  }
  // Inject failure after status UPDATE to prove actual transaction rollback.
  sql(`create schema workflow_test; create function workflow_test.reject_audit() returns trigger language plpgsql set search_path='' as $$ begin if exists (select 1 from public.tasks t where t.id=NEW.task_id and t.title='Force audit failure') then raise exception 'Injected audit failure'; end if; return NEW; end $$; revoke all on function workflow_test.reject_audit() from public,anon,authenticated; create trigger workflow_test_fail before insert on public.task_status_history for each row execute function workflow_test.reject_audit();`)
  try {
    await local.admin.from('tasks').update({ title: 'Force audit failure' }).eq('id', spoofTask.id)
    await failsUnchanged(spoofTask.id, () => command(a, spoofTask.id, 'in_progress'), 'history INSERT failure rolls back the preceding status UPDATE')
    const countBefore = await local.admin.from('tasks').select('id', { count: 'exact', head: true }).eq('object_id', objectId)
    const failedCreate = await manager.rpc('create_task', { p_object_id: objectId, p_assignee_id: aUser.id, p_title: 'Force audit failure' })
    const countAfter = await local.admin.from('tasks').select('id', { count: 'exact', head: true }).eq('object_id', objectId)
    check(Boolean(failedCreate.error) && countBefore.count === countAfter.count, 'initial audit failure rolls back creation too')
  } finally {
    sql('drop trigger workflow_test_fail on public.task_status_history; drop schema workflow_test cascade;')
  }
  // Exhaustive server-side 3 roles/identities x 5 source states x 5 targets.
  // Only fixture setup uses admin; every tested transition uses a real user JWT.
  const matrixTask = await makeTask('Full permission matrix')
  const managerPairs = new Set(['in_review:accepted', 'in_review:rework'])
  const executorPairs = new Set(['new:in_progress', 'in_progress:in_review', 'rework:in_progress'])
  for (const source of ['new', 'in_progress', 'in_review', 'accepted', 'rework']) {
    for (const [client, user, allowed] of [[manager, managerUser, managerPairs], [a, aUser, executorPairs], [b, bUser, new Set()]]) {
      for (const target of ['new', 'in_progress', 'in_review', 'accepted', 'rework']) {
        assert.ok(!(await local.admin.from('tasks').update({ status: source }).eq('id', matrixTask.id)).error, 'prepare matrix source fixture')
        const comment = target === 'rework' ? 'Комментарий матрицы' : null
        if (allowed.has(`${source}:${target}`)) await transition(client, user, matrixTask.id, target, comment)
        else await failsUnchanged(matrixTask.id, () => command(client, matrixTask.id, target, comment), `matrix ${user.email}: ${source} -> ${target}`)
      }
    }
  }
  const removed = await manager.from('tasks').delete().eq('id', task.id).select('id')
  check(!removed.error && removed.data.length === 1, 'manager deletes task with workflow history')
  const gone = await local.admin.from('task_status_history').select('id').eq('task_id', task.id)
  check(!gone.error && gone.data.length === 0, 'task deletion cascades immutable history')
  const removedObject = await manager.from('objects').delete().eq('id', objectId).select('id')
  const remaining = await local.admin.from('task_status_history').select('id').in('task_id', [raceTask.id, moveRaceTask.id, stagesTask.id, spoofTask.id, matrixTask.id])
  check(!removedObject.error && !remaining.error && remaining.data.length === 0, 'object deletion cascades all remaining workflow history')
  console.log(`Stage 5: ${passed} real JWT/SQL state checks passed.`)
} finally {
  await local.admin.from('objects').delete().eq('id', objectId)
  for (const client of clients) await client.auth.signOut({ scope: 'local' })
}
