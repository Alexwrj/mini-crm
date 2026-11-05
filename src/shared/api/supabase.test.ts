import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example_only')
})
afterEach(() => vi.unstubAllEnvs())

describe('Supabase public configuration', () => {
  it('reports missing variables without creating a client', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    const module = await import('./supabase')
    expect(module.supabase).toBeNull()
    expect(module.supabaseConfigurationError).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(createClient).not.toHaveBeenCalled()
  })
  it('rejects a malformed URL', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'invalid-url')
    expect((await import('./supabase')).supabaseConfigurationError).toContain('HTTP(S)')
  })
  it.each(['sb_secret_example_only', `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`])('rejects an administrative key', async key => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key)
    const module = await import('./supabase')
    expect(module.supabase).toBeNull()
    expect(module.supabaseConfigurationError).toContain('Секретные ключи')
  })
  it('creates a single client with session persistence', async () => {
    const first = await import('./supabase')
    const second = await import('./supabase')
    expect(first.supabase).toBe(second.supabase)
    expect(createClient).toHaveBeenCalledOnce()
    expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54321', 'sb_publishable_example_only', expect.objectContaining({
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }))
  })
})
