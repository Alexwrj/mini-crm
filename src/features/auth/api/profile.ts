import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '../model/auth-context'

export async function loadProfile(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<Profile> {
  const { data, error } = await client.from('profiles').select('id, role').eq('id', userId).abortSignal(signal).maybeSingle()
  if (error) throw new Error('Не удалось загрузить профиль. Проверьте соединение и повторите попытку.')
  if (!data) throw new Error('Профиль пользователя не найден. Обратитесь к администратору.')
  if (data.id !== userId || !['manager', 'executor'].includes(data.role)) {
    throw new Error('Профиль пользователя некорректен. Обратитесь к администратору.')
  }
  return { id: data.id as string, role: data.role as Profile['role'] }
}
