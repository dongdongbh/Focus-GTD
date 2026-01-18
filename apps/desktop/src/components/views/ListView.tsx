import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Folder } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { shallow, useTaskStore, TaskPriority, TimeEstimate, sortTasksBy, parseQuickAdd, matchesHierarchicalToken, safeParseDate, isTaskInActiveProject } from '@mindwtr/core';
import type { Task, TaskStatus } from '@mindwtr/core';
import type { TaskSortBy } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { ErrorBoundary } from '../ErrorBoundary';
import { ListEmptyState } from './list/ListEmptyState';
import { ListQuickAdd } from './list/ListQuickAdd';
import { PromptModal } from '../PromptModal';
import { InboxProcessor } from './InboxProcessor';
import { ListFiltersPanel } from './list/ListFiltersPanel';
import { ListHeader } from './list/ListHeader';
import { ListBulkActions } from './list/ListBulkActions';
import { useLanguage } from '../../contexts/language-context';
import { useKeybindings } from '../../contexts/keybinding-context';
import { useListCopilot } from './list/useListCopilot';
import { useUiStore } from '../../store/ui-store';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import { checkBudget } from '../../config/performanceBudgets';
import { useListViewOptimizations } from '../../hooks/useListViewOptimizations';
import { reportError } from '../../lib/report-error';


interface ListViewProps {
    title: string;
    statusFilter: TaskStatus | 'all';
}

const EMPTY_PRIORITIES: TaskPriority[] = [];
const EMPTY_ESTIMATES: TimeEstimate[] = [];
const VIRTUALIZATION_THRESHOLD = 25;
const VIRTUAL_ROW_ESTIMATE = 120;
const VIRTUAL_OVERSCAN = 600;

