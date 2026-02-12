import { PRESET_CONTEXTS, PRESET_TAGS } from './contexts';
import { createNextRecurringTask } from './recurrence';
import { rescheduleTask } from './task-utils';
import type { AppData, Project, Task, TaskStatus } from './types';
import { generateUUID as uuidv4 } from './uuid';
import type { DerivedState, SaveBaseState } from './store-types';

export const normalizeRevision = (value?: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const ensureDeviceId = (settings: AppData['settings']): { settings: AppData['settings']; deviceId: string; updated: boolean } => {
    if (settings.deviceId) {
        return { settings, deviceId: settings.deviceId, updated: false };
    }
    const deviceId = uuidv4();
    return { settings: { ...settings, deviceId }, deviceId, updated: true };
};

export function applyTaskUpdates(oldTask: Task, updates: Partial<Task>, now: string): { updatedTask: Task; nextRecurringTask: Task | null } {
    let normalizedUpdates = updates;
    if (Object.prototype.hasOwnProperty.call(updates, 'textDirection') && updates.textDirection === undefined) {
        normalizedUpdates = { ...updates };
        delete normalizedUpdates.textDirection;
    }
    const updatesToApply = normalizedUpdates;
    const incomingStatus = updates.status ?? oldTask.status;
    const statusChanged = incomingStatus !== oldTask.status;

    let finalUpdates: Partial<Task> = updatesToApply;
    let nextRecurringTask: Task | null = null;
    const isCompleteStatus = (status: TaskStatus) => status === 'done' || status === 'archived';

    if (statusChanged && incomingStatus === 'done') {
        finalUpdates = {
            ...updatesToApply,
            status: incomingStatus,
            completedAt: now,
            isFocusedToday: false,
        };
        nextRecurringTask = createNextRecurringTask(oldTask, now, oldTask.status);
    } else if (statusChanged && incomingStatus === 'archived') {
        finalUpdates = {
            ...updatesToApply,
            status: incomingStatus,
            completedAt: oldTask.completedAt || now,
            isFocusedToday: false,
        };
    } else if (statusChanged && isCompleteStatus(oldTask.status) && !isCompleteStatus(incomingStatus)) {
        finalUpdates = {
            ...updatesToApply,
            status: incomingStatus,
            completedAt: undefined,
        };
    }

    if (Object.prototype.hasOwnProperty.call(updatesToApply, 'dueDate') && incomingStatus !== 'reference') {
        const rescheduled = rescheduleTask(oldTask, updatesToApply.dueDate);
        finalUpdates = {
            ...finalUpdates,
            dueDate: rescheduled.dueDate,
            pushCount: rescheduled.pushCount,
        };
    }

    // Reference tasks should be non-actionable; clear scheduling/priority fields.
    if (incomingStatus === 'reference') {
        finalUpdates = {
            ...finalUpdates,
            status: incomingStatus,
            startTime: undefined,
            dueDate: undefined,
            reviewAt: undefined,
            recurrence: undefined,
            priority: undefined,
            timeEstimate: undefined,
            checklist: undefined,
            isFocusedToday: false,
            pushCount: 0,
        };
    }

    return {
        updatedTask: { ...oldTask, ...finalUpdates, updatedAt: now },
        nextRecurringTask,
    };
}

const isTaskVisible = (task?: Task | null) => Boolean(task && !task.deletedAt && task.status !== 'archived');

export const updateVisibleTasks = (visible: Task[], previous?: Task | null, next?: Task | null): Task[] => {
    const wasVisible = isTaskVisible(previous);
    const isVisible = isTaskVisible(next);
    if (wasVisible && isVisible && next) {
        return visible.map((task) => (task.id === next.id ? next : task));
    }
    if (wasVisible && !isVisible && previous) {
        return visible.filter((task) => task.id !== previous.id);
    }
    if (!wasVisible && isVisible && next) {
        return [...visible, next];
    }
    return visible;
};

export const buildSaveSnapshot = (state: SaveBaseState, overrides?: Partial<AppData>): AppData => ({
    tasks: overrides?.tasks ?? state._allTasks,
    projects: overrides?.projects ?? state._allProjects,
    sections: overrides?.sections ?? state._allSections,
    areas: overrides?.areas ?? state._allAreas,
    settings: overrides?.settings ?? state.settings,
});

export const computeDerivedState = (tasks: Task[], projects: Project[]): DerivedState => {
    const projectMap = new Map<string, Project>();
    const tasksById = new Map<string, Task>();
    const activeTasksByStatus = new Map<TaskStatus, Task[]>();
    const contextsSet = new Set<string>(PRESET_CONTEXTS);
    const tagsSet = new Set<string>(PRESET_TAGS);
    const sequentialProjectIds = new Set<string>();

    projects.forEach((project) => {
        projectMap.set(project.id, project);
        if (project.isSequential && !project.deletedAt) {
            sequentialProjectIds.add(project.id);
        }
    });

    tasks.forEach((task) => {
        tasksById.set(task.id, task);
        if (task.deletedAt) return;
        const list = activeTasksByStatus.get(task.status) ?? [];
        list.push(task);
        activeTasksByStatus.set(task.status, list);
        task.contexts?.forEach((ctx) => contextsSet.add(ctx));
        task.tags?.forEach((tag) => tagsSet.add(tag));
    });

    return {
        projectMap,
        tasksById,
        activeTasksByStatus,
        allContexts: Array.from(contextsSet).sort(),
        allTags: Array.from(tagsSet).sort(),
        sequentialProjectIds,
    };
};

export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

export const normalizeTagId = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const withPrefix = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return withPrefix.toLowerCase();
};

