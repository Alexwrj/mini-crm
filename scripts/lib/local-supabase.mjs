import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

// No URL/key environment overrides: credentials come only from CLI local status.
export function localSupabase() {
  const workdir = resolve(process.env.SUPABASE_LOCAL_WORKDIR || projectRoot)
  const config = readFileSync(join(workdir, 'supabase/config.toml'), 'utf8')
  const apiSection = config.split('[api]')[1]?.split('\n[')[0]
  const configuredPort = Number(apiSection?.match(/^port\s*=\s*(\d+)/m)?.[1])
  let status
  try {
    status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--workdir', workdir, '-o', 'json'], {
      cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch {
    throw new Error('Локальный Supabase недоступен. Запустите npx supabase start. Ключи и вывод status скрыты.')
  }
  const url = status.API_URL
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
      || Number(parsed.port) !== configuredPort || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw new Error('Разрешён только локальный HTTP API из конфигурации проекта.')
  }
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY
  const adminKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!publicKey || !adminKey) throw new Error('CLI не вернул локальные ключи. Обновите Supabase CLI.')
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  return { workdir, url, publicKey, options, admin: createClient(url, adminKey, options) }
}

export function writePrivateJson(path, data) {
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  chmodSync(path, 0o600)
}
