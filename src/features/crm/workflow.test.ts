import { describe, expect, it } from 'vitest'
import { taskActions } from './workflow'
import type { CrmTask, TaskStatus } from './api'

const task: CrmTask = { id: 'task', object_id: 'object', assignee_id: 'a', author_id: 'm', title: 'Задача', description: null, status: 'new', created_at: '2026-11-05T00:00:00Z' }

describe('Workflow action visibility (UX only)', () => {
  it.each([
    ['new', ['in_progress']], ['in_progress', ['in_review']], ['in_review', []], ['rework', ['in_progress']], ['accepted', []],
  ] as [TaskStatus, TaskStatus[]][])('shows only assigned executor actions for %s', (status, targets) => {
    expect(taskActions({ ...task, status }, { manager: false, userId: 'a' }).map(action => action.target)).toEqual(targets)
    expect(taskActions({ ...task, status }, { manager: false, userId: 'b' })).toEqual([])
  })
  it.each(['new', 'in_progress', 'rework', 'accepted'] as TaskStatus[])('manager has no executor actions for %s', status => {
    expect(taskActions({ ...task, status }, { manager: true, userId: 'm' })).toEqual([])
  })
  it('manager can accept or return only reviewed tasks, comment is requested for rework', () => {
    expect(taskActions({ ...task, status: 'in_review' }, { manager: true, userId: 'm' })).toEqual([
      { target: 'accepted', label: 'Принять' }, { target: 'rework', label: 'Вернуть на доработку', comment: true },
    ])
  })
})
