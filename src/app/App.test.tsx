import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { StrictMode } from 'react'
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AuthProvider } from './providers/AuthProvider'
import type { Profile } from '@/features/auth/model/auth-context'
import * as crm from '@/features/crm/api'

vi.mock('@/features/crm/api', () => {
  const object = { id: 'object-123', name: 'Объект теста', address: 'Адрес', created_at: '2026-11-05T00:00:00Z' }
  const task = { id: 'task-456', object_id: object.id, title: 'Задача теста', description: null, status: 'new', author_id: 'manager-id', assignee_id: 'executor-id', created_at: object.created_at }
  return {
    getObjects: vi.fn(async () => []), getObject: vi.fn(async () => object),
    getTasks: vi.fn(async () => []), getTask: vi.fn(async () => task),
    getExecutors: vi.fn(async () => [{ id: 'executor-id', email: 'executor-a@mini-crm.test' }]),
    createObject: vi.fn(async () => object), updateObject: vi.fn(async () => object), deleteObject: vi.fn(async () => {}),
    createTask: vi.fn(async () => task), updateTask: vi.fn(async () => task), deleteTask: vi.fn(async () => {}),
  }
})

const managerSession = { user: { id: 'manager-id', email: 'manager@mini-crm.test' }, access_token: 'test-token' } as Session
const executorSession = { user: { id: 'executor-id', email: 'executor-a@mini-crm.test' }, access_token: 'other-token' } as Session

function fakeClient(initialSession: Session | null = null) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined
  const unsubscribe = vi.fn()
  const getSession = vi.fn(async (): Promise<{ data: { session: Session | null }; error: null }> => ({ data: { session: initialSession }, error: null }))
  const profileResponse = vi.fn(async (id: string): Promise<{ data: Profile | null; error: { message: string } | null }> => ({
    data: { id, role: id === 'manager-id' ? 'manager' : 'executor' }, error: null,
  }))
  const from = vi.fn(() => {
    let id = ''
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((_column: string, value: string) => { id = value; return builder }),
      abortSignal: vi.fn(() => builder),
      maybeSingle: vi.fn(() => profileResponse(id)),
    }
    return builder
  })
  const emit = (session: Session | null) => listener?.(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)
  const signInWithPassword = vi.fn(async (credentials: { email: string; password: string }): Promise<{ error: { code?: string; status?: number } | null }> => {
    emit(credentials.email.startsWith('manager') ? managerSession : executorSession)
    return { error: null }
  })
  const signOut = vi.fn(async () => { emit(null); return { error: null } })
  const onAuthStateChange = vi.fn((callback: typeof listener) => {
    listener = callback
    return { data: { subscription: { unsubscribe } } }
  })
  const client = { auth: { getSession, onAuthStateChange, signInWithPassword, signOut }, from } as unknown as SupabaseClient
  return { client, getSession, signInWithPassword, signOut, unsubscribe, profileResponse, emit, from }
}

function Location() {
  return <span aria-label="Текущий маршрут">{useLocation().pathname}</span>
}

function renderRoute(path: string, fake = fakeClient()) {
  const rendered = render(<MemoryRouter initialEntries={[path]}>
    <AuthProvider client={fake.client}><App /><Location /></AuthProvider>
  </MemoryRouter>)
  return { ...rendered, fake }
}

async function fillLogin() {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Вход' })
  await user.type(screen.getByLabelText('Email'), 'manager@mini-crm.test')
  await user.type(screen.getByLabelText('Пароль'), 'example-password')
  await user.click(screen.getByRole('button', { name: 'Войти' }))
  return user
}

