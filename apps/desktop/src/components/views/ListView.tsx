import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus, AlertTriangle, Mic } from 'lucide-react';
import { useTaskStore, TaskPriority, TimeEstimate, PRESET_CONTEXTS, PRESET_TAGS, sortTasksBy, Project, parseQuickAdd, matchesHierarchicalToken, safeParseDate } from '@mindwtr/core';
import type { Task, TaskStatus } from '@mindwtr/core';
import type { TaskSortBy } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { ErrorBoundary } from '../ErrorBoundary';
import { ListEmptyState } from './list/ListEmptyState';
import { TaskInput } from '../Task/TaskInput';
import { PromptModal } from '../PromptModal';
import { InboxProcessor } from './InboxProcessor';
import { ListFiltersPanel } from './list/ListFiltersPanel';
import { ListHeader } from './list/ListHeader';
import { ListBulkActions } from './list/ListBulkActions';
import { VirtualTaskRow } from './list/VirtualTaskRow';
import { useVirtualList } from './list/useVirtualList';
import { useLanguage } from '../../contexts/language-context';
import { useKeybindings } from '../../contexts/keybinding-context';
import { useListCopilot } from './list/useListCopilot';
import { useUiStore } from '../../store/ui-store';


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
    const { tasks, projects, areas, settings, updateSettings, addTask, addProject, updateTask, deleteTask, moveTask, batchMoveTasks, batchDeleteTasks, batchUpdateTasks, queryTasks, lastDataChangeAt } = useTaskStore();
    const { t } = useLanguage();
    const { registerTaskListScope } = useKeybindings();
    const sortBy = (settings?.taskSortBy ?? 'default') as TaskSortBy;
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const listFilters = useUiStore((state) => state.listFilters);
    const setListFilters = useUiStore((state) => state.setListFilters);
    const resetListFilters = useUiStore((state) => state.resetListFilters);
    const showListDetails = useUiStore((state) => state.listOptions.showDetails);
    const setListOptions = useUiStore((state) => state.setListOptions);
    const [baseTasks, setBaseTasks] = useState<Task[]>([]);
    const selectedTokens = listFilters.tokens;
    const selectedPriorities = listFilters.priorities;
    const selectedTimeEstimates = listFilters.estimates;
    const filtersOpen = listFilters.open;
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [selectionMode, setSelectionMode] = useState(false);
    const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
    const [tagPromptOpen, setTagPromptOpen] = useState(false);
    const [tagPromptIds, setTagPromptIds] = useState<string[]>([]);
    const addInputRef = useRef<HTMLInputElement>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);
    const rowHeightsRef = useRef<Map<string, number>>(new Map());
    const [listScrollTop, setListScrollTop] = useState(0);
    const [listHeight, setListHeight] = useState(0);
    const [measureVersion, setMeasureVersion] = useState(0);
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const showQuickDone = statusFilter === 'next';
    const readOnly = statusFilter === 'done';
    const activePriorities = useMemo(
        () => (prioritiesEnabled ? selectedPriorities : EMPTY_PRIORITIES),
        [prioritiesEnabled, selectedPriorities]
    );
    const activeTimeEstimates = useMemo(
        () => (timeEstimatesEnabled ? selectedTimeEstimates : EMPTY_ESTIMATES),
        [timeEstimatesEnabled, selectedTimeEstimates]
    );

    const exitSelectionMode = useCallback(() => {
        setSelectionMode(false);
        setMultiSelectedIds(new Set());
    }, []);

    const [isProcessing, setIsProcessing] = useState(false);

    const { allContexts, allTags } = useMemo(() => {
        const contexts = new Set<string>(PRESET_CONTEXTS);
        const tags = new Set<string>(PRESET_TAGS);
        tasks.forEach((task) => {
            task.contexts?.forEach((ctx) => contexts.add(ctx));
            task.tags?.forEach((tag) => tags.add(tag));
        });
        return {
            allContexts: Array.from(contexts).sort(),
            allTags: Array.from(tags).sort(),
        };
    }, [tasks]);
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

    const projectMap = useMemo(() => {
        return projects.reduce((acc, project) => {
            acc[project.id] = project;
            return acc;
        }, {} as Record<string, Project>);
    }, [projects]);

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

    const tasksById = useMemo(() => {
        return tasks.reduce((acc, task) => {
            acc[task.id] = task;
            return acc;
        }, {} as Record<string, Task>);
    }, [tasks]);

    const sequentialProjectIds = useMemo(() => {
        return new Set(projects.filter((project) => project.isSequential).map((project) => project.id));
    }, [projects]);

    // For sequential projects, get only the first task to show in Next view
    const sequentialProjectFirstTasks = useMemo(() => {
        if (sequentialProjectIds.size === 0) return new Set<string>();
        const tasksByProject = new Map<string, Task[]>();

        for (const task of baseTasks) {
            if (task.deletedAt || task.status !== 'next' || !task.projectId) continue;
            if (!sequentialProjectIds.has(task.projectId)) continue;
            const list = tasksByProject.get(task.projectId) ?? [];
            list.push(task);
            tasksByProject.set(task.projectId, list);
        }

        const firstTaskIds: string[] = [];
        tasksByProject.forEach((tasksForProject: Task[]) => {
            const hasOrder = tasksForProject.some((task) => Number.isFinite(task.orderNum));
            let firstTaskId: string | null = null;
            let bestKey = Number.POSITIVE_INFINITY;
            tasksForProject.forEach((task) => {
                const key = hasOrder
                    ? (Number.isFinite(task.orderNum) ? (task.orderNum as number) : Number.POSITIVE_INFINITY)
                    : new Date(task.createdAt).getTime();
                if (!firstTaskId || key < bestKey) {
                    firstTaskId = task.id;
                    bestKey = key;
                }
            });
            if (firstTaskId) firstTaskIds.push(firstTaskId);
        });

        return new Set(firstTaskIds);
    }, [baseTasks, sequentialProjectIds]);

    useEffect(() => {
        let cancelled = false;
        const status = statusFilter === 'all' ? undefined : statusFilter;
        // Seed with in-memory tasks so switching views doesn't flash empty state.
        setBaseTasks(statusFilter === 'archived' ? [] : tasks);
        queryTasks({
            status,
            includeArchived: status === 'archived',
            includeDeleted: false,
        }).then((result) => {
            if (!cancelled) setBaseTasks(result);
        }).catch(() => {
            if (!cancelled) setBaseTasks([]);
        });
        return () => {
            cancelled = true;
        };
    }, [statusFilter, queryTasks, lastDataChangeAt, tasks]);

    const filteredTasks = useMemo(() => {
        const now = new Date();
        const filtered = baseTasks.filter(t => {
            // Always filter out soft-deleted tasks
            if (t.deletedAt) return false;

            if (statusFilter !== 'all' && t.status !== statusFilter) return false;
            // Respect statusFilter (handled above).

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
                const project = projectMap[t.projectId];
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
    }, [baseTasks, projects, statusFilter, selectedTokens, activePriorities, activeTimeEstimates, sequentialProjectFirstTasks, projectMap, sortBy, sortByProjectOrder]);

    const shouldVirtualize = filteredTasks.length > VIRTUALIZATION_THRESHOLD;

    const handleListScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        setListScrollTop(event.currentTarget.scrollTop);
    }, []);

    const handleRowMeasure = useCallback((id: string, height: number) => {
        const nextHeight = Math.max(40, height);
        const prevHeight = rowHeightsRef.current.get(id);
        if (prevHeight !== nextHeight) {
            rowHeightsRef.current.set(id, nextHeight);
            setMeasureVersion((version) => version + 1);
        }
    }, []);

    useEffect(() => {
        if (!shouldVirtualize) return;
        const container = listScrollRef.current;
        if (!container) return;
        const updateHeight = () => setListHeight(container.clientHeight);
        updateHeight();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(updateHeight);
        observer.observe(container);
        return () => observer.disconnect();
    }, [shouldVirtualize]);

    const { rowOffsets, totalHeight, visibleTasks, startIndex } = useVirtualList({
        tasks: filteredTasks,
        shouldVirtualize,
        rowHeightsRef,
        measureVersion,
        listScrollTop,
        listHeight,
        rowEstimate: VIRTUAL_ROW_ESTIMATE,
        overscan: VIRTUAL_OVERSCAN,
    });

    useEffect(() => {
        setSelectedIndex(0);
        exitSelectionMode();
    }, [statusFilter, selectedTokens, selectedPriorities, selectedTimeEstimates, prioritiesEnabled, timeEstimatesEnabled, exitSelectionMode]);

    useEffect(() => {
        if (filteredTasks.length === 0) {
            setSelectedIndex(0);
            return;
        }
        if (selectedIndex >= filteredTasks.length) {
            setSelectedIndex(filteredTasks.length - 1);
        }
    }, [filteredTasks.length, selectedIndex]);

    useEffect(() => {
        const task = filteredTasks[selectedIndex];
        if (!task) return;
        const el = document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null;
        if (el && typeof (el as any).scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (shouldVirtualize && listScrollRef.current && rowOffsets[selectedIndex] !== undefined) {
            listScrollRef.current.scrollTo({ top: rowOffsets[selectedIndex], behavior: 'auto' });
        }
    }, [filteredTasks, selectedIndex, shouldVirtualize, rowOffsets]);

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

    const tokenCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        tasks
            .filter(t => !t.deletedAt && (statusFilter === 'all' || t.status === statusFilter))
            .forEach(t => {
                const tokens = new Set([...(t.contexts || []), ...(t.tags || [])]);
                tokens.forEach((token) => {
                    counts[token] = (counts[token] || 0) + 1;
                });
            });
        return counts;
    }, [tasks, statusFilter]);

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
    const nextCount = useMemo(() => {
        let count = 0;
        for (const task of tasks) {
            if (!task.deletedAt && task.status === 'next') count += 1;
        }
        return count;
    }, [tasks]);
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
    }, [prioritiesEnabled, selectedPriorities.length, setListFilters]);

    useEffect(() => {
        if (!timeEstimatesEnabled && selectedTimeEstimates.length > 0) {
            setListFilters({ estimates: [] });
        }
    }, [timeEstimatesEnabled, selectedTimeEstimates.length, setListFilters]);

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

            <InboxProcessor
                t={t}
                isInbox={isInbox}
                tasks={tasks}
                projects={projects}
                areas={areas}
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
                <form onSubmit={handleAddTask} className="relative">
                    <TaskInput
                        inputRef={addInputRef}
                        value={newTaskTitle}
                        projects={projects}
                        contexts={allContexts}
                        onCreateProject={async (title) => {
                            const created = await addProject(title, '#94a3b8');
                            return created.id;
                        }}
                        onChange={(next) => {
                            setNewTaskTitle(next);
                            resetCopilot();
                        }}
                        placeholder={`${t('nav.addTask')}... ${t('quickAdd.example')}`}
                        className="w-full bg-card border border-border rounded-lg py-3 pl-4 pr-20 shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => openQuickAdd(statusFilter, 'audio')}
                            className="p-1.5 bg-muted/60 text-muted-foreground rounded-md hover:bg-muted transition-colors"
                            aria-label={t('quickAdd.audioCaptureLabel')}
                        >
                            <Mic className="w-4 h-4" />
                        </button>
                        <button
                            type="submit"
                            disabled={!newTaskTitle.trim()}
                            className="p-1.5 bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </form>
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
                onScroll={handleListScroll}
                className="flex-1 min-h-0 overflow-y-auto pt-3"
                role="list"
                aria-label={t('list.tasks') || 'Task list'}
            >
                {filteredTasks.length === 0 ? (
                    <ListEmptyState
                        hasFilters={hasFilters}
                        emptyState={emptyState}
                        onAddTask={() => openQuickAdd(statusFilter)}
                        t={t}
                    />
                ) : shouldVirtualize ? (
                    <div style={{ height: totalHeight, position: 'relative' }}>
                        {visibleTasks.map((task, index) => {
                            const actualIndex = startIndex + index;
                            return (
                                <VirtualTaskRow
                                    key={task.id}
                                    task={task}
                                    project={task.projectId ? projectMap[task.projectId] : undefined}
                                    index={actualIndex}
                                    top={rowOffsets[actualIndex] ?? 0}
                                    isSelected={actualIndex === selectedIndex}
                                    onSelectIndex={handleSelectIndex}
                                    selectionMode={selectionMode}
                                    isMultiSelected={multiSelectedIds.has(task.id)}
                                    onToggleSelectId={toggleMultiSelect}
                                    onMeasure={handleRowMeasure}
                                    showQuickDone={showQuickDone}
                                    readOnly={readOnly}
                                    compactMetaEnabled={showListDetails}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTasks.map((task, index) => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                project={task.projectId ? projectMap[task.projectId] : undefined}
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
                    const task = tasksById[id];
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
