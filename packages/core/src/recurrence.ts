import { addDays, addMonths, addWeeks, addYears, format } from 'date-fns';

import { safeParseDate } from './date';
import { generateUUID as uuidv4 } from './uuid';
import type { Recurrence, RecurrenceByDay, RecurrenceRule, RecurrenceStrategy, RecurrenceWeekday, Task, TaskStatus, ChecklistItem, Attachment } from './types';

export const RECURRENCE_RULES: RecurrenceRule[] = ['daily', 'weekly', 'monthly', 'yearly'];

const WEEKDAY_ORDER: RecurrenceWeekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function isRecurrenceRule(value: string | undefined | null): value is RecurrenceRule {
    return !!value && (RECURRENCE_RULES as readonly string[]).includes(value);
}

const RRULE_FREQ_MAP: Record<string, RecurrenceRule> = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
};

const parseByDayToken = (token: string): RecurrenceByDay | null => {
    const trimmed = token.toUpperCase().trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(-1|1|2|3|4)?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!match) return null;
    const ordinal = match[1];
    const weekday = match[2] as RecurrenceWeekday;
    if (ordinal) {
        return `${ordinal}${weekday}` as RecurrenceByDay;
    }
    return weekday;
};

const normalizeWeekdays = (days?: string[] | null): RecurrenceByDay[] | undefined => {
    if (!days || days.length === 0) return undefined;
    const normalized = days
        .map(parseByDayToken)
        .filter((day): day is RecurrenceByDay => Boolean(day));
    return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
};

const normalizeMonthDays = (days?: string[] | null): number[] | undefined => {
    if (!days || days.length === 0) return undefined;
    const normalized = days
        .map((day) => Number(day))
        .filter((day) => Number.isFinite(day) && day >= 1 && day <= 31);
    const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
    return unique.length > 0 ? unique : undefined;
};

export function parseRRuleString(rrule: string): { rule?: RecurrenceRule; byDay?: RecurrenceByDay[]; byMonthDay?: number[]; interval?: number } {
    if (!rrule) return {};
    const tokens = rrule.split(';').reduce<Record<string, string>>((acc, part) => {
        const [key, value] = part.split('=');
        if (key && value) acc[key.toUpperCase()] = value;
        return acc;
    }, {});
    const freq = tokens.FREQ ? RRULE_FREQ_MAP[tokens.FREQ.toUpperCase()] : undefined;
    const byDay = tokens.BYDAY ? normalizeWeekdays(tokens.BYDAY.split(',')) : undefined;
    const byMonthDay = tokens.BYMONTHDAY ? normalizeMonthDays(tokens.BYMONTHDAY.split(',')) : undefined;
    const interval = tokens.INTERVAL ? Number(tokens.INTERVAL) : undefined;
    return { rule: freq, byDay, byMonthDay, interval: interval && interval > 0 ? interval : undefined };
}

const normalizeWeeklyByDay = (days?: RecurrenceByDay[] | null): RecurrenceWeekday[] | undefined => {
    const normalized = normalizeWeekdays(days as string[] | null);
    if (!normalized) return undefined;
    const weekly = normalized.filter((day) => WEEKDAY_ORDER.includes(day as RecurrenceWeekday)) as RecurrenceWeekday[];
    return weekly.length > 0 ? Array.from(new Set(weekly)) : undefined;
};

export function buildRRuleString(rule: RecurrenceRule, byDay?: RecurrenceByDay[], interval?: number): string {
    const parts = [`FREQ=${rule.toUpperCase()}`];
    if (interval && interval > 1) {
        parts.push(`INTERVAL=${interval}`);
    }
    const normalizedDays = normalizeWeekdays(byDay as string[] | null);
    if (normalizedDays && normalizedDays.length > 0) {
        if (rule === 'weekly') {
            const weeklyDays = normalizeWeeklyByDay(normalizedDays);
            if (weeklyDays && weeklyDays.length > 0) {
                const ordered = WEEKDAY_ORDER.filter((day) => weeklyDays.includes(day));
                parts.push(`BYDAY=${ordered.join(',')}`);
            }
        } else if (rule === 'monthly') {
            const ordered = normalizedDays
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)));
            parts.push(`BYDAY=${ordered.join(',')}`);
        }
    }
    return parts.join(';');
}

