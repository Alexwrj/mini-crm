import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type Role } from '@/features/auth/model/auth-context'
import { TaskPage } from '@/pages/TaskPage'
import type { CrmTask, TaskHistory } from '../api'
import * as api from '../api'

vi.mock('../api', () => ({
  getTask: vi.fn(), getTaskHistory: vi.fn(), transitionTask: vi.fn(), reassignTask: vi.fn(),
  getExecutors: vi.fn(async () => [{ id: 'b', email: 'executor-b@mini-crm.test' }]),
  createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(),
}))

let task: CrmTask
let history: TaskHistory[]
beforeEach(() => {
  task = { id: 'task', object_id: 'object', author_id: 'm', assignee_id: 'a', author_email: 'manager@mini-crm.test', assignee_email: 'executor-a@mini-crm.test', title: 'Тестовая задача', description: null, status: 'new', created_at: '2026-11-05T00:00:00Z' }
  history = []
  vi.mocked(api.getTask).mockImplementation(async () => ({ ...task }))
  vi.mocked(api.getTaskHistory).mockImplementation(async () => [...history])
  vi.mocked(api.transitionTask).mockImplementation(async (id, target, comment) => {
    history.push({ id: 'event', task_id: id, actor_id: target === 'rework' ? 'm' : 'a', actor_email: target === 'rework' ? 'manager@mini-crm.test' : 'executor-a@mini-crm.test', from_status: task.status, to_status: target, comment, created_at: '2026-11-05T00:00:01Z' })
    task = { ...task, status: target }
    return task
  })
})
function view(role: Role = 'executor') {
  const userId = role === 'manager' ? 'm' : 'a'
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<MemoryRouter initialEntries={['/tasks/task']}><AuthContext value={{
    state: { status: 'authenticated', session: { user: { id: userId } } as Session, profile: { id: userId, role } },
    signIn: vi.fn(), signOut: vi.fn(), retry: vi.fn(),
  }}><QueryClientProvider client={cache}><Routes><Route path="/tasks/:taskId" element={<TaskPage />} /></Routes></QueryClientProvider></AuthContext></MemoryRouter>)
}

describe('Task workflow UI', () => {
  it.each<Role>(['manager', 'executor'])('shows author and assignee emails to %s', async role => {
    view(role)
    expect(await screen.findByText(`manager@mini-crm.test${role === 'manager' ? ' (вы)' : ''}`)).toBeInTheDocument()
    expect(screen.getByText(`executor-a@mini-crm.test${role === 'executor' ? ' (вы)' : ''}`)).toBeInTheDocument()
  })
  it('falls back to participant IDs when emails are unavailable', async () => {
    task.author_email = null
    task.assignee_email = null
    view()
    expect(await screen.findByText('m')).toBeInTheDocument()
    expect(screen.getByText('a (вы)')).toBeInTheDocument()
  })
  it.each(['manager@mini-crm.test', null])('shows participant email or UUID fallback: %s', async email => {
    history = [{ id: 'creation', task_id: task.id, actor_id: 'm', actor_email: email, from_status: null, to_status: 'new', comment: null, created_at: task.created_at }]
    view()
    expect(await screen.findByRole('cell', { name: email || 'm' })).toBeInTheDocument()
  })
  it('transitions executor task, refreshes status/history, has no reassignment controls', async () => {
    view()
    await userEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }))
    expect(await screen.findByRole('button', { name: 'Отправить на проверку' })).toBeInTheDocument()
    expect(api.transitionTask).toHaveBeenCalledWith('task', 'in_progress', null)
    expect(await screen.findByRole('cell', { name: 'executor-a@mini-crm.test (вы)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Переназначить исполнителя' })).not.toBeInTheDocument()
    expect(api.getTaskHistory).toHaveBeenCalledTimes(2)
  })
  it('requires a nonblank rework comment and displays saved history', async () => {
    task.status = 'in_review'
    view('manager')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Вернуть на доработку' }))
    await user.type(screen.getByLabelText('Комментарий для доработки'), '   ')
    expect(screen.getByRole('button', { name: 'Подтвердить возврат' })).toBeDisabled()
    expect(api.transitionTask).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Комментарий для доработки'), 'Устранить замечания')
    await user.click(screen.getByRole('button', { name: 'Подтвердить возврат' }))
    expect(await screen.findByText('Устранить замечания')).toBeInTheDocument()
    expect(api.transitionTask).toHaveBeenCalledWith('task', 'rework', 'Устранить замечания')
    expect(screen.queryByRole('button', { name: 'Принять' })).not.toBeInTheDocument()
  })
  it('disables repeat submission until the command finishes', async () => {
    let resolve!: (result: CrmTask) => void
    vi.mocked(api.transitionTask).mockImplementation(() => new Promise(done => { resolve = done }))
    view()
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'Взять в работу' })
    await user.click(button)
    expect(button).toBeDisabled()
    await user.click(button)
    expect(api.transitionTask).toHaveBeenCalledOnce()
    task.status = 'in_progress'
    await act(async () => resolve(task))
    expect(await screen.findByRole('button', { name: 'Отправить на проверку' })).toBeEnabled()
  })
  it('shows conflicts and fetches authoritative status instead of an optimistic change', async () => {
    vi.mocked(api.transitionTask).mockImplementation(async () => {
      task.status = 'accepted'
      throw new Error('Конфликт состояния. Данные обновлены.')
    })
    view()
    await userEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Конфликт состояния')
    expect(await screen.findByText('Принята')).toBeInTheDocument()
    expect(screen.queryByText('В работе')).not.toBeInTheDocument()
    await waitFor(() => expect(api.getTask).toHaveBeenCalledTimes(2))
  })
  it('allows a manager to open reassignment even for an accepted task', async () => {
    task.status = 'accepted'
    view('manager')
    const button = await screen.findByRole('button', { name: 'Переназначить исполнителя' })
    expect(screen.queryByLabelText('Новый исполнитель')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(await screen.findByLabelText('Новый исполнитель')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('При переназначении статус останется «Принята», а история переходов сохранится.')
    expect(screen.queryByRole('button', { name: 'Принять' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Взять в работу' })).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.queryByLabelText('Новый исполнитель')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
  it.each<CrmTask['status']>(['new', 'in_progress', 'in_review', 'accepted', 'rework'])('hides reassignment from an executor for %s', async status => {
    task.status = status
    view()
    await screen.findByText('Тестовая задача')
    expect(screen.queryByRole('button', { name: 'Переназначить исполнителя' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Новый исполнитель')).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
  it.each<CrmTask['status']>(['new', 'in_progress', 'in_review', 'rework'])('allows manager reassignment without the accepted warning for %s', async status => {
    task.status = status
    view('manager')
    await userEvent.click(await screen.findByRole('button', { name: 'Переназначить исполнителя' }))
    expect(await screen.findByLabelText('Новый исполнитель')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
