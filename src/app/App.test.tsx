import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { App } from './App'

function renderRoute(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('Foundation routing', () => {
  it.each([
    ['/login', 'Вход'],
    ['/objects', 'Объекты'],
    ['/objects/object-123', 'Карточка объекта'],
    ['/tasks/task-456', 'Карточка задачи'],
    ['/my-tasks', 'Мои задачи'],
    ['/unknown/path', 'Страница не найдена'],
  ])('opens %s', (path, heading) => {
    renderRoute(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('redirects the root route to objects', () => {
    renderRoute('/')
    expect(screen.getByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Объекты' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    ['/objects/object-123', 'object-123'],
    ['/tasks/task-456', 'task-456'],
  ])('reads the identifier from %s', (path, identifier) => {
    renderRoute(path)
    expect(screen.getByText(identifier)).toBeInTheDocument()
  })

  it('navigates through the application links', async () => {
    const user = userEvent.setup()
    renderRoute('/objects')
    for (const name of ['Мои задачи', 'Вход', 'Объекты']) {
      await user.click(screen.getByRole('link', { name }))
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('recovers from an unknown route', async () => {
    const user = userEvent.setup()
    renderRoute('/missing')
    await user.click(screen.getByRole('link', { name: 'Перейти к объектам' }))
    expect(screen.getByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
  })
})