function getRecurrenceRule(value: Task['recurrence']): RecurrenceRule | null {
    if (!value) return null;
    if (typeof value === 'string') {
        return isRecurrenceRule(value) ? value : null;
    }
    if (typeof value === 'object') {
        const rule = (value as Recurrence).rule;
        if (isRecurrenceRule(rule)) return rule;
        if ((value as Recurrence).rrule) {
            const parsed = parseRRuleString((value as Recurrence).rrule || '');
            if (parsed.rule) return parsed.rule;
        }
    }
    return null;
}

function getRecurrenceStrategy(value: Task['recurrence']): RecurrenceStrategy {
    if (value && typeof value === 'object' && value.strategy === 'fluid') {
        return 'fluid';
    }
    return 'strict';
}

function getRecurrenceByDay(value: Task['recurrence']): RecurrenceByDay[] | undefined {
    if (!value || typeof value === 'string') return undefined;
    const recurrence = value as Recurrence;
    const explicit = normalizeWeekdays(recurrence.byDay);
    if (explicit && explicit.length > 0) return explicit;
    if (recurrence.rrule) {
        const parsed = parseRRuleString(recurrence.rrule);
        return parsed.byDay;
    }
    return undefined;
}

function getRecurrenceByMonthDay(value: Task['recurrence']): number[] | undefined {
    if (!value || typeof value === 'string') return undefined;
    const recurrence = value as Recurrence;
    if (recurrence.rrule) {
        const parsed = parseRRuleString(recurrence.rrule);
        return parsed.byMonthDay;
    }
    return undefined;
}

function getRecurrenceInterval(value: Task['recurrence']): number {
    if (!value || typeof value === 'string') return 1;
    const recurrence = value as Recurrence;
    if (recurrence.rrule) {
        const parsed = parseRRuleString(recurrence.rrule);
        if (parsed.interval && parsed.interval > 0) return parsed.interval;
    }
    return 1;
}

function addInterval(base: Date, rule: RecurrenceRule, interval: number = 1): Date {
    switch (rule) {
        case 'daily':
            return addDays(base, interval);
        case 'weekly':
            return addWeeks(base, interval);
        case 'monthly':
            return addMonths(base, interval);
        case 'yearly':
            return addYears(base, interval);
    }
}

const weekdayIndex = (weekday: RecurrenceWeekday): number => WEEKDAY_ORDER.indexOf(weekday);

function nextWeeklyByDay(base: Date, byDay: RecurrenceByDay[], interval: number = 1): Date {
    const normalizedDays = normalizeWeeklyByDay(byDay);
    if (!normalizedDays || normalizedDays.length === 0) {
        return addWeeks(base, interval);
    }
    const safeInterval = interval > 0 ? interval : 1;
    const orderedDays = WEEKDAY_ORDER.filter((day) => normalizedDays.includes(day));
    const weekStart = new Date(base);
    weekStart.setDate(base.getDate() - base.getDay());

    for (let weekOffset = 0; weekOffset <= safeInterval * 52; weekOffset += safeInterval) {
        const candidateWeekStart = addWeeks(weekStart, weekOffset);
        for (const weekday of orderedDays) {
            const candidate = addDays(candidateWeekStart, weekdayIndex(weekday));
            if (weekOffset === 0 && candidate <= base) continue;
            return candidate;
        }
    }
    return addWeeks(base, safeInterval);
}

