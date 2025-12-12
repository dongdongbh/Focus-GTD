import { addDays, addMonths, addWeeks, nextSaturday, set } from 'date-fns';
import { safeParseDate } from './date';
import type { Task } from './types';

export type DeferPreset = 'tomorrow' | 'nextWeek' | 'weekend' | 'nextMonth' | 'pickDate';

function getPresetBaseDate(preset: DeferPreset, now: Date): Date {
    switch (preset) {
        case 'tomorrow':
            return addDays(now, 1);
        case 'nextWeek':
            return addWeeks(now, 1);
        case 'weekend':
            return nextSaturday(now);
        case 'nextMonth':
            return addMonths(now, 1);
        default:
            return addDays(now, 1);
    }
}

function preserveTime(source: string | undefined, base: Date): Date {
    const parsed = safeParseDate(source);
    if (!parsed) {
        return set(base, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
    }
    return set(base, {
        hours: parsed.getHours(),
        minutes: parsed.getMinutes(),
        seconds: 0,
        milliseconds: 0,
    });
}

export function getDeferredTaskUpdates(task: Task, preset: DeferPreset, now: Date = new Date()): Partial<Task> {
    const base = getPresetBaseDate(preset, now);

    const updates: Partial<Task> = {};

    if (task.startTime) {
        updates.startTime = preserveTime(task.startTime, base).toISOString();
    }
    if (task.dueDate) {
        updates.dueDate = preserveTime(task.dueDate, base).toISOString();
    }
    if (task.reviewAt) {
        updates.reviewAt = preserveTime(task.reviewAt, base).toISOString();
    }

    // If no dates existed, defer dueDate by default.
    if (!task.startTime && !task.dueDate && !task.reviewAt) {
        updates.dueDate = preserveTime(undefined, base).toISOString();
    }

    return updates;
}

