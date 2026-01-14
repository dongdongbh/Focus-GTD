import { useEffect, useMemo, useState, useRef } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, eachDayOfInterval } from 'date-fns';
import { parseIcs, safeParseDate, safeParseDueDate, type ExternalCalendarEvent, type ExternalCalendarSubscription, useTaskStore, type Task } from '@mindwtr/core';
import { useLanguage } from '../../contexts/language-context';
import { isTauriRuntime } from '../../lib/runtime';
import { ExternalCalendarService } from '../../lib/external-calendar-service';
import { cn } from '../../lib/utils';
import { reportError } from '../../lib/report-error';

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

export function CalendarView() {
    const { tasks, updateTask, deleteTask, settings } = useTaskStore();
    const { t } = useLanguage();
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const today = new Date();
    const [currentMonth] = useState(today);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [scheduleQuery, setScheduleQuery] = useState('');
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSubscription[]>([]);
    const [externalEvents, setExternalEvents] = useState<ExternalCalendarEvent[]>([]);
    const [externalError, setExternalError] = useState<string | null>(null);
    const [isExternalLoading, setIsExternalLoading] = useState(false);
    const [editingTimeTaskId, setEditingTimeTaskId] = useState<string | null>(null);
    const [editingTimeValue, setEditingTimeValue] = useState<string>('');
    const calendarBodyRef = useRef<HTMLDivElement | null>(null);

    const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    const days = eachDayOfInterval({
        start: calendarStart,
        end: calendarEnd,
    });

    const deadlinesByDay = useMemo(() => {
        const map = new Map<string, Task[]>();
        for (const task of tasks) {
            if (!task.dueDate) continue;
            const dueDate = safeParseDueDate(task.dueDate);
            if (!dueDate) continue;
            const key = dayKey(dueDate);
            const existing = map.get(key);
            if (existing) existing.push(task);
            else map.set(key, [task]);
        }
        return map;
    }, [tasks]);

    const scheduledByDay = useMemo(() => {
        const map = new Map<string, Task[]>();
        for (const task of tasks) {
            if (!task.startTime) continue;
            const startTime = safeParseDate(task.startTime);
            if (!startTime) continue;
            const key = dayKey(startTime);
            const existing = map.get(key);
            if (existing) existing.push(task);
            else map.set(key, [task]);
        }
        return map;
    }, [tasks]);

    const getDeadlinesForDay = (date: Date) => deadlinesByDay.get(dayKey(date)) ?? [];
    const getScheduledForDay = (date: Date) => scheduledByDay.get(dayKey(date)) ?? [];

    const getExternalEventsForDay = (date: Date) => {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
        return externalEvents.filter((event) => {
            const start = safeParseDate(event.start);
            const end = safeParseDate(event.end);
            if (!start || !end) return false;
            return start.getTime() < dayEnd.getTime() && end.getTime() > dayStart.getTime();
        });
    };

    const timeEstimateToMinutes = (estimate: any): number => {
        if (!timeEstimatesEnabled) return 30;
        switch (estimate) {
            case '5min': return 5;
            case '10min': return 10;
            case '15min': return 15;
            case '30min': return 30;
            case '1hr': return 60;
            case '2hr': return 120;
            case '3hr': return 180;
            case '4hr': return 240;
            case '4hr+': return 240;
            default: return 30;
        }
    };

    const ceilToMinutes = (date: Date, stepMinutes: number) => {
        const stepMs = stepMinutes * 60 * 1000;
        return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
    };

    const findFreeSlotForDay = (day: Date, durationMinutes: number, excludeTaskId?: string): Date | null => {
        const dayStart = new Date(day);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 0, 0, 0);

        const isTodaySelected = isSameDay(day, new Date());
        const earliest = ceilToMinutes(new Date(Math.max(dayStart.getTime(), isTodaySelected ? Date.now() : dayStart.getTime())), 5);

        type Interval = { start: number; end: number };
        const intervals: Interval[] = [];

        for (const event of getExternalEventsForDay(day)) {
            if (event.allDay) continue;
            const start = safeParseDate(event.start);
            const end = safeParseDate(event.end);
            if (!start || !end) continue;
            const s = Math.max(start.getTime(), dayStart.getTime());
            const e = Math.min(end.getTime(), dayEnd.getTime());
            if (e > s) intervals.push({ start: s, end: e });
        }

        for (const task of tasks) {
            if (task.deletedAt) continue;
            if (task.id === excludeTaskId) continue;
            if (task.status === 'done') continue;
            const start = task.startTime ? safeParseDate(task.startTime) : null;
            if (!start) continue;
            if (!isSameDay(start, day)) continue;
            const durMs = timeEstimateToMinutes(task.timeEstimate) * 60 * 1000;
            const s = Math.max(start.getTime(), dayStart.getTime());
            const e = Math.min(start.getTime() + durMs, dayEnd.getTime());
            if (e > s) intervals.push({ start: s, end: e });
        }

        intervals.sort((a, b) => a.start - b.start);
        const merged: Interval[] = [];
        for (const interval of intervals) {
            const last = merged[merged.length - 1];
            if (!last || interval.start > last.end) merged.push({ ...interval });
            else last.end = Math.max(last.end, interval.end);
        }

        const durationMs = durationMinutes * 60 * 1000;
        let cursor = Math.max(earliest.getTime(), dayStart.getTime());
        for (const interval of merged) {
            if (cursor + durationMs <= interval.start) return new Date(cursor);
            if (cursor < interval.end) cursor = interval.end;
        }

        if (cursor + durationMs <= dayEnd.getTime()) return new Date(cursor);
        return null;
    };

    const isSlotFreeForDay = (day: Date, startTime: Date, durationMinutes: number, excludeTaskId?: string) => {
        const dayStart = new Date(day);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 0, 0, 0);

        const startMs = startTime.getTime();
        const endMs = startMs + durationMinutes * 60 * 1000;
        if (startMs < dayStart.getTime() || endMs > dayEnd.getTime()) return false;

        const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart;

        for (const event of getExternalEventsForDay(day)) {
            if (event.allDay) continue;
            const start = safeParseDate(event.start);
            const end = safeParseDate(event.end);
            if (!start || !end) continue;
            const s = Math.max(start.getTime(), dayStart.getTime());
            const e = Math.min(end.getTime(), dayEnd.getTime());
            if (e > s && overlaps(startMs, endMs, s, e)) return false;
        }

        for (const task of tasks) {
            if (task.deletedAt) continue;
            if (task.id === excludeTaskId) continue;
            if (task.status === 'done') continue;
            const start = task.startTime ? safeParseDate(task.startTime) : null;
            if (!start) continue;
            if (!isSameDay(start, day)) continue;
            const durMs = timeEstimateToMinutes(task.timeEstimate) * 60 * 1000;
            const s = Math.max(start.getTime(), dayStart.getTime());
            const e = Math.min(start.getTime() + durMs, dayEnd.getTime());
            if (e > s && overlaps(startMs, endMs, s, e)) return false;
        }

        return true;
    };

    const calendarNameById = useMemo(() => new Map(externalCalendars.map((c) => [c.id, c.name])), [externalCalendars]);

    useEffect(() => {
        setEditingTimeTaskId(null);
        setEditingTimeValue('');
    }, [selectedDate]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsExternalLoading(true);
            setExternalError(null);
            try {
                const calendars = await ExternalCalendarService.getCalendars();
                if (cancelled) return;
                setExternalCalendars(calendars);

                const enabled = calendars.filter((c) => c.enabled);
                if (enabled.length === 0) {
                    setExternalEvents([]);
                    return;
                }

                const rangeStart = startOfMonth(currentMonth);
                const rangeEnd = endOfMonth(currentMonth);

                const fetchTextWithTimeout = async (url: string, timeoutMs: number) => {
                    if (isTauriRuntime()) {
                        const mod: any = await import('@tauri-apps/plugin-http');
                        const tauriFetch: any = mod.fetch;
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), timeoutMs);
                        try {
                            const res = await tauriFetch(url, { method: 'GET', signal: controller.signal });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            return await res.text();
                        } finally {
                            clearTimeout(timeout);
                        }
                    }

                    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                    try {
                        const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return await res.text();
                    } finally {
                        if (timeout) clearTimeout(timeout);
                    }
                };

                const results = await Promise.allSettled(
                    enabled.map(async (calendar) => {
                        const text = await fetchTextWithTimeout(calendar.url, 15_000);
                        return parseIcs(text, { sourceId: calendar.id, rangeStart, rangeEnd });
                    })
                );

                const events: ExternalCalendarEvent[] = [];
                for (const result of results) {
                    if (result.status !== 'fulfilled') continue;
                    events.push(...result.value);
                }

                if (cancelled) return;
                setExternalEvents(events);
            } catch (error) {
                if (cancelled) return;
                reportError('Failed to load external calendars', error);
                setExternalError(String(error));
                setExternalEvents([]);
            } finally {
                if (!cancelled) {
                    setIsExternalLoading(false);
                }
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [currentMonth]);

    const scheduleCandidates = useMemo(() => {
        if (!selectedDate) return [];
        const query = scheduleQuery.trim().toLowerCase();
        if (!query) return [];

        return tasks
            .filter((task) => {
                if (task.deletedAt) return false;
                if (task.status === 'done') return false;
                if (task.status !== 'next') return false;
                return task.title.toLowerCase().includes(query);
            })
            .slice(0, 12);
    }, [tasks, scheduleQuery, selectedDate]);

    useEffect(() => {
        if (!selectedDate) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!calendarBodyRef.current || calendarBodyRef.current.contains(target)) return;
            setSelectedDate(null);
            setScheduleQuery('');
            setScheduleError(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedDate]);

    const scheduleTaskOnSelectedDate = (taskId: string) => {
        if (!selectedDate) return;
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;

        const durationMinutes = timeEstimateToMinutes(task.timeEstimate);
        const slot = findFreeSlotForDay(selectedDate, durationMinutes, taskId);
        if (!slot) {
            setScheduleError(t('calendar.noFreeTime'));
            return;
        }

        updateTask(taskId, { startTime: slot.toISOString() })
            .catch((error) => reportError('Failed to update scheduled time', error));
        setScheduleQuery('');
        setScheduleError(null);
    };

    const beginEditScheduledTime = (taskId: string) => {
        if (!selectedDate) return;
        const task = tasks.find((t) => t.id === taskId);
        if (!task?.startTime) return;
        const start = safeParseDate(task.startTime);
        if (!start) return;
        setEditingTimeTaskId(taskId);
        setEditingTimeValue(format(start, 'HH:mm'));
    };

    const commitEditScheduledTime = async () => {
        if (!selectedDate) return;
        if (!editingTimeTaskId) return;
        const task = tasks.find((t) => t.id === editingTimeTaskId);
        if (!task) return;

        const [hh, mm] = editingTimeValue.split(':').map((v) => Number(v));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;

        const nextStart = new Date(selectedDate);
        nextStart.setHours(hh, mm, 0, 0);

        const durationMinutes = timeEstimateToMinutes(task.timeEstimate);
        const ok = isSlotFreeForDay(selectedDate, nextStart, durationMinutes, task.id);
        if (!ok) {
            setScheduleError(t('calendar.overlapWarning'));
            return;
        }

        await updateTask(task.id, { startTime: nextStart.toISOString() });
        setEditingTimeTaskId(null);
        setEditingTimeValue('');
        setScheduleError(null);
    };

    const openQuickAddForDate = (date: Date) => {
        const durationMinutes = 30;
        const slot = findFreeSlotForDay(date, durationMinutes);
        const fallback = new Date(date);
        fallback.setHours(9, 0, 0, 0);
        const start = slot ?? fallback;
        window.dispatchEvent(new CustomEvent('mindwtr:quick-add', {
            detail: {
                initialProps: { startTime: start.toISOString() },
            },
        }));
    };

    const cancelEditScheduledTime = () => {
        setEditingTimeTaskId(null);
        setEditingTimeValue('');
    };

    return (
        <ErrorBoundary>
            <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">{t('nav.calendar')}</h2>
                <div className="text-lg font-medium text-muted-foreground">
                    {format(currentMonth, 'MMMM yyyy')}
                </div>
            </header>

            <div ref={calendarBodyRef} className="space-y-6">
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden shadow-sm">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} className="bg-card p-2 text-center text-sm font-medium text-muted-foreground">
                            {day}
                        </div>
                    ))}

                    {days.map((day, _dayIdx) => {
                        const deadlines = getDeadlinesForDay(day);
                        const scheduled = getScheduledForDay(day);
                        const taskCount = new Set([...deadlines, ...scheduled].map((t) => t.id)).size;
                        const eventCount = getExternalEventsForDay(day).length;
                        const isSelected = selectedDate && isSameDay(day, selectedDate);

                        return (
                            <div
                                key={day.toString()}
                                className={cn(
                                    "group bg-card min-h-[120px] p-2 transition-colors hover:bg-accent/50 relative",
                                    !isSameMonth(day, currentMonth) && "bg-muted/50 text-muted-foreground",
                                    isToday(day) && "bg-accent/20",
                                    isSelected && "ring-2 ring-primary"
                                )}
                                onClick={() => setSelectedDate(day)}
                            >
                                <div className="flex justify-between items-start">
                                    <div className={cn(
                                        "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1",
                                        isToday(day) && "bg-primary text-primary-foreground"
                                    )}>
                                        {format(day, 'd')}
                                    </div>
                                    {(taskCount > 0 || eventCount > 0) && (
                                        <div className="flex items-center gap-1">
                                            {taskCount > 0 && (
                                                <div className="text-[10px] px-1.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                    {taskCount}
                                                </div>
                                            )}
                                            {eventCount > 0 && (
                                                <div className="text-[10px] px-1.5 rounded bg-muted/60 text-muted-foreground border border-border">
                                                    {eventCount}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    {deadlines.map(task => (
                                        <div
                                            key={task.id}
                                            className="text-xs truncate px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                                            title={task.title}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {task.title}
                                        </div>
                                    ))}
                                    {scheduled.slice(0, 2).map(task => (
                                        <div
                                            key={task.id}
                                            className="text-xs truncate px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                            title={task.title}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedDate(day);
                                            }}
                                        >
                                            {task.title}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {selectedDate && (
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <div className="flex items-baseline justify-between gap-4">
                            <div className="text-sm font-semibold">{format(selectedDate, 'PPPP')}</div>
                            <div className="flex items-center gap-3">
                                <button
                                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                    onClick={() => openQuickAddForDate(selectedDate)}
                                >
                                    {t('calendar.addTask')}
                                </button>
                                <button
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        setSelectedDate(null);
                                        setScheduleQuery('');
                                        setScheduleError(null);
                                    }}
                                >
                                    {t('common.close')}
                                </button>
                            </div>
                        </div>

                    <div className="space-y-2">
                        <input
                            type="text"
                            value={scheduleQuery}
                            onChange={(e) => {
                                setScheduleQuery(e.target.value);
                                if (scheduleError) setScheduleError(null);
                            }}
                            placeholder={t('calendar.schedulePlaceholder')}
                            className="w-full text-sm px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        {scheduleError && (
                            <div className="text-xs text-red-400">{scheduleError}</div>
                        )}

                        {scheduleCandidates.length > 0 && (
                            <div className="space-y-1">
                                <div className="text-xs text-muted-foreground">{t('calendar.scheduleResults')}</div>
                                <div className="flex flex-wrap gap-2">
                                    {scheduleCandidates.map((task) => (
                                        <button
                                            key={task.id}
                                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                            onClick={() => scheduleTaskOnSelectedDate(task.id)}
                                            title={task.title}
                                        >
                                            {task.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">{t('calendar.events')}</div>
                            <div className="space-y-1">
                                {isExternalLoading && (
                                    <div className="text-sm text-muted-foreground">Loading…</div>
                                )}
                                {externalError && (
                                    <div className="text-sm text-red-400">{externalError}</div>
                                )}
                                {getExternalEventsForDay(selectedDate).map((event) => {
                                    const start = safeParseDate(event.start);
                                    const end = safeParseDate(event.end);
                                    const timeLabel = event.allDay
                                        ? t('calendar.allDay')
                                        : start && end
                                            ? `${format(start, 'HH:mm')}-${format(end, 'HH:mm')}`
                                            : '';
                                    const sourceLabel = calendarNameById.get(event.sourceId);
                                    return (
                                        <div key={event.id} className="text-sm truncate">
                                            <span className="text-muted-foreground mr-2">{timeLabel}</span>
                                            {event.title}
                                            {sourceLabel ? ` (${sourceLabel})` : ''}
                                        </div>
                                    );
                                })}
                                {!isExternalLoading && !externalError && getExternalEventsForDay(selectedDate).length === 0 && (
                                    <div className="text-sm text-muted-foreground">{t('calendar.noTasks')}</div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">{t('calendar.deadline')}</div>
                            <div className="space-y-1">
                                {getDeadlinesForDay(selectedDate).map((task) => (
                                    <div key={task.id} className="text-sm truncate">
                                        {task.title}
                                    </div>
                                ))}
                                {getDeadlinesForDay(selectedDate).length === 0 && (
                                    <div className="text-sm text-muted-foreground">{t('calendar.noTasks')}</div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">{t('review.startTime')}</div>
                            <div className="space-y-1">
                                {getScheduledForDay(selectedDate).map((task) => {
                                    const start = safeParseDate(task.startTime);
                                    if (!start) return null;
                                    const durMs = timeEstimateToMinutes(task.timeEstimate) * 60 * 1000;
                                    const end = new Date(start.getTime() + durMs);
                                    const label = `${format(start, 'HH:mm')}-${format(end, 'HH:mm')}`;
                                    return (
                                        <div key={task.id} className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 text-sm truncate">
                                                <span className="text-muted-foreground mr-2">{label}</span>
                                                {task.title}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {editingTimeTaskId === task.id ? (
                                                    <>
                                                        <input
                                                            type="time"
                                                            value={editingTimeValue}
                                                            onChange={(e) => setEditingTimeValue(e.target.value)}
                                                            className="text-xs px-2 py-1 rounded border border-border bg-background"
                                                        />
                                                        <button
                                                            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                                                            onClick={commitEditScheduledTime}
                                                        >
                                                            {t('common.save')}
                                                        </button>
                                                        <button
                                                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                                            onClick={cancelEditScheduledTime}
                                                        >
                                                            {t('common.cancel')}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                                            onClick={() => beginEditScheduledTime(task.id)}
                                                        >
                                                            {t('common.edit')}
                                                        </button>
                                                        <button
                                                            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
                                                            onClick={() => updateTask(task.id, { startTime: undefined })
                                                                .catch((error) => reportError('Failed to clear scheduled time', error))}
                                                            title={t('calendar.unschedule')}
                                                        >
                                                            {t('calendar.unschedule')}
                                                        </button>
                                                        <button
                                                            className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground"
                                                            onClick={() => deleteTask(task.id)
                                                                .catch((error) => reportError('Failed to delete task', error))}
                                                        >
                                                            {t('common.delete')}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {getScheduledForDay(selectedDate).length === 0 && (
                                    <div className="text-sm text-muted-foreground">{t('calendar.noTasks')}</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
            </div>
        </ErrorBoundary>
    );
}
