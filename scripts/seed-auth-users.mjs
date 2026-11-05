import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { localSupabase, writePrivateJson } from './lib/local-supabase.mjs'

export async function seedAuthUsers() {
  const local = localSupabase()
  const credentialsPath = join(local.workdir, '.local/auth-users.json')
  const previous = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : null
  const definitions = [
    { email: 'manager@mini-crm.test', role: 'manager' },
    { email: 'executor-a@mini-crm.test', role: 'executor' },
    { email: 'executor-b@mini-crm.test', role: 'executor' },
  ]
  const existing = []
  for (let page = 1; ; page++) {
    const { data, error } = await local.admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Не удалось получить локальных пользователей.')
    existing.push(...data.users)
    if (data.users.length < 100) break
  }
  const accounts = []
  for (const definition of definitions) {
    const saved = previous?.url === local.url ? previous.accounts?.find(account => account.email === definition.email) : null
    const password = saved?.password || randomBytes(24).toString('base64url')
    const found = existing.find(user => user.email === definition.email)
    const result = found
      ? await local.admin.auth.admin.updateUserById(found.id, { password, email_confirm: true })
      : await local.admin.auth.admin.createUser({ email: definition.email, password, email_confirm: true })
    if (result.error || !result.data.user) throw new Error(`Не удалось подготовить локальный аккаунт ${definition.email}.`)
    const id = result.data.user.id
    const { error } = await local.admin.from('profiles').upsert({ id, role: definition.role }, { onConflict: 'id' })
    if (error) throw new Error(`Не удалось создать профиль ${definition.email}. Примените миграции Stage 3A.`)
    accounts.push({ ...definition, id, password })
    // Preserve credentials even if a later account fails; no admin keys are saved.
    writePrivateJson(credentialsPath, { url: local.url, accounts })
  }
  console.log(`Подготовлены 3 локальных аккаунта. Пароли: ${credentialsPath} (доступ только владельцу).`)
  writeFileSync(join(local.workdir, '.local/frontend.env'), `VITE_SUPABASE_URL=${local.url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${local.publicKey}\n`, { mode: 0o600 })
  return { ...local, accounts }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedAuthUsers().catch(error => { console.error(error.message); process.exitCode = 1 })
}
