import { matchesHierarchicalToken, safeParseDueDate, searchAll, type Project, type Task, type TaskStatus } from '@mindwtr/core';
import { AREA_FILTER_ALL, AREA_FILTER_NONE } from '../lib/area-filter';

export type GlobalSearchScope = 'all' | 'projects' | 'tasks' | 'project_tasks';
export type DuePreset = 'any' | 'none' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week';

type ComputeGlobalSearchResultsInput = {
    query: string;
    tasks: Task[];
    projects: Project[];
    areas: Array<{ id: string }>;
    globalAreaFilter: string;
    includeCompleted: boolean;
    includeReference: boolean;
    selectedStatuses: TaskStatus[];
    selectedArea: string;
    selectedTokens: string[];
    duePreset: DuePreset;
    scope: GlobalSearchScope;
    weekStart: 'sunday' | 'monday';
    ftsResults?: { tasks: Task[]; projects: Project[] } | null;
};

const buildDueMatcher = (duePreset: DuePreset, weekStart: number) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    const weekday = startOfWeek.getDay();
    const diffToWeekStart = weekStart === 1 ? (weekday + 6) % 7 : weekday;
    startOfWeek.setDate(startOfWeek.getDate() - diffToWeekStart);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const nextWeekStart = new Date(endOfWeek);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 7);

    return (task: Task) => {
        if (duePreset === 'any') return true;
        if (duePreset === 'none') return !task.dueDate;
        if (!task.dueDate) return false;
        const due = safeParseDueDate(task.dueDate);
        if (!due) return false;
        if (duePreset === 'overdue') return due < startOfToday;
        if (duePreset === 'today') return due >= startOfToday && due < new Date(startOfToday.getTime() + 86400000);
        if (duePreset === 'tomorrow') {
            const tomorrow = new Date(startOfToday.getTime() + 86400000);
            const nextDay = new Date(startOfToday.getTime() + 2 * 86400000);
            return due >= tomorrow && due < nextDay;
        }
        if (duePreset === 'this_week') return due >= startOfWeek && due < endOfWeek;
        if (duePreset === 'next_week') return due >= nextWeekStart && due < nextWeekEnd;
        return true;
    };
};

export const computeGlobalSearchResults = ({
    query,
    tasks,
    projects,
    areas,
    globalAreaFilter,
    includeCompleted,
    includeReference,
    selectedStatuses,
    selectedArea,
    selectedTokens,
    duePreset,
    scope,
    weekStart,
    ftsResults,
}: ComputeGlobalSearchResultsInput) => {
    const trimmedQuery = query.trim();
    const fallbackResults = trimmedQuery === ''
        ? { tasks: [] as Task[], projects: [] as Project[] }
        : searchAll(tasks, projects, trimmedQuery);
    const effectiveResults = ftsResults && (ftsResults.tasks.length + ftsResults.projects.length) > 0
        ? ftsResults
        : fallbackResults;

    const hasStatusFilter = selectedStatuses.length > 0;
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const areaById = new Map(areas.map((area) => [area.id, area]));

    const matchesGlobalArea = (areaId?: string | null) => {
        const normalized = areaId && areaById.has(areaId) ? areaId : null;
        if (globalAreaFilter === AREA_FILTER_ALL) return true;
        if (globalAreaFilter === AREA_FILTER_NONE) return !normalized;
        return normalized === globalAreaFilter;
    };

    const matchesArea = (areaId?: string | null) => {
        const normalized = areaId && areaById.has(areaId) ? areaId : null;
        if (!matchesGlobalArea(normalized)) return false;
        if (selectedArea === 'all') return true;
        if (selectedArea === 'none') return !normalized;
        return normalized === selectedArea;
    };

    const matchesTaskArea = (task: Task) => {
        const areaId = task.projectId
            ? projectById.get(task.projectId)?.areaId ?? null
            : task.areaId ?? null;
        return matchesArea(areaId);
    };

    const matchesTokens = (task: Task) => {
        if (selectedTokens.length === 0) return true;
        const taskTokens = [...(task.contexts || []), ...(task.tags || [])];
        return selectedTokens.every((token) =>
            taskTokens.some((taskToken) => matchesHierarchicalToken(token, taskToken))
        );
    };

    const matchesDue = buildDueMatcher(duePreset, weekStart === 'monday' ? 1 : 0);

    const filteredTasks = effectiveResults.tasks.filter((task) => {
        if (hasStatusFilter) {
            if (!selectedStatuses.includes(task.status)) return false;
        } else {
            if (!includeCompleted && ['done', 'archived'].includes(task.status)) return false;
            if (!includeReference && task.status === 'reference') return false;
        }
        if (scope === 'project_tasks' && !task.projectId) return false;
        if (!matchesTaskArea(task)) return false;
        if (!matchesTokens(task)) return false;
        if (!matchesDue(task)) return false;
        return true;
    });

    const filteredProjects = effectiveResults.projects.filter((project) => {
        if (!includeCompleted && project.status === 'archived') return false;
        if (!matchesArea(project.areaId ?? null)) return false;
        return true;
    });

    const scopedProjects = scope === 'tasks' || scope === 'project_tasks' ? [] : filteredProjects;
    const scopedTasks = scope === 'projects' ? [] : filteredTasks;
    const totalResults = scopedProjects.length + scopedTasks.length;
    const results = trimmedQuery === '' ? [] : [
        ...scopedProjects.map((project) => ({ type: 'project' as const, item: project })),
        ...scopedTasks.map((task) => ({ type: 'task' as const, item: task })),
    ].slice(0, 50);

    return {
        totalResults,
        results,
        isTruncated: totalResults > results.length,
    };
};
