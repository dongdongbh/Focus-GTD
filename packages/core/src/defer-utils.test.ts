import { describe, it, expect } from 'vitest';
import { addDays, addWeeks, set } from 'date-fns';
import { getDeferredTaskUpdates } from './defer-utils';
import { safeParseDate } from './date';
import type { Task } from './types';

describe('defer-utils', () => {
    it('preserves time and shifts existing dates', () => {
        const now = new Date('2025-01-01T10:00:00Z');
        const task: Task = {
            id: 't1',
            title: 'Test',
            status: 'next',
            tags: [],
            contexts: [],
            startTime: '2025-01-02T08:15:00.000Z',
            dueDate: '2025-01-03T15:30:00.000Z',
            reviewAt: '2025-01-04T12:45:00.000Z',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        };

        const updates = getDeferredTaskUpdates(task, 'nextWeek', now);
        const base = addWeeks(now, 1);

        const expectedStart = set(base, {
            hours: safeParseDate(task.startTime)!.getHours(),
            minutes: safeParseDate(task.startTime)!.getMinutes(),
            seconds: 0,
            milliseconds: 0,
        }).toISOString();
        const expectedDue = set(base, {
            hours: safeParseDate(task.dueDate)!.getHours(),
            minutes: safeParseDate(task.dueDate)!.getMinutes(),
            seconds: 0,
            milliseconds: 0,
        }).toISOString();
        const expectedReview = set(base, {
            hours: safeParseDate(task.reviewAt)!.getHours(),
            minutes: safeParseDate(task.reviewAt)!.getMinutes(),
            seconds: 0,
            milliseconds: 0,
        }).toISOString();

        expect(updates.startTime).toBe(expectedStart);
        expect(updates.dueDate).toBe(expectedDue);
        expect(updates.reviewAt).toBe(expectedReview);
    });

    it('adds a due date when none exist', () => {
        const now = new Date('2025-01-01T10:00:00Z');
        const task: Task = {
            id: 't1',
            title: 'Test',
            status: 'next',
            tags: [],
            contexts: [],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        };

        const updates = getDeferredTaskUpdates(task, 'tomorrow', now);
        const base = addDays(now, 1);
        const expectedDue = set(base, {
            hours: 9,
            minutes: 0,
            seconds: 0,
            milliseconds: 0,
        }).toISOString();

        expect(updates.dueDate).toBe(expectedDue);
    });
});

