import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterTasksBySearch } from './search';
import type { Project, Task } from './types';

describe('search', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('supports status, OR groups, and negation', () => {
        vi.setSystemTime(new Date('2025-01-01T10:00:00Z'));

        const tasks: Task[] = [
            {
                id: 't1',
                title: 'Call mom',
                status: 'inbox',
                tags: [],
                contexts: [],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            },
            {
                id: 't2',
                title: 'Write report',
                status: 'next',
                tags: [],
                contexts: [],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            },
            {
                id: 't3',
                title: 'Old done task',
                status: 'done',
                tags: [],
                contexts: [],
                createdAt: '2024-12-01T00:00:00Z',
                updatedAt: '2024-12-01T00:00:00Z',
            },
        ];
        const projects: Project[] = [];

        const results = filterTasksBySearch(tasks, projects, 'status:inbox OR status:next -status:done');
        expect(results.map(t => t.id)).toEqual(['t1', 't2']);
    });

    it('supports relative date comparisons', () => {
        vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
        const tasks: Task[] = [
            {
                id: 't1',
                title: 'Due soon',
                status: 'next',
                dueDate: '2025-01-05T09:00:00.000Z',
                tags: [],
                contexts: [],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            },
            {
                id: 't2',
                title: 'Due later',
                status: 'next',
                dueDate: '2025-01-20T09:00:00.000Z',
                tags: [],
                contexts: [],
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            },
        ];

        const results = filterTasksBySearch(tasks, [], 'due:<=7d');
        expect(results.map(t => t.id)).toEqual(['t1']);
    });

    it('matches project filter by title', () => {
        const nowIso = new Date('2025-01-01T00:00:00Z').toISOString();
        const projects: Project[] = [
            {
                id: 'p1',
                title: 'Work Stuff',
                color: '#000000',
                status: 'active',
                createdAt: nowIso,
                updatedAt: nowIso,
            },
        ];
        const tasks: Task[] = [
            {
                id: 't1',
                title: 'Task in project',
                status: 'next',
                projectId: 'p1',
                tags: [],
                contexts: [],
                createdAt: nowIso,
                updatedAt: nowIso,
            },
        ];

        const results = filterTasksBySearch(tasks, projects, 'project:work');
        expect(results).toHaveLength(1);
    });
});

