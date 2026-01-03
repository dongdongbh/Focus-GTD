import { translations, type AppData, type Language, safeParseDate } from '@mindwtr/core';

export const WIDGET_DATA_KEY = 'mindwtr-data';
export const WIDGET_LANGUAGE_KEY = 'mindwtr-language';

export interface WidgetTaskItem {
    id: string;
    title: string;
    statusLabel: string;
}

export interface TasksWidgetPayload {
    headerTitle: string;
    inboxLabel: string;
    inboxCount: number;
    items: WidgetTaskItem[];
    emptyMessage: string;
    captureLabel: string;
}

export function resolveWidgetLanguage(saved: string | null, setting?: string): Language {
    const candidate = setting && setting !== 'system' ? setting : saved;
    if (candidate === 'zh' || candidate === 'es' || candidate === 'hi' || candidate === 'ar') {
        return candidate as Language;
    }
    return 'en';
}

export function buildWidgetPayload(data: AppData, language: Language): TasksWidgetPayload {
    const tr = translations[language];
    const tasks = data.tasks || [];
    const now = new Date();

    const activeTasks = tasks.filter((task) => {
        if (task.deletedAt) return false;
        if (task.status === 'archived' || task.status === 'done') return false;
        if (task.startTime) {
            const start = safeParseDate(task.startTime);
            if (start && start > now) return false;
        }
        return true;
    });

    const focusedTasks = activeTasks.filter((task) => task.isFocusedToday);
    const showFocused = focusedTasks.length > 0;
    const listSource = showFocused
        ? focusedTasks
        : activeTasks.filter((task) => task.status === 'next');

    const items = listSource.slice(0, 3).map((task) => ({
        id: task.id,
        title: task.title,
        statusLabel: tr[`status.${task.status}`] || task.status,
    }));

    const inboxCount = activeTasks.filter((task) => task.status === 'inbox').length;

    return {
        headerTitle: showFocused ? tr['agenda.todaysFocus'] : tr['agenda.nextActions'],
        inboxLabel: tr['nav.inbox'],
        inboxCount,
        items,
        emptyMessage: tr['agenda.noTasks'],
        captureLabel: tr['widget.capture'],
    };
}
