import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { seedAuthUsers } from './seed-auth-users.mjs'

// Actual HTTP requests with real JWTs, no admin credentials on tested requests.
const local = await seedAuthUsers()
let passed = 0
function check(condition, label) {
  assert.ok(condition, label)
  passed++
  console.log(`PASS: ${label}`)
}

const repeated = await seedAuthUsers()
check(JSON.stringify(local.accounts.map(user => user.id)) === JSON.stringify(repeated.accounts.map(user => user.id)),
  'repeated seed preserves account IDs (no duplicate users)')
check(local.accounts.every((user, index) => user.password === repeated.accounts[index].password),
  'repeated seed preserves saved local passwords')

const anonymous = createClient(local.url, local.publicKey, local.options)
const signup = await anonymous.auth.signUp({ email: 'signup-must-fail@mini-crm.test', password: 'NotARealUser-12345!' })
check(Boolean(signup.error) && !signup.data.user, 'public signup disabled')
const badLogin = await anonymous.auth.signInWithPassword({ email: local.accounts[0].email, password: 'incorrect-password' })
check(Boolean(badLogin.error) && !badLogin.data.session, 'invalid credentials rejected')

for (const account of local.accounts) {
  const client = createClient(local.url, local.publicKey, local.options)
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password })
  check(!error && data.session?.user.id === account.id, `${account.email}: sign in, real JWT`)
  const own = await client.from('profiles').select('id, role').eq('id', account.id).single()
  check(!own.error && own.data.role === account.role, `${account.email}: own profile and role`)
  const all = await client.from('profiles').select('id, role')
  check(!all.error && all.data.length === 1 && all.data[0].id === account.id, `${account.email}: RLS returns only self`)
  const other = local.accounts.find(user => user.id !== account.id)
  const foreign = await client.from('profiles').select('id, role').eq('id', other.id)
  check(!foreign.error && foreign.data.length === 0, `${account.email}: foreign profile invisible`)
  const update = await client.from('profiles').update({ role: account.role === 'manager' ? 'executor' : 'manager' }).eq('id', account.id)
  check(Boolean(update.error), `${account.email}: own role update denied`)
  const remove = await client.from('profiles').delete().eq('id', account.id)
  check(Boolean(remove.error), `${account.email}: profile delete denied`)
  const insert = await client.from('profiles').insert({ id: account.id, role: 'manager' })
  check(Boolean(insert.error), `${account.email}: profile insert denied`)
  const metadata = await client.auth.updateUser({ data: { role: 'manager' } })
  check(!metadata.error, `${account.email}: user metadata editable (not trusted for roles)`)
  const unchanged = await client.from('profiles').select('role').eq('id', account.id).single()
  check(!unchanged.error && unchanged.data.role === account.role, `${account.email}: metadata cannot change database role`)
  for (const table of ['objects', 'tasks', 'task_status_history']) {
    const operations = [
      ['select', () => client.from(table).select('*')],
      ['insert', () => client.from(table).insert({})],
      ['update', () => client.from(table).update({ id: account.id }).eq('id', account.id)],
      ['delete', () => client.from(table).delete().eq('id', account.id)],
    ]
    for (const [operation, request] of operations) {
      const response = await request()
      check(Boolean(response.error), `${account.email}: ${table} ${operation} denied`)
    }
  }
  const session = await client.auth.getSession()
  check(session.data.session?.user.id === account.id, `${account.email}: session available`)
  const logout = await client.auth.signOut({ scope: 'local' })
  const after = await client.auth.getSession()
  check(!logout.error && !after.data.session, `${account.email}: sign out clears session`)
  const noSessionProfile = await client.from('profiles').select('id, role')
  check(Boolean(noSessionProfile.error), `${account.email}: profile read denied after logout`)
}

for (const table of ['profiles', 'objects', 'tasks', 'task_status_history']) {
  check(Boolean((await anonymous.from(table).select('*')).error), `anon: ${table} read denied`)
}
// Admin reads only verify the clients' failed writes left the role intact.
for (const account of local.accounts) {
  const profile = await local.admin.from('profiles').select('role').eq('id', account.id).single()
  check(!profile.error && profile.data.role === account.role, `admin verification: ${account.email} role unchanged`)
}
console.log(`Stage 3A: ${passed} real API checks passed.`)
