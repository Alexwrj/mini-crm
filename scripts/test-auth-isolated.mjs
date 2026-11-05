import { mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { projectRoot } from './lib/local-supabase.mjs'

const crud = process.argv.includes('--crud')
const workflow = process.argv.includes('--workflow')
const stageName = workflow ? 'workflow' : crud ? 'crud' : 'stage3a'
const workdir = resolve(projectRoot, `node_modules/.tmp/${stageName}-supabase`)
const supabaseDir = join(workdir, 'supabase')
mkdirSync(supabaseDir, { recursive: true })
let config = readFileSync(join(projectRoot, 'supabase/config.toml'), 'utf8')
  .replace(/^project_id = .*/m, `project_id = "mini-crm-${stageName}-isolated"`)
  .replace(/543(2\d)/g, workflow ? '583$1' : crud ? '573$1' : '563$1').replace('inspector_port = 8083', workflow ? 'inspector_port = 18085' : crud ? 'inspector_port = 18084' : 'inspector_port = 18083')
writeFileSync(join(supabaseDir, 'config.toml'), config)
// Historical Auth checks retain the closed-business Stage 3A baseline.
const migrationsDir = join(supabaseDir, 'migrations')
rmSync(migrationsDir, { recursive: true, force: true })
mkdirSync(migrationsDir, { recursive: true })
for (const file of readdirSync(join(projectRoot, 'supabase/migrations'))) {
  if (file.endsWith('.sql') && (workflow || (crud ? file <= '20261105020000_business_crud_access.sql' : file <= '20261105010000_allow_own_profile_read.sql'))) {
    cpSync(join(projectRoot, 'supabase/migrations', file), join(migrationsDir, file))
  }
}
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
  console.log(`Starting isolated ${stageName} Supabase; existing project is not touched.`)
  cli(['start', '-x', excludes])
  console.log('Applying migrations from zero via local supabase db reset (no remote flags).')
  cli(['db', 'reset', '--yes'])
  const testFiles = workflow ? ['scripts/test-crud-api.mjs', 'scripts/test-workflow-api.mjs'] : [crud ? 'scripts/test-crud-api.mjs' : 'scripts/test-auth-api.mjs']
  for (const testFile of testFiles) execFileSync(process.execPath, [join(projectRoot, testFile)], {
    cwd: projectRoot, env: { ...process.env, SUPABASE_LOCAL_WORKDIR: workdir,
      SUPABASE_AUTH_BASELINE: crud || workflow ? '0' : '1', SUPABASE_WORKFLOW_ISOLATED: workflow ? '1' : '0' }, stdio: 'inherit',
  })
} finally {
  console.log(`Stopping only the isolated ${stageName} stack and deleting its local data.`)
  cli(['stop', '--no-backup'])
}