export function ListView({ title, statusFilter }: ListViewProps) {
    const perf = usePerformanceMonitor('ListView');
    const {
        tasks,
        projects,
        areas,
        settings,
        updateSettings,
        addTask,
        addProject,
        updateTask,
        updateProject,
        deleteTask,
        moveTask,
        batchMoveTasks,
        batchDeleteTasks,
        batchUpdateTasks,
        queryTasks,
        lastDataChangeAt,
        highlightTaskId,
        setHighlightTask,
    } = useTaskStore(
        (state) => ({
            tasks: state.tasks,
            projects: state.projects,
            areas: state.areas,
            settings: state.settings,
            updateSettings: state.updateSettings,
            addTask: state.addTask,
            addProject: state.addProject,
            updateTask: state.updateTask,
            updateProject: state.updateProject,
            deleteTask: state.deleteTask,
            moveTask: state.moveTask,
            batchMoveTasks: state.batchMoveTasks,
            batchDeleteTasks: state.batchDeleteTasks,
            batchUpdateTasks: state.batchUpdateTasks,
            queryTasks: state.queryTasks,
            lastDataChangeAt: state.lastDataChangeAt,
            highlightTaskId: state.highlightTaskId,
            setHighlightTask: state.setHighlightTask,
        }),
        shallow
    );
    const { t } = useLanguage();
    const { registerTaskListScope } = useKeybindings();
    const sortBy = (settings?.taskSortBy ?? 'default') as TaskSortBy;
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const listFilters = useUiStore((state) => state.listFilters);
    const setListFilters = useUiStore((state) => state.setListFilters);
    const resetListFilters = useUiStore((state) => state.resetListFilters);
    const showListDetails = useUiStore((state) => state.listOptions.showDetails);
    const setListOptions = useUiStore((state) => state.setListOptions);
    const setProjectView = useUiStore((state) => state.setProjectView);
    const [baseTasks, setBaseTasks] = useState<Task[]>(() => (statusFilter === 'archived' ? [] : tasks));
    const queryCacheRef = useRef<Map<string, Task[]>>(new Map());
    const selectedTokens = listFilters.tokens;
    const selectedPriorities = listFilters.priorities;
    const selectedTimeEstimates = listFilters.estimates;
    const filtersOpen = listFilters.open;
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [selectionMode, setSelectionMode] = useState(false);
    const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
    const [tagPromptOpen, setTagPromptOpen] = useState(false);
    const [tagPromptIds, setTagPromptIds] = useState<string[]>([]);
    const lastFilterKeyRef = useRef<string>('');
    const addInputRef = useRef<HTMLInputElement>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const showQuickDone = statusFilter !== 'done' && statusFilter !== 'archived';
    const readOnly = statusFilter === 'done';
    const activePriorities = useMemo(
        () => (prioritiesEnabled ? selectedPriorities : EMPTY_PRIORITIES),
        [prioritiesEnabled, selectedPriorities]
    );
    const activeTimeEstimates = useMemo(
        () => (timeEstimatesEnabled ? selectedTimeEstimates : EMPTY_ESTIMATES),
        [timeEstimatesEnabled, selectedTimeEstimates]
    );

    useEffect(() => {
        if (!perf.enabled) return;
        const timer = window.setTimeout(() => {
            checkBudget('ListView', perf.metrics, 'complex');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [perf.enabled]);

    const exitSelectionMode = useCallback(() => {
        setSelectionMode(false);
        setMultiSelectedIds(new Set());
    }, []);

    const [isProcessing, setIsProcessing] = useState(false);
    const {
        allContexts,
        allTags,
        projectMap,
        sequentialProjectFirstTasks,
        tasksById,
        tokenCounts,
        nextCount,
    } = useListViewOptimizations(tasks, baseTasks, statusFilter, perf);
    const allTokens = useMemo(() => {
        return Array.from(new Set([...allContexts, ...allTags])).sort();
    }, [allContexts, allTags]);

    const {
        aiEnabled,
        copilotSuggestion,
        copilotApplied,
        copilotContext,
        copilotTags,
        applyCopilotSuggestion,
        resetCopilot,
    } = useListCopilot({
        settings,
        newTaskTitle,
        allContexts,
        allTags,
    });

    const projectOrderMap = useMemo(() => {
        const sorted = [...projects]
            .filter((project) => !project.deletedAt)
            .sort((a, b) => {
                const aOrder = Number.isFinite(a.order) ? (a.order as number) : Number.POSITIVE_INFINITY;
                const bOrder = Number.isFinite(b.order) ? (b.order as number) : Number.POSITIVE_INFINITY;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.title.localeCompare(b.title);
            });
        const map = new Map<string, number>();
        sorted.forEach((project, index) => map.set(project.id, index));
        return map;
    }, [projects]);

    const sortByProjectOrder = useCallback((items: Task[]) => {
        return [...items].sort((a, b) => {
            const aProjectOrder = a.projectId ? (projectOrderMap.get(a.projectId) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
            const bProjectOrder = b.projectId ? (projectOrderMap.get(b.projectId) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
            if (aProjectOrder !== bProjectOrder) return aProjectOrder - bProjectOrder;
            const aOrder = Number.isFinite(a.orderNum) ? (a.orderNum as number) : Number.POSITIVE_INFINITY;
            const bOrder = Number.isFinite(b.orderNum) ? (b.orderNum as number) : Number.POSITIVE_INFINITY;
            if (aOrder !== bOrder) return aOrder - bOrder;
            const aCreated = safeParseDate(a.createdAt)?.getTime() ?? 0;
            const bCreated = safeParseDate(b.createdAt)?.getTime() ?? 0;
            return aCreated - bCreated;
        });
    }, [projectOrderMap]);

    // For sequential projects, get only the first task to show in Next view

    useEffect(() => {
        perf.trackUseEffect();
        let cancelled = false;
        const status = statusFilter === 'all' ? undefined : statusFilter;
        const cacheKey = `${statusFilter}-${lastDataChangeAt}`;
        const cached = queryCacheRef.current.get(cacheKey);
        if (cached) {
            setBaseTasks(cached);
            return;
        }
        queryTasks({
            status,
            includeArchived: status === 'archived',
            includeDeleted: false,
        }).then((result) => {
            if (cancelled) return;
            setBaseTasks(result);
            queryCacheRef.current.set(cacheKey, result);
            if (queryCacheRef.current.size > 10) {
                const firstKey = queryCacheRef.current.keys().next().value;
                if (firstKey) queryCacheRef.current.delete(firstKey);
            }
        }).catch(() => {
            if (!cancelled) setBaseTasks([]);
        });
        return () => {
            cancelled = true;
        };
    }, [statusFilter, queryTasks, lastDataChangeAt]);

    const filteredTasks = useMemo(() => {
        perf.trackUseMemo();
        return perf.measure('filteredTasks', () => {
            const now = new Date();
            const allowDeferredProjectTasks = statusFilter === 'done' || statusFilter === 'archived';
            const hideProjectTasksInDeferredList = statusFilter === 'someday' || statusFilter === 'waiting';
            const filtered = baseTasks.filter(t => {
                // Always filter out soft-deleted tasks
                if (t.deletedAt) return false;

                if (statusFilter !== 'all' && t.status !== statusFilter) return false;
                // Respect statusFilter (handled above).
                if (!allowDeferredProjectTasks && !isTaskInActiveProject(t, projectMap)) return false;
                if (hideProjectTasksInDeferredList && t.projectId && projectMap.get(t.projectId)) return false;

                if (statusFilter === 'inbox') {
                    const start = safeParseDate(t.startTime);
                    if (start && start > now) return false;
                }
                if (statusFilter === 'next') {
                    const start = safeParseDate(t.startTime);
                    if (start && start > now) return false;
                }

                // Sequential project filter: for 'next' status, only show first task from sequential projects
                if (statusFilter === 'next' && t.projectId) {
                    const project = projectMap.get(t.projectId);
                    if (project?.isSequential) {
                        // Only include if this is the first task
                        if (!sequentialProjectFirstTasks.has(t.id)) return false;
                    }
                }


                const taskTokens = [...(t.contexts || []), ...(t.tags || [])];
                if (selectedTokens.length > 0) {
                    const matchesAll = selectedTokens.every((token) =>
                        taskTokens.some((taskToken) => matchesHierarchicalToken(token, taskToken))
                    );
                    if (!matchesAll) return false;
                }
                if (activePriorities.length > 0 && (!t.priority || !activePriorities.includes(t.priority))) return false;
                if (activeTimeEstimates.length > 0 && (!t.timeEstimate || !activeTimeEstimates.includes(t.timeEstimate))) return false;
                return true;
            });

            if (statusFilter === 'next' && sortBy === 'default') {
                return sortByProjectOrder(filtered);
            }

            return sortTasksBy(filtered, sortBy);
        });
    }, [baseTasks, statusFilter, selectedTokens, activePriorities, activeTimeEstimates, sequentialProjectFirstTasks, projectMap, sortBy, sortByProjectOrder]);

    const showDeferredProjects = statusFilter === 'someday' || statusFilter === 'waiting';
    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
    const deferredProjects = showDeferredProjects
        ? [...projects]
            .filter((project) => !project.deletedAt && project.status === statusFilter)
            .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title))
        : [];
    const showDeferredProjectSection = showDeferredProjects && deferredProjects.length > 0;
    const showEmptyState = filteredTasks.length === 0 && !showDeferredProjectSection;
    const handleOpenProject = useCallback((projectId: string) => {
        setProjectView({ selectedProjectId: projectId });
        window.dispatchEvent(new CustomEvent('mindwtr:navigate', { detail: { view: 'projects' } }));
    }, [setProjectView]);
    const handleReactivateProject = useCallback((projectId: string) => {
        updateProject(projectId, { status: 'active' })
            .catch((error) => reportError('Failed to reactivate project', error));
    }, [updateProject]);

    const shouldVirtualize = filteredTasks.length > VIRTUALIZATION_THRESHOLD;
    const rowVirtualizer = useVirtualizer({
        count: shouldVirtualize ? filteredTasks.length : 0,
        getScrollElement: () => listScrollRef.current,
        estimateSize: () => VIRTUAL_ROW_ESTIMATE,
        overscan: Math.max(2, Math.ceil(VIRTUAL_OVERSCAN / VIRTUAL_ROW_ESTIMATE)),
        getItemKey: (index) => filteredTasks[index]?.id ?? index,
    });
    const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];
    const totalHeight = shouldVirtualize ? rowVirtualizer.getTotalSize() : 0;

    useEffect(() => {
        const filterKey = [
            statusFilter,
            prioritiesEnabled ? '1' : '0',
            timeEstimatesEnabled ? '1' : '0',
            selectedTokens.join('|'),
            selectedPriorities.join('|'),
            selectedTimeEstimates.join('|'),
        ].join('::');
        if (lastFilterKeyRef.current !== filterKey) {
            lastFilterKeyRef.current = filterKey;
            setSelectedIndex(0);
            exitSelectionMode();
            return;
        }
        if (filteredTasks.length === 0) {
            if (selectedIndex !== 0) {
                setSelectedIndex(0);
            }
            return;
        }
        if (selectedIndex >= filteredTasks.length) {
            setSelectedIndex(filteredTasks.length - 1);
            return;
        }
        const task = filteredTasks[selectedIndex];
        if (!task) return;
        const el = document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null;
        if (el && typeof (el as any).scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (shouldVirtualize && listScrollRef.current) {
            rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
        }
    }, [
        statusFilter,
        selectedTokens,
        selectedPriorities,
        selectedTimeEstimates,
        prioritiesEnabled,
        timeEstimatesEnabled,
        exitSelectionMode,
        filteredTasks,
        selectedIndex,
        shouldVirtualize,
        rowVirtualizer,
    ]);

    useEffect(() => {
        if (!highlightTaskId) return;
        const index = filteredTasks.findIndex((task) => task.id === highlightTaskId);
        if (index < 0) return;
        setSelectedIndex(index);
        if (shouldVirtualize && listScrollRef.current) {
            rowVirtualizer.scrollToIndex(index, { align: 'center' });
        }
        const el = document.querySelector(`[data-task-id="${highlightTaskId}"]`) as HTMLElement | null;
        if (el && typeof (el as any).scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center' });
        }
        const timer = window.setTimeout(() => setHighlightTask(null), 4000);
        return () => window.clearTimeout(timer);
    }, [highlightTaskId, filteredTasks, shouldVirtualize, rowVirtualizer, setHighlightTask]);

    const selectNext = useCallback(() => {
        if (filteredTasks.length === 0) return;
        setSelectedIndex((i) => Math.min(i + 1, filteredTasks.length - 1));
    }, [filteredTasks.length]);

    const selectPrev = useCallback(() => {
        setSelectedIndex((i) => Math.max(i - 1, 0));
    }, []);

    const selectFirst = useCallback(() => {
        setSelectedIndex(0);
    }, []);

    const selectLast = useCallback(() => {
        if (filteredTasks.length > 0) {
            setSelectedIndex(filteredTasks.length - 1);
        }
    }, [filteredTasks.length]);

    const editSelected = useCallback(() => {
        const task = filteredTasks[selectedIndex];
        if (!task) return;
        const editTrigger = document.querySelector(
            `[data-task-id="${task.id}"] [data-task-edit-trigger]`
        ) as HTMLElement | null;
        editTrigger?.focus();
        editTrigger?.click();
    }, [filteredTasks, selectedIndex]);

    const toggleDoneSelected = useCallback(() => {
        const task = filteredTasks[selectedIndex];
        if (!task) return;
        moveTask(task.id, task.status === 'done' ? 'inbox' : 'done');
    }, [filteredTasks, selectedIndex, moveTask]);

    const deleteSelected = useCallback(() => {
        const task = filteredTasks[selectedIndex];
        if (!task) return;
        deleteTask(task.id);
    }, [filteredTasks, selectedIndex, deleteTask]);

    useEffect(() => {
        if (isProcessing) {
            registerTaskListScope(null);
            return;
        }

        registerTaskListScope({
            kind: 'taskList',
            selectNext,
            selectPrev,
            selectFirst,
            selectLast,
            editSelected,
            toggleDoneSelected,
            deleteSelected,
            focusAddInput: () => addInputRef.current?.focus(),
        });

        return () => registerTaskListScope(null);
    }, [
        registerTaskListScope,
        isProcessing,
        selectNext,
        selectPrev,
        selectFirst,
        selectLast,
        editSelected,
        toggleDoneSelected,
        deleteSelected,
    ]);

    const toggleMultiSelect = useCallback((taskId: string) => {
        setMultiSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    }, []);

    const handleSelectIndex = useCallback((index: number) => {
        if (!selectionMode) setSelectedIndex(index);
    }, [selectionMode]);

    const selectedIdsArray = useMemo(() => Array.from(multiSelectedIds), [multiSelectedIds]);

    const handleBatchMove = useCallback(async (newStatus: TaskStatus) => {
        if (selectedIdsArray.length === 0) return;
        await batchMoveTasks(selectedIdsArray, newStatus);
        exitSelectionMode();
    }, [batchMoveTasks, selectedIdsArray, exitSelectionMode]);

    const handleBatchDelete = useCallback(async () => {
        if (selectedIdsArray.length === 0) return;
        const confirmMessage = t('list.confirmBatchDelete') || 'Delete selected tasks?';
        if (!window.confirm(confirmMessage)) return;
        await batchDeleteTasks(selectedIdsArray);
        exitSelectionMode();
    }, [batchDeleteTasks, selectedIdsArray, exitSelectionMode]);

    const handleBatchAddTag = useCallback(async () => {
        if (selectedIdsArray.length === 0) return;
        setTagPromptIds(selectedIdsArray);
        setTagPromptOpen(true);
    }, [batchUpdateTasks, selectedIdsArray, tasksById, t, exitSelectionMode]);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newTaskTitle.trim()) {
            const { title: parsedTitle, props, projectTitle } = parseQuickAdd(newTaskTitle, projects);
            const finalTitle = parsedTitle || newTaskTitle;
            const initialProps: Partial<Task> = { ...props };
            if (!initialProps.projectId && projectTitle) {
                const created = await addProject(projectTitle, '#94a3b8');
                initialProps.projectId = created.id;
            }
            // Only set status if we have an explicit filter and parser didn't set one
            if (!initialProps.status && statusFilter !== 'all') {
                initialProps.status = statusFilter;
            }
            if (copilotContext) {
                const existing = initialProps.contexts ?? [];
                initialProps.contexts = Array.from(new Set([...existing, copilotContext]));
            }
            if (copilotTags.length) {
                const existingTags = initialProps.tags ?? [];
                initialProps.tags = Array.from(new Set([...existingTags, ...copilotTags]));
            }
            await addTask(finalTitle, initialProps);
            setNewTaskTitle('');
            resetCopilot();
        }
    };

    const showFilters = ['next', 'all'].includes(statusFilter);
    const isInbox = statusFilter === 'inbox';
    const isNextView = statusFilter === 'next';
    const NEXT_WARNING_THRESHOLD = 15;
    const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
    const timeEstimateOptions: TimeEstimate[] = ['5min', '10min', '15min', '30min', '1hr', '2hr', '3hr', '4hr', '4hr+'];
    const formatEstimate = (estimate: TimeEstimate) => {
        if (estimate.endsWith('min')) return estimate.replace('min', 'm');
        if (estimate.endsWith('hr+')) return estimate.replace('hr+', 'h+');
        if (estimate.endsWith('hr')) return estimate.replace('hr', 'h');
        return estimate;
    };
    const filterSummary = useMemo(() => {
        return [
            ...selectedTokens,
            ...(prioritiesEnabled ? selectedPriorities.map((priority) => t(`priority.${priority}`)) : []),
            ...(timeEstimatesEnabled ? selectedTimeEstimates.map(formatEstimate) : []),
        ];
    }, [selectedTokens, selectedPriorities, selectedTimeEstimates, prioritiesEnabled, timeEstimatesEnabled, t]);
    const hasFilters = filterSummary.length > 0;
    const filterSummaryLabel = filterSummary.slice(0, 3).join(', ');
    const filterSummarySuffix = filterSummary.length > 3 ? ` +${filterSummary.length - 3}` : '';
    const showFiltersPanel = filtersOpen || hasFilters;
    const toggleTokenFilter = useCallback((token: string) => {
        const nextTokens = selectedTokens.includes(token)
            ? selectedTokens.filter((item) => item !== token)
            : [...selectedTokens, token];
        setListFilters({ tokens: nextTokens });
    }, [selectedTokens, setListFilters]);
    const togglePriorityFilter = useCallback((priority: TaskPriority) => {
        const nextPriorities = selectedPriorities.includes(priority)
            ? selectedPriorities.filter((item) => item !== priority)
            : [...selectedPriorities, priority];
        setListFilters({ priorities: nextPriorities });
    }, [selectedPriorities, setListFilters]);
    const toggleTimeFilter = useCallback((estimate: TimeEstimate) => {
        const nextEstimates = selectedTimeEstimates.includes(estimate)
            ? selectedTimeEstimates.filter((item) => item !== estimate)
            : [...selectedTimeEstimates, estimate];
        setListFilters({ estimates: nextEstimates });
    }, [selectedTimeEstimates, setListFilters]);
    const clearFilters = () => {
        resetListFilters();
    };

    useEffect(() => {
        if (!prioritiesEnabled && selectedPriorities.length > 0) {
            setListFilters({ priorities: [] });
        }
        if (!timeEstimatesEnabled && selectedTimeEstimates.length > 0) {
            setListFilters({ estimates: [] });
        }
    }, [prioritiesEnabled, timeEstimatesEnabled, selectedPriorities.length, selectedTimeEstimates.length, setListFilters]);

    const openQuickAdd = useCallback((status: TaskStatus | 'all', captureMode?: 'text' | 'audio') => {
        const initialStatus = status === 'all' ? 'inbox' : status;
        window.dispatchEvent(new CustomEvent('mindwtr:quick-add', {
            detail: { initialProps: { status: initialStatus }, captureMode },
        }));
    }, []);

    const resolveText = useCallback((key: string, fallback: string) => {
        const value = t(key);
        return value === key ? fallback : value;
    }, [t]);

    const emptyState = useMemo(() => {
        switch (statusFilter) {
            case 'inbox':
                return {
                    title: t('list.inbox') || 'Inbox',
                    body: resolveText('inbox.emptyAddHint', 'Inbox is clear. Capture something new.'),
                    action: t('nav.addTask') || 'Add task',
                };
            case 'next':
                return {
                    title: t('list.next') || 'Next Actions',
                    body: resolveText('list.noTasks', 'No next actions yet.'),
                    action: t('nav.addTask') || 'Add task',
                };
            case 'waiting':
                return {
                    title: resolveText('waiting.empty', t('list.waiting') || 'Waiting'),
                    body: resolveText('waiting.emptyHint', 'Track delegated or pending items.'),
                    action: t('nav.addTask') || 'Add task',
                };
            case 'someday':
                return {
                    title: resolveText('someday.empty', t('list.someday') || 'Someday'),
                    body: resolveText('someday.emptyHint', 'Store ideas for later.'),
                    action: t('nav.addTask') || 'Add task',
                };
            case 'done':
                return {
                    title: t('list.done') || 'Done',
                    body: resolveText('list.noTasks', 'Completed tasks will show here.'),
                    action: t('nav.addTask') || 'Add task',
                };
            default:
                return {
                    title: t('list.tasks') || 'Tasks',
                    body: resolveText('list.noTasks', 'No tasks yet.'),
                    action: t('nav.addTask') || 'Add task',
                };
        }
    }, [resolveText, statusFilter, t]);

    return (
        <ErrorBoundary>
            <div className="flex h-full flex-col">
                <div className="space-y-6">
                    <ListHeader
                title={title}
                showNextCount={isNextView}
                nextCount={nextCount}
                taskCount={filteredTasks.length}
                hasFilters={hasFilters}
                filterSummaryLabel={filterSummaryLabel}
                filterSummarySuffix={filterSummarySuffix}
                sortBy={sortBy}
                onChangeSortBy={(value) => updateSettings({ taskSortBy: value })}
                selectionMode={selectionMode}
                onToggleSelection={() => {
                    if (selectionMode) exitSelectionMode();
                    else setSelectionMode(true);
                }}
                showListDetails={showListDetails}
                onToggleDetails={() => setListOptions({ showDetails: !showListDetails })}
                t={t}
            />

                    {selectionMode && selectedIdsArray.length > 0 && (
                        <ListBulkActions
                            selectionCount={selectedIdsArray.length}
                            onMoveToStatus={handleBatchMove}
                            onAddTag={handleBatchAddTag}
                            onDelete={handleBatchDelete}
                            t={t}
                        />
                    )}

            {/* Next Actions Warning */}
            {isNextView && nextCount > NEXT_WARNING_THRESHOLD && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                            {nextCount} {t('next.warningCount')}
                        </p>
                        <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                            {t('next.warningHint')}
                        </p>
                    </div>
                </div>
            )}

            {showDeferredProjectSection && (
                <div className="rounded-lg border border-border bg-card/50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('projects.title') || 'Projects'}
                    </div>
                    <div className="mt-3 space-y-2">
                        {deferredProjects.map((project) => {
                            const projectArea = project.areaId ? areaById.get(project.areaId) : undefined;
                            return (
                                <div
                                    key={project.id}
                                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleOpenProject(project.id)}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary"
                                        aria-label={`${t('projects.title') || 'Project'}: ${project.title}`}
                                    >
                                        <Folder className="h-4 w-4 shrink-0" style={{ color: project.color }} />
                                        <span className="text-sm font-medium text-foreground truncate">{project.title}</span>
                                        {projectArea && (
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <span
                                                    className="h-2 w-2 rounded-full"
                                                    style={{ backgroundColor: projectArea.color || '#94a3b8' }}
                                                />
                                                {projectArea.name}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleReactivateProject(project.id)}
                                        className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                    >
                                        {t('projects.reactivate')}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <InboxProcessor
                t={t}
                isInbox={isInbox}
                tasks={tasks}
                projects={projects}
                areas={areas}
                settings={settings}
                addProject={addProject}
                updateTask={updateTask}
                deleteTask={deleteTask}
                allContexts={allContexts}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
            />

            {/* Filters */}
            {showFilters && !isProcessing && (
                <ListFiltersPanel
                    t={t}
                    hasFilters={hasFilters}
                    showFiltersPanel={showFiltersPanel}
                    onClearFilters={clearFilters}
                    onToggleOpen={() => setListFilters({ open: !filtersOpen })}
                    allTokens={allTokens}
                    selectedTokens={selectedTokens}
                    tokenCounts={tokenCounts}
                    onToggleToken={toggleTokenFilter}
                    prioritiesEnabled={prioritiesEnabled}
                    priorityOptions={priorityOptions}
                    selectedPriorities={selectedPriorities}
                    onTogglePriority={togglePriorityFilter}
                    timeEstimatesEnabled={timeEstimatesEnabled}
                    timeEstimateOptions={timeEstimateOptions}
                    selectedTimeEstimates={selectedTimeEstimates}
                    onToggleEstimate={toggleTimeFilter}
                    formatEstimate={formatEstimate}
                />
            )}

            {/* Only show add task for inbox/next - other views are read-only */}
            {['inbox', 'next'].includes(statusFilter) && (
                <ListQuickAdd
                    inputRef={addInputRef}
                    value={newTaskTitle}
                    projects={projects}
                    contexts={allContexts}
                    t={t}
                    onCreateProject={async (title) => {
                        const created = await addProject(title, '#94a3b8');
                        return created.id;
                    }}
                    onChange={(next) => {
                        setNewTaskTitle(next);
                        resetCopilot();
                    }}
                    onSubmit={handleAddTask}
                    onOpenAudio={() => openQuickAdd(statusFilter, 'audio')}
                    onResetCopilot={resetCopilot}
                />
            )}
            {['inbox', 'next'].includes(statusFilter) && aiEnabled && copilotSuggestion && !copilotApplied && (
                <button
                    type="button"
                    onClick={() => applyCopilotSuggestion(copilotSuggestion)}
                    className="mt-2 text-xs px-2 py-1 rounded bg-muted/30 border border-border text-muted-foreground hover:bg-muted/60 transition-colors text-left"
                >
                    ✨ {t('copilot.suggested')}{' '}
                    {copilotSuggestion.context ? `${copilotSuggestion.context} ` : ''}
                    {copilotSuggestion.tags?.length ? copilotSuggestion.tags.join(' ') : ''}
                    <span className="ml-2 text-muted-foreground/70">{t('copilot.applyHint')}</span>
                </button>
            )}
            {['inbox', 'next'].includes(statusFilter) && aiEnabled && copilotApplied && (
                <div className="mt-2 text-xs px-2 py-1 rounded bg-muted/30 border border-border text-muted-foreground">
                    ✅ {t('copilot.applied')}{' '}
                    {copilotContext ? `${copilotContext} ` : ''}
                    {copilotTags.length ? copilotTags.join(' ') : ''}
                </div>
            )}
            {['inbox', 'next'].includes(statusFilter) && !isProcessing && (
                <p className="text-xs text-muted-foreground">
                    {t('quickAdd.help')}
                </p>
            )}
            </div>
            <div
                ref={listScrollRef}
                className="flex-1 min-h-0 overflow-y-auto pt-3"
                role="list"
                aria-label={t('list.tasks') || 'Task list'}
            >
                {showEmptyState ? (
                    <ListEmptyState
                        hasFilters={hasFilters}
                        emptyState={emptyState}
                        onAddTask={() => openQuickAdd(statusFilter)}
                        t={t}
                    />
                ) : shouldVirtualize ? (
                    <div style={{ height: totalHeight, position: 'relative' }}>
                        {virtualRows.map((virtualRow) => {
                            const task = filteredTasks[virtualRow.index];
                            if (!task) return null;
                            return (
                                <div
                                    key={virtualRow.key}
                                    ref={rowVirtualizer.measureElement}
                                    data-index={virtualRow.index}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <div className="pb-3">
                                        <TaskItem
                                            key={task.id}
                                            task={task}
                                            project={task.projectId ? projectMap.get(task.projectId) : undefined}
                                            isSelected={virtualRow.index === selectedIndex}
                                            onSelect={() => handleSelectIndex(virtualRow.index)}
                                            selectionMode={selectionMode}
                                            isMultiSelected={multiSelectedIds.has(task.id)}
                                            onToggleSelect={() => toggleMultiSelect(task.id)}
                                            showQuickDone={showQuickDone}
                                            readOnly={readOnly}
                                            compactMetaEnabled={showListDetails}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTasks.map((task, index) => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                project={task.projectId ? projectMap.get(task.projectId) : undefined}
                                isSelected={index === selectedIndex}
                                onSelect={() => handleSelectIndex(index)}
                                selectionMode={selectionMode}
                                isMultiSelected={multiSelectedIds.has(task.id)}
                                onToggleSelect={() => toggleMultiSelect(task.id)}
                                showQuickDone={showQuickDone}
                                readOnly={readOnly}
                                compactMetaEnabled={showListDetails}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
        <PromptModal
            isOpen={tagPromptOpen}
            title={t('bulk.addTag')}
            description={t('bulk.addTag')}
            placeholder="#tag"
            defaultValue=""
            confirmLabel={t('common.save')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setTagPromptOpen(false)}
            onConfirm={async (value) => {
                const input = value.trim();
                if (!input) return;
                const tag = input.startsWith('#') ? input : `#${input}`;
                await batchUpdateTasks(tagPromptIds.map((id) => {
                    const task = tasksById.get(id);
                    const existingTags = task?.tags || [];
                    const nextTags = Array.from(new Set([...existingTags, tag]));
                    return { id, updates: { tags: nextTags } };
                }));
                setTagPromptOpen(false);
                exitSelectionMode();
            }}
        />
        </ErrorBoundary>
    );
}