const getNthWeekdayOfMonth = (year: number, month: number, weekday: RecurrenceWeekday, ordinal: number): Date | null => {
    if (ordinal === 0) return null;
    if (ordinal > 0) {
        const firstOfMonth = new Date(year, month, 1);
        const firstWeekday = firstOfMonth.getDay();
        const targetWeekday = weekdayIndex(weekday);
        const offset = (targetWeekday - firstWeekday + 7) % 7;
        const day = 1 + offset + (ordinal - 1) * 7;
        const candidate = new Date(year, month, day);
        return candidate.getMonth() === month ? candidate : null;
    }
    // ordinal < 0 => from end of month
    const lastOfMonth = new Date(year, month + 1, 0);
    const lastWeekday = lastOfMonth.getDay();
    const targetWeekday = weekdayIndex(weekday);
    const offset = (lastWeekday - targetWeekday + 7) % 7;
    const day = lastOfMonth.getDate() - offset;
    const candidate = new Date(year, month, day);
    return candidate.getMonth() === month ? candidate : null;
};

const parseOrdinalByDay = (token: RecurrenceByDay): { weekday: RecurrenceWeekday; ordinal?: number } | null => {
    const match = String(token).match(/^(-?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!match) return null;
    const ordinal = match[1] ? Number(match[1]) : undefined;
    const weekday = match[2] as RecurrenceWeekday;
    return { weekday, ordinal };
};

function nextMonthlyByDay(base: Date, byDay: RecurrenceByDay[], interval: number = 1): Date {
    const normalized = normalizeWeekdays(byDay as string[] | null);
    if (!normalized || normalized.length === 0) {
        return addMonths(base, interval);
    }
    const candidates = normalized
        .map(parseOrdinalByDay)
        .filter((item): item is { weekday: RecurrenceWeekday; ordinal?: number } => Boolean(item));
    const safeInterval = interval > 0 ? interval : 1;
    for (let offset = 0; offset <= safeInterval * 12; offset += safeInterval) {
        const monthDate = addMonths(base, offset);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const monthCandidates: Date[] = [];
        candidates.forEach((candidate) => {
            if (typeof candidate.ordinal === 'number') {
                const result = getNthWeekdayOfMonth(year, month, candidate.weekday, candidate.ordinal);
                if (result) {
                    monthCandidates.push(new Date(
                        result.getFullYear(),
                        result.getMonth(),
                        result.getDate(),
                        base.getHours(),
                        base.getMinutes(),
                        base.getSeconds(),
                        base.getMilliseconds()
                    ));
                }
            }
        });
        const filtered = monthCandidates
            .filter((date) => date > base)
            .sort((a, b) => a.getTime() - b.getTime());
        if (filtered.length > 0) {
            return filtered[0];
        }
    }
    return addMonths(base, safeInterval);
}

function nextMonthlyByMonthDay(base: Date, byMonthDay: number[], interval: number = 1): Date {
    const normalized = normalizeMonthDays(byMonthDay.map(String));
    if (!normalized || normalized.length === 0) {
        return addMonths(base, interval);
    }
    const safeInterval = interval > 0 ? interval : 1;
    const startOffset = safeInterval === 1 ? 0 : safeInterval;
    for (let offset = startOffset; offset <= safeInterval * 12; offset += safeInterval) {
        const monthDate = addMonths(base, offset);
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const candidates = normalized.map((day) => new Date(
            year,
            month,
            day,
            base.getHours(),
            base.getMinutes(),
            base.getSeconds(),
            base.getMilliseconds()
        ));
        const filtered = candidates
            .filter((date) => date.getMonth() === month)
            .filter((date) => (offset === 0 ? date > base : true))
            .sort((a, b) => a.getTime() - b.getTime());
        if (filtered.length > 0) return filtered[0];
    }
    return addMonths(base, safeInterval);
}

function nextIsoFrom(
    baseIso: string | undefined,
    rule: RecurrenceRule,
    fallbackBase: Date,
    byDay?: RecurrenceByDay[],
    interval: number = 1,
    byMonthDay?: number[]
): string | undefined {
    const parsed = safeParseDate(baseIso);
    const base = parsed || fallbackBase;
    const effectiveByDay = byDay && byDay.length > 0 ? byDay : undefined;
    const effectiveByMonthDay = byMonthDay && byMonthDay.length > 0 ? byMonthDay : undefined;
    const nextDate = rule === 'weekly' && effectiveByDay
        ? nextWeeklyByDay(base, effectiveByDay, interval)
        : rule === 'monthly' && effectiveByDay
            ? nextMonthlyByDay(base, effectiveByDay, interval)
            : rule === 'monthly' && effectiveByMonthDay
                ? nextMonthlyByMonthDay(base, effectiveByMonthDay, interval)
                : addInterval(base, rule, interval);

    // Preserve existing storage format:
    // - If base has timezone/offset, keep ISO (Z/offset).
    // - Otherwise, return local datetime-local compatible string.
    const isDateOnly = !!baseIso && /^\d{4}-\d{2}-\d{2}$/.test(baseIso);
    if (isDateOnly) {
        return format(nextDate, 'yyyy-MM-dd');
    }
    const hasTimezone = !!baseIso && /Z$|[+-]\d{2}:?\d{2}$/.test(baseIso);
    return hasTimezone ? nextDate.toISOString() : format(nextDate, "yyyy-MM-dd'T'HH:mm");
}

function resetChecklist(checklist: ChecklistItem[] | undefined): ChecklistItem[] | undefined {
    if (!checklist || checklist.length === 0) return undefined;
    return checklist.map((item) => ({
        ...item,
        id: uuidv4(),
        isCompleted: false,
    }));
}

/**
 * Create the next instance of a recurring task.
 *
 * - Uses task.dueDate as the base if present/valid, else completion time.
 * - Shifts startTime/reviewAt forward if present.
 * - Resets checklist completion and IDs.
 * - New instance status is based on the previous status, with done -> next.
 */
export function createNextRecurringTask(
    task: Task,
    completedAtIso: string,
    previousStatus: TaskStatus
): Task | null {
    const rule = getRecurrenceRule(task.recurrence);
    if (!rule) return null;
    const strategy = getRecurrenceStrategy(task.recurrence);
    const byDay = getRecurrenceByDay(task.recurrence);
    const byMonthDay = getRecurrenceByMonthDay(task.recurrence);
    const interval = getRecurrenceInterval(task.recurrence);
    const completedAtDate = safeParseDate(completedAtIso) || new Date(completedAtIso);
    const baseIso = strategy === 'fluid' ? completedAtIso : task.dueDate;

    const nextDueDate = nextIsoFrom(baseIso, rule, completedAtDate, byDay, interval, byMonthDay);
    let nextStartTime = task.startTime
        ? nextIsoFrom(strategy === 'fluid' ? completedAtIso : task.startTime, rule, completedAtDate, byDay, interval, byMonthDay)
        : undefined;
    if (!nextStartTime && nextDueDate) {
        nextStartTime = nextDueDate;
    }
    const nextReviewAt = task.reviewAt
        ? nextIsoFrom(strategy === 'fluid' ? completedAtIso : task.reviewAt, rule, completedAtDate, byDay, interval, byMonthDay)
        : undefined;

    let newStatus: TaskStatus = previousStatus;
    if (newStatus === 'done' || newStatus === 'archived') {
        newStatus = 'next';
    }

    const duplicatedAttachments = (task.attachments || [])
        .filter((attachment) => !attachment.deletedAt)
        .map<Attachment>((attachment) => ({
            ...attachment,
            id: uuidv4(),
            createdAt: completedAtIso,
            updatedAt: completedAtIso,
            deletedAt: undefined,
        }));

    return {
        id: uuidv4(),
        title: task.title,
        status: newStatus,
        startTime: nextStartTime,
        dueDate: nextDueDate,
        recurrence: task.recurrence,
        tags: [...(task.tags || [])],
        contexts: [...(task.contexts || [])],
        checklist: resetChecklist(task.checklist),
        description: task.description,
        attachments: duplicatedAttachments.length > 0 ? duplicatedAttachments : undefined,
        location: task.location,
        projectId: task.projectId,
        isFocusedToday: false,
        timeEstimate: task.timeEstimate,
        reviewAt: nextReviewAt,
        createdAt: completedAtIso,
        updatedAt: completedAtIso,
    };
}
