import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { projectRoot } from './lib/local-supabase.mjs'

const workdir = resolve(projectRoot, 'node_modules/.tmp/stage3a-supabase')
const supabaseDir = join(workdir, 'supabase')
mkdirSync(supabaseDir, { recursive: true })
let config = readFileSync(join(projectRoot, 'supabase/config.toml'), 'utf8')
  .replace(/^project_id = .*/m, 'project_id = "mini-crm-stage3a-isolated"')
  .replace(/543(2\d)/g, '563$1').replace('inspector_port = 8083', 'inspector_port = 18083')
writeFileSync(join(supabaseDir, 'config.toml'), config)
cpSync(join(projectRoot, 'supabase/migrations'), join(supabaseDir, 'migrations'), { recursive: true })
const excludes = 'realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
const cli = args => {
  try {
    // Capture CLI output: it can contain local administrative credentials.
    execFileSync('npx', ['--no-install', 'supabase', ...args, '--workdir', workdir], {
      cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000,
    })
  } catch (error) {
    // CLI stderr includes progress/errors, but stdout containing credentials is hidden.
    console.error(error.stderr?.toString() || 'Supabase CLI failed (stdout hidden).')
    error.stdout = '[hidden: local credentials]'
    error.output = undefined
    throw new Error('Изолированная проверка Supabase завершилась ошибкой.', { cause: error })
  }
}
try {
  console.log('Starting isolated Supabase on ports 5632x; existing project is not touched.')
  cli(['start', '-x', excludes])
  console.log('Applying migrations from zero via local supabase db reset (no remote flags).')
  cli(['db', 'reset', '--yes'])
  execFileSync(process.execPath, [join(projectRoot, 'scripts/test-auth-api.mjs')], {
    cwd: projectRoot, env: { ...process.env, SUPABASE_LOCAL_WORKDIR: workdir }, stdio: 'inherit',
  })
} finally {
  console.log('Stopping only the isolated Stage 3A stack and deleting its local data.')
  cli(['stop', '--no-backup'])
}