export const stripSensitiveSettings = (settings: AppData['settings']): AppData['settings'] => {
    if (!settings?.ai || !settings.ai.apiKey) return settings;
    return {
        ...settings,
        ai: {
            ...settings.ai,
            apiKey: undefined,
        },
    };
};

export const normalizeAiSettingsForSync = (ai?: AppData['settings']['ai']): AppData['settings']['ai'] | undefined => {
    if (!ai) return ai;
    const { apiKey, ...rest } = ai;
    if (!rest.speechToText) return rest;
    return {
        ...rest,
        speechToText: {
            ...rest.speechToText,
            offlineModelPath: undefined,
        },
    };
};

export const cloneSettings = (settings: AppData['settings']): AppData['settings'] => {
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(settings);
        }
    } catch {
        // Fallback below
    }
    return JSON.parse(JSON.stringify(settings)) as AppData['settings'];
};

export const sanitizeAppDataForStorage = (data: AppData): AppData => ({
    ...data,
    settings: stripSensitiveSettings(cloneSettings(data.settings)),
});

let projectOrderCacheVersion: number | null = null;
let projectOrderCache: Map<string, number> | null = null;

export const getNextProjectOrder = (
    projectId: string | undefined,
    tasks: Task[],
    cacheKey?: number
): number | undefined => {
    if (!projectId) return undefined;
    let cache = cacheKey !== undefined && projectOrderCacheVersion === cacheKey ? projectOrderCache : null;
    if (!cache) {
        cache = new Map<string, number>();
        // Build a max-order index once per tasks array to avoid O(n) scans per project.
        for (const task of tasks) {
            if (!task.projectId || task.deletedAt) continue;
            const order = Number.isFinite(task.orderNum) ? (task.orderNum as number) : -1;
            const current = cache.get(task.projectId);
            if (current === undefined) {
                cache.set(task.projectId, Math.max(order, -1) + 1);
            } else if (order >= current) {
                cache.set(task.projectId, order + 1);
            }
        }
        if (cacheKey !== undefined) {
            projectOrderCacheVersion = cacheKey;
            projectOrderCache = cache;
        }
    }
    const cached = cache.get(projectId);
    if (cached !== undefined) {
        cache.set(projectId, cached + 1);
        return cached;
    }
    cache.set(projectId, 1);
    return 0;
};
