import { describe, it, expect } from 'vitest';
import { buildRRuleString, parseRRuleString, createNextRecurringTask } from './recurrence';
import type { Task } from './types';

describe('recurrence', () => {
    it('builds and parses weekly BYDAY rules', () => {
        const rrule = buildRRuleString('weekly', ['WE', 'MO']);
        expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE');

        const parsed = parseRRuleString(rrule);
        expect(parsed.rule).toBe('weekly');
        expect(parsed.byDay).toEqual(['MO', 'WE']);
    });

    it('creates next instance using weekly BYDAY (strict)', () => {
        const task: Task = {
            id: 't1',
            title: 'Laundry',
            status: 'done',
            tags: [],
            contexts: [],
            dueDate: '2025-01-06T10:00:00.000Z', // Monday
            recurrence: { rule: 'weekly', byDay: ['MO', 'WE'], strategy: 'strict' },
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
        };

        const next = createNextRecurringTask(task, '2025-01-06T12:00:00.000Z', 'done');
        expect(next?.dueDate).toBe('2025-01-08T10:00:00.000Z'); // Wednesday
        expect(next?.status).toBe('next');
    });

    it('uses completion date for fluid recurrence', () => {
        const task: Task = {
            id: 't2',
            title: 'Meditate',
            status: 'done',
            tags: [],
            contexts: [],
            dueDate: '2025-01-01T09:00:00.000Z',
            recurrence: { rule: 'daily', strategy: 'fluid' },
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
        };

        const next = createNextRecurringTask(task, '2025-01-05T14:00:00.000Z', 'done');
        expect(next?.dueDate).toBe('2025-01-06T14:00:00.000Z');
    });

    it('preserves date-only format for next occurrence', () => {
        const task: Task = {
            id: 't3',
            title: 'Monthly bill',
            status: 'done',
            tags: [],
            contexts: [],
            dueDate: '2025-02-01',
            recurrence: 'monthly',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
        };

        const next = createNextRecurringTask(task, '2025-02-01T08:00:00.000Z', 'done');
        expect(next?.dueDate).toBe('2025-03-01');
    });
});