describe('Authentication and routing', () => {
  it('loads business queries under StrictMode', async () => {
    const fake = fakeClient(managerSession)
    render(<StrictMode><MemoryRouter initialEntries={['/objects']}><AuthProvider client={fake.client}><App /></AuthProvider></MemoryRouter></StrictMode>)
    expect(await screen.findByText('Доступных объектов пока нет.')).toBeInTheDocument()
  })

  it('does not reuse manager data after switching accounts', async () => {
    vi.mocked(crm.getObjects).mockResolvedValueOnce([{ id: 'private-object', name: 'Скрытая стройка', address: 'Адрес', created_at: '2026-11-05T00:00:00Z' }]).mockResolvedValueOnce([])
    const { fake } = renderRoute('/objects', fakeClient(managerSession))
    await screen.findByText('Скрытая стройка')
    act(() => fake.emit(null))
    await screen.findByRole('heading', { name: 'Вход' })
    act(() => fake.emit(executorSession))
    await screen.findByRole('heading', { name: 'Мои задачи' })
    await userEvent.click(screen.getByRole('link', { name: 'Объекты' }))
    expect(await screen.findByText('Доступных объектов пока нет.')).toBeInTheDocument()
    expect(screen.queryByText('Скрытая стройка')).not.toBeInTheDocument()
  })

  it('creates an object and invalidates the list', async () => {
    renderRoute('/objects', fakeClient(managerSession))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Создать объект' }))
    await user.type(screen.getByLabelText('Название'), 'Новая стройка')
    await user.type(screen.getByLabelText('Адрес'), 'Новый адрес')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('heading', { name: 'Карточка объекта' })).toBeInTheDocument()
    expect(crm.createObject).toHaveBeenCalledWith({ name: 'Новая стройка', address: 'Новый адрес' })
    expect(vi.mocked(crm.getObjects).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('requires confirmation before deleting an object', async () => {
    renderRoute('/objects/object-123', fakeClient(managerSession))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Удалить объект' }))
    expect(crm.deleteObject).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(crm.deleteObject).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Удалить объект' }))
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    expect(await screen.findByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
    expect(crm.deleteObject).toHaveBeenCalledWith('object-123')
  })

  it('does not show CRUD actions to an executor', async () => {
    renderRoute('/objects/object-123', fakeClient(executorSession))
    await screen.findByText('Объект теста')
    expect(screen.queryByRole('button', { name: 'Редактировать объект' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить объект' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).not.toBeInTheDocument()
  })

  it('signs in and loads the manager profile', async () => {
    const { fake } = renderRoute('/login')
    await fillLogin()
    expect(await screen.findByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
    expect(fake.signInWithPassword).toHaveBeenCalledWith({ email: 'manager@mini-crm.test', password: 'example-password' })
    expect(screen.getByText('Постановщик')).toBeInTheDocument()
  })

  it('shows invalid credentials without opening protected routes', async () => {
    const fake = fakeClient()
    fake.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } })
    renderRoute('/login', fake)
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль')
    expect(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/login')
  })

  it('handles a failed network request during login', async () => {
    const fake = fakeClient()
    fake.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    renderRoute('/login', fake)
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения')
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled()
  })

  it.each(['/objects', '/objects/example', '/tasks/example', '/my-tasks'])('redirects an anonymous user from %s', async path => {
    renderRoute(path)
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/login')
  })

  it.each([
    ['/objects', 'Объекты'], ['/objects/object-123', 'Карточка объекта'],
    ['/tasks/task-456', 'Карточка задачи'], ['/my-tasks', 'Мои задачи'],
  ])('restores the session and opens %s', async (path, name) => {
    renderRoute(path, fakeClient(managerSession))
    expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Вход' })).not.toBeInTheDocument()
  })

  it.each([
    [managerSession, '/objects', 'Объекты'], [executorSession, '/my-tasks', 'Мои задачи'],
  ])('sends a signed-in user away from login to the role home', async (session, path, name) => {
    renderRoute('/login', fakeClient(session))
    expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    expect(screen.getByLabelText('Текущий маршрут')).toHaveTextContent(path)
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument()
  })

  it('does not redirect while restoring a session', async () => {
    const fake = fakeClient()
    let restore!: (value: { data: { session: Session }; error: null }) => void
    fake.getSession.mockImplementation(() => new Promise(resolve => { restore = resolve }))
    renderRoute('/tasks/task-456', fake)
    expect(screen.getByRole('status')).toHaveTextContent('Восстанавливаем сессию')
    expect(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/tasks/task-456')
    await act(async () => restore({ data: { session: managerSession }, error: null }))
    expect(await screen.findByRole('heading', { name: 'Карточка задачи' })).toBeInTheDocument()
  })

  it('blocks routes when the profile is missing', async () => {
    const fake = fakeClient(managerSession)
    fake.profileResponse.mockResolvedValue({ data: null, error: null })
    renderRoute('/objects', fake)
    expect(await screen.findByRole('alert')).toHaveTextContent('Профиль пользователя не найден')
    expect(screen.queryByRole('heading', { name: 'Объекты' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument()
  })

  it('blocks an invalid role and a failed profile request', async () => {
    const fake = fakeClient(managerSession)
    fake.profileResponse.mockResolvedValue({ data: { id: 'manager-id', role: 'admin' as Profile['role'] }, error: null })
    renderRoute('/objects', fake)
    expect(await screen.findByRole('alert')).toHaveTextContent('Профиль пользователя некорректен')
    fake.profileResponse.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить профиль')
  })

  it('signs out and loses protected route access', async () => {
    const { fake } = renderRoute('/objects', fakeClient(managerSession))
    await screen.findByRole('heading', { name: 'Объекты' })
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
    await userEvent.click(screen.getByRole('link', { name: 'Объекты' }))
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
  })

  it('reacts to an external signout event', async () => {
    const { fake } = renderRoute('/objects', fakeClient(managerSession))
    await screen.findByRole('heading', { name: 'Объекты' })
    act(() => fake.emit(null))
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument()
  })

  it('ignores an old profile response after signout', async () => {
    const fake = fakeClient(managerSession)
    let finish!: (value: { data: Profile; error: null }) => void
    fake.profileResponse.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    renderRoute('/objects', fake)
    await waitFor(() => expect(fake.profileResponse).toHaveBeenCalled())
    act(() => fake.emit(null))
    await screen.findByRole('heading', { name: 'Вход' })
    await act(async () => finish({ data: { id: 'manager-id', role: 'manager' }, error: null }))
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
  })

  it('cleans up its auth subscription on unmount', async () => {
    const { fake, unmount } = renderRoute('/objects', fakeClient(managerSession))
    await screen.findByRole('heading', { name: 'Объекты' })
    unmount()
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('shows session initialization failures without granting access', async () => {
    const fake = fakeClient()
    fake.getSession.mockRejectedValue(new Error('offline'))
    renderRoute('/objects', fake)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось восстановить сессию')
    expect(screen.queryByRole('heading', { name: 'Объекты' })).not.toBeInTheDocument()
  })

  it('recovers from 404 for a signed-in user', async () => {
    renderRoute('/missing', fakeClient(managerSession))
    await screen.findByText('Постановщик')
    await userEvent.click(screen.getByRole('link', { name: 'Перейти к объектам' }))
    expect(await screen.findByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
  })
})
