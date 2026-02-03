import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { shallow, useTaskStore, TaskPriority, TimeEstimate, PRESET_CONTEXTS, PRESET_TAGS, matchesHierarchicalToken, safeFormatDate, safeParseDate, safeParseDueDate, isDueForReview, isTaskInActiveProject } from '@mindwtr/core';
import type { Task, Project } from '@mindwtr/core';
import { useLanguage } from '../../contexts/language-context';
import { cn } from '../../lib/utils';
import { useUiStore } from '../../store/ui-store';
import { Clock, Star, Calendar, AlertCircle, ArrowRight, Filter, Folder, List, type LucideIcon } from 'lucide-react';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import { checkBudget } from '../../config/performanceBudgets';
import { TaskItem } from '../TaskItem';
import { projectMatchesAreaFilter, resolveAreaFilter, taskMatchesAreaFilter } from '../../lib/area-filter';

export function AgendaView() {
    const perf = usePerformanceMonitor('AgendaView');
    const { tasks, projects, areas, updateTask, settings, highlightTaskId, setHighlightTask } = useTaskStore(
        (state) => ({
            tasks: state.tasks,
            projects: state.projects,
            areas: state.areas,
            updateTask: state.updateTask,
            settings: state.settings,
            highlightTaskId: state.highlightTaskId,
            setHighlightTask: state.setHighlightTask,
        }),
        shallow
    );
    const getDerivedState = useTaskStore((state) => state.getDerivedState);
    const { projectMap, sequentialProjectIds } = getDerivedState();
    const { t } = useLanguage();
    const { showListDetails, setListOptions } = useUiStore((state) => ({
        showListDetails: state.listOptions.showDetails,
        setListOptions: state.setListOptions,
    }));
    const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
    const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>([]);
    const [selectedTimeEstimates, setSelectedTimeEstimates] = useState<TimeEstimate[]>([]);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [top3Only, setTop3Only] = useState(false);
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const activePriorities = prioritiesEnabled ? selectedPriorities : [];
    const activeTimeEstimates = timeEstimatesEnabled ? selectedTimeEstimates : [];
    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
    const resolvedAreaFilter = useMemo(
        () => resolveAreaFilter(settings?.filters?.areaId, areas),
        [settings?.filters?.areaId, areas],
    );

    useEffect(() => {
        if (!perf.enabled) return;
        const timer = window.setTimeout(() => {
            checkBudget('AgendaView', perf.metrics, 'complex');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [perf.enabled]);

    // Filter active tasks
    const { activeTasks, allTokens } = useMemo(() => {
        const active = tasks.filter(t =>
            !t.deletedAt
            && t.status !== 'done'
            && t.status !== 'reference'
            && isTaskInActiveProject(t, projectMap)
            && taskMatchesAreaFilter(t, resolvedAreaFilter, projectMap, areaById)
        );
        const taskTokens = active.flatMap(t => [...(t.contexts || []), ...(t.tags || [])]);
        return {
            activeTasks: active,
            allTokens: Array.from(new Set([...PRESET_CONTEXTS, ...PRESET_TAGS, ...taskTokens])).sort(),
        };
    }, [tasks, projectMap, resolvedAreaFilter, areaById]);
    const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
    const timeEstimateOptions: TimeEstimate[] = ['5min', '10min', '15min', '30min', '1hr', '2hr', '3hr', '4hr', '4hr+'];
    const formatEstimate = (estimate: TimeEstimate) => {
        if (estimate.endsWith('min')) return estimate.replace('min', 'm');
        if (estimate.endsWith('hr+')) return estimate.replace('hr+', 'h+');
        if (estimate.endsWith('hr')) return estimate.replace('hr', 'h');
        return estimate;
    };
    const matchesFilters = useCallback((task: Task) => {
        const taskTokens = [...(task.contexts || []), ...(task.tags || [])];
        if (selectedTokens.length > 0) {
            const matchesAll = selectedTokens.every((token) =>
                taskTokens.some((taskToken) => matchesHierarchicalToken(token, taskToken))
            );
            if (!matchesAll) return false;
        }
        if (activePriorities.length > 0 && (!task.priority || !activePriorities.includes(task.priority))) return false;
        if (activeTimeEstimates.length > 0 && (!task.timeEstimate || !activeTimeEstimates.includes(task.timeEstimate))) return false;
        return true;
    }, [selectedTokens, activePriorities, activeTimeEstimates]);

    const { filteredActiveTasks, reviewDueCandidates } = useMemo(() => {
        const now = new Date();
        const filtered = activeTasks.filter(matchesFilters);
        const reviewDue = tasks
            .filter((task) => {
                if (task.deletedAt) return false;
                if (task.status === 'done' || task.status === 'archived' || task.status === 'reference') return false;
                if (!isDueForReview(task.reviewAt, now)) return false;
                if (task.projectId) {
                    const project = projectMap.get(task.projectId);
                    if (project?.deletedAt) return false;
                    if (project?.status === 'archived') return false;
                }
                if (!taskMatchesAreaFilter(task, resolvedAreaFilter, projectMap, areaById)) return false;
                return true;
            })
            .filter(matchesFilters);
        return { filteredActiveTasks: filtered, reviewDueCandidates: reviewDue };
    }, [activeTasks, tasks, projectMap, matchesFilters, resolvedAreaFilter, areaById]);

    const reviewDueProjects = useMemo(() => {
        const now = new Date();
        return projects
            .filter((project) => {
                if (project.deletedAt) return false;
                if (project.status === 'archived') return false;
                if (!projectMatchesAreaFilter(project, resolvedAreaFilter, areaById)) return false;
                return isDueForReview(project.reviewAt, now);
            })
            .sort((a, b) => {
                const aReview = safeParseDate(a.reviewAt)?.getTime() ?? Number.POSITIVE_INFINITY;
                const bReview = safeParseDate(b.reviewAt)?.getTime() ?? Number.POSITIVE_INFINITY;
                if (aReview !== bReview) return aReview - bReview;
                return a.title.localeCompare(b.title);
            });
    }, [projects, resolvedAreaFilter, areaById]);
    const hasFilters = selectedTokens.length > 0 || activePriorities.length > 0 || activeTimeEstimates.length > 0;
    const showFiltersPanel = filtersOpen || hasFilters;
    const toggleTokenFilter = (token: string) => {
        setSelectedTokens((prev) =>
            prev.includes(token) ? prev.filter((item) => item !== token) : [...prev, token]
        );
    };
    const togglePriorityFilter = (priority: TaskPriority) => {
        setSelectedPriorities((prev) =>
            prev.includes(priority) ? prev.filter((item) => item !== priority) : [...prev, priority]
        );
    };
    const toggleTimeFilter = (estimate: TimeEstimate) => {
        setSelectedTimeEstimates((prev) =>
            prev.includes(estimate) ? prev.filter((item) => item !== estimate) : [...prev, estimate]
        );
    };
    const clearFilters = () => {
        setSelectedTokens([]);
        setSelectedPriorities([]);
        setSelectedTimeEstimates([]);
    };
    useEffect(() => {
        if (!prioritiesEnabled && selectedPriorities.length > 0) {
            setSelectedPriorities([]);
        }
        if (!timeEstimatesEnabled && selectedTimeEstimates.length > 0) {
            setSelectedTimeEstimates([]);
        }
    }, [prioritiesEnabled, timeEstimatesEnabled, selectedPriorities.length, selectedTimeEstimates.length]);

    useEffect(() => {
        if (!highlightTaskId) return;
        const el = document.querySelector(`[data-task-id="${highlightTaskId}"]`) as HTMLElement | null;
        if (el && typeof (el as any).scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center' });
        }
        const timer = window.setTimeout(() => setHighlightTask(null), 4000);
        return () => window.clearTimeout(timer);
    }, [highlightTaskId, setHighlightTask]);
    // Today's Focus: tasks marked as isFocusedToday (max 3)
    const focusedTasks = useMemo(() =>
        filteredActiveTasks.filter(t => t.isFocusedToday).slice(0, 3),
        [filteredActiveTasks]
    );

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

    // Categorize tasks
    const sections = useMemo(() => {
        const now = new Date();
        const todayStr = now.toDateString();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const isDeferred = (task: Task) => {
            const start = safeParseDate(task.startTime);
            return Boolean(start && start > endOfToday);
        };
        const priorityRank: Record<TaskPriority, number> = {
            low: 1,
            medium: 2,
            high: 3,
            urgent: 4,
        };
        const sortWith = (items: Task[], getTime: (task: Task) => number) => {
            return [...items].sort((a, b) => {
                const timeDiff = getTime(a) - getTime(b);
                if (timeDiff !== 0) return timeDiff;
                if (prioritiesEnabled) {
                    const priorityDiff = (priorityRank[b.priority as TaskPriority] || 0) - (priorityRank[a.priority as TaskPriority] || 0);
                    if (priorityDiff !== 0) return priorityDiff;
                }
                const aCreated = safeParseDate(a.createdAt)?.getTime() ?? 0;
                const bCreated = safeParseDate(b.createdAt)?.getTime() ?? 0;
                return aCreated - bCreated;
            });
        };
        const tasksByProject = new Map<string, Task[]>();
        for (const task of filteredActiveTasks) {
            if (task.deletedAt || task.status !== 'next' || !task.projectId) continue;
            if (!sequentialProjectIds.has(task.projectId)) continue;
            const list = tasksByProject.get(task.projectId) ?? [];
            list.push(task);
            tasksByProject.set(task.projectId, list);
        }
        const sequentialFirstTasks = new Set<string>();
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
            if (firstTaskId) sequentialFirstTasks.add(firstTaskId);
        });

        const overdue = filteredActiveTasks.filter(t => {
            if (!t.dueDate) return false;
            const dueDate = safeParseDueDate(t.dueDate);
            return dueDate && dueDate < now && !t.isFocusedToday && !isDeferred(t);
        });
        const dueToday = filteredActiveTasks.filter(t => {
            if (!t.dueDate) return false;
            const dueDate = safeParseDueDate(t.dueDate);
            return dueDate && dueDate.toDateString() === todayStr &&
                !t.isFocusedToday && !isDeferred(t);
        });
        const nextActions = filteredActiveTasks.filter(t => {
            if (t.status !== 'next' || t.isFocusedToday) return false;
            if (isDeferred(t)) return false;
            if (t.projectId && sequentialProjectIds.has(t.projectId)) {
                return sequentialFirstTasks.has(t.id);
            }
            return true;
        });

        const reviewDue = reviewDueCandidates.filter(t => !t.isFocusedToday);

        return {
            overdue: sortWith(overdue, (task) => safeParseDueDate(task.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY),
            dueToday: sortWith(dueToday, (task) => safeParseDueDate(task.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY),
            nextActions: sortByProjectOrder(nextActions),
            reviewDue: sortWith(reviewDue, (task) => safeParseDate(task.reviewAt)?.getTime() ?? Number.POSITIVE_INFINITY),
        };
    }, [filteredActiveTasks, reviewDueCandidates, projects, prioritiesEnabled, sortByProjectOrder]);
    const focusedCount = focusedTasks.length;
    const { top3Tasks, remainingCount } = useMemo(() => {
        const byId = new Map<string, Task>();
        [...sections.overdue, ...sections.dueToday, ...sections.nextActions, ...sections.reviewDue].forEach((task) => {
            byId.set(task.id, task);
        });
        const candidates = Array.from(byId.values());
        const priorityRank: Record<TaskPriority, number> = {
            low: 1,
            medium: 2,
            high: 3,
            urgent: 4,
        };
        const parseDue = (value?: string) => {
            if (!value) return Number.POSITIVE_INFINITY;
            const parsed = safeParseDueDate(value);
            return parsed ? parsed.getTime() : Number.POSITIVE_INFINITY;
        };
        const sorted = [...candidates].sort((a, b) => {
            if (prioritiesEnabled) {
                const priorityDiff = (priorityRank[b.priority as TaskPriority] || 0) - (priorityRank[a.priority as TaskPriority] || 0);
                if (priorityDiff !== 0) return priorityDiff;
            }
            const dueDiff = parseDue(a.dueDate) - parseDue(b.dueDate);
            if (dueDiff !== 0) return dueDiff;
            const aCreated = safeParseDate(a.createdAt)?.getTime() ?? 0;
            const bCreated = safeParseDate(b.createdAt)?.getTime() ?? 0;
            return aCreated - bCreated;
        });
        const top3 = sorted.slice(0, 3);
        return {
            top3Tasks: top3,
            remainingCount: Math.max(candidates.length - top3.length, 0),
        };
    }, [sections, prioritiesEnabled]);

    const handleToggleFocus = (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        if (task.isFocusedToday) {
            updateTask(taskId, { isFocusedToday: false });
        } else if (focusedCount < 3) {
            updateTask(taskId, { isFocusedToday: true });
        }
    };

    const buildFocusToggle = useCallback((task: Task) => {
        const isFocused = Boolean(task.isFocusedToday);
        const canToggle = isFocused || focusedCount < 3;
        const title = isFocused
            ? t('agenda.removeFromFocus')
            : focusedCount >= 3
                ? t('agenda.maxFocusItems')
                : t('agenda.addToFocus');
        return {
            isFocused,
            canToggle,
            onToggle: () => handleToggleFocus(task.id),
            title,
            ariaLabel: title,
        };
    }, [focusedCount, handleToggleFocus, t]);

    const Section = ({ title, icon: Icon, tasks, color }: {
        title: string;
        icon: LucideIcon;
        tasks: Task[];
        color: string;
    }) => {
        if (tasks.length === 0) return null;

        return (
            <div className="space-y-3">
                <h3 className={cn("font-semibold flex items-center gap-2", color)}>
                    <Icon className="w-5 h-5" />
                    {title}
                    <span className="text-muted-foreground font-normal">({tasks.length})</span>
                </h3>
                <div className="space-y-2">
                    {tasks.map(task => (
                        <TaskItem
                            key={task.id}
                            task={task}
                            project={task.projectId ? projectMap.get(task.projectId) : undefined}
                            focusToggle={buildFocusToggle(task)}
                            showProjectBadgeInActions={false}
                            compactMetaEnabled={showListDetails}
                        />
                    ))}
                </div>
            </div>
        );
    };

    const ProjectSection = ({ title, icon: Icon, projects, color }: {
        title: string;
        icon: LucideIcon;
        projects: Project[];
        color: string;
    }) => {
        if (projects.length === 0) return null;

        return (
            <div className="space-y-3">
                <h3 className={cn("font-semibold flex items-center gap-2", color)}>
                    <Icon className="w-5 h-5" />
                    {title}
                    <span className="text-muted-foreground font-normal">({projects.length})</span>
                </h3>
                <div className="space-y-2">
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-card/80 px-3 py-2"
                        >
                            <div className="flex items-center gap-2">
                                <Folder className="w-4 h-4" style={{ color: project.color }} />
                                <span className="text-sm font-medium text-foreground">{project.title}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {t(`status.${project.status}`)}
                                </span>
                            </div>
                            {project.reviewAt && (
                                <span className="text-xs text-muted-foreground">
                                    {safeFormatDate(project.reviewAt, 'P')}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const visibleActive = filteredActiveTasks.length;
    const nextActionsCount = sections.nextActions.length;

    return (
        <ErrorBoundary>
            <div className="space-y-6 w-full">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Calendar className="w-8 h-8" />
                        {t('agenda.title')}
                    </h2>
                    <p className="text-muted-foreground">
                        {nextActionsCount} {t('list.next') || t('agenda.nextActions')}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setTop3Only((prev) => !prev)}
                        className={cn(
                            "inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-colors",
                            top3Only
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                        )}
                    >
                        {t('agenda.top3Only')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setListOptions({ showDetails: !showListDetails })}
                        aria-pressed={showListDetails}
                        className={cn(
                            "text-xs px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1.5",
                            showListDetails
                                ? "bg-primary/10 text-primary border-primary"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                        )}
                        title={showListDetails ? (t('list.details') || 'Details on') : (t('list.detailsOff') || 'Details off')}
                    >
                        <List className="w-3.5 h-3.5" />
                        {showListDetails ? (t('list.details') || 'Details') : (t('list.detailsOff') || 'Details off')}
                    </button>
                </div>
            </header>

            <div className="bg-card border border-border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Filter className="w-4 h-4" />
                        {t('filters.label')}
                    </div>
                    <div className="flex items-center gap-2">
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {t('filters.clear')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setFiltersOpen((prev) => !prev)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showFiltersPanel ? t('filters.hide') : t('filters.show')}
                        </button>
                    </div>
                </div>
                {showFiltersPanel && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('filters.contexts')}</div>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                {allTokens.map((token) => {
                                    const isActive = selectedTokens.includes(token);
                                    return (
                                        <button
                                            key={token}
                                            type="button"
                                            onClick={() => toggleTokenFilter(token)}
                                            aria-pressed={isActive}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                                isActive
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                            )}
                                        >
                                            {token}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {prioritiesEnabled && (
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('filters.priority')}</div>
                                <div className="flex flex-wrap gap-2">
                                    {priorityOptions.map((priority) => {
                                        const isActive = selectedPriorities.includes(priority);
                                        return (
                                            <button
                                                key={priority}
                                                type="button"
                                                onClick={() => togglePriorityFilter(priority)}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                                    isActive
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                                )}
                                            >
                                                {t(`priority.${priority}`)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {timeEstimatesEnabled && (
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('filters.timeEstimate')}</div>
                                <div className="flex flex-wrap gap-2">
                                    {timeEstimateOptions.map((estimate) => {
                                        const isActive = selectedTimeEstimates.includes(estimate);
                                        return (
                                            <button
                                                key={estimate}
                                                type="button"
                                                onClick={() => toggleTimeFilter(estimate)}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                                    isActive
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                                )}
                                            >
                                                {formatEstimate(estimate)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {top3Only ? (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h3 className="font-semibold">{t('agenda.top3Title')}</h3>
                        {top3Tasks.length > 0 ? (
                            <div className="space-y-2">
                                {top3Tasks.map(task => (
                                    <TaskItem
                                        key={task.id}
                                        task={task}
                                        project={task.projectId ? projectMap.get(task.projectId) : undefined}
                                        showProjectBadgeInActions={false}
                                        compactMetaEnabled={showListDetails}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">{t('agenda.noTasks')}</p>
                        )}
                    </div>
                    {remainingCount > 0 && (
                        <button
                            type="button"
                            onClick={() => setTop3Only(false)}
                            className="text-xs px-3 py-2 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                        >
                            {t('agenda.showMore').replace('{{count}}', `${remainingCount}`)}
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Today's Focus Section */}
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/40 dark:to-amber-900/25 border border-yellow-200 dark:border-amber-500/30 rounded-xl p-6">
                        <h3 className="font-bold text-lg flex items-center gap-2 mb-4 text-slate-900 dark:text-amber-100">
                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 dark:text-amber-300 dark:fill-amber-300" />
                            {t('agenda.todaysFocus')}
                            <span className="text-sm font-normal text-slate-600 dark:text-amber-200">
                                ({focusedCount}/3)
                            </span>
                        </h3>

                        {focusedTasks.length > 0 ? (
                            <div className="space-y-2">
                                {focusedTasks.map(task => (
                                    <TaskItem
                                        key={task.id}
                                        task={task}
                                        project={task.projectId ? projectMap.get(task.projectId) : undefined}
                                        focusToggle={buildFocusToggle(task)}
                                        showProjectBadgeInActions={false}
                                        compactMetaEnabled={showListDetails}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
                                <Star className="w-4 h-4 text-amber-400" />
                                {t('agenda.focusHint')}
                            </p>
                        )}
                    </div>

                    {/* Other Sections */}
                    <div className="space-y-6">
                        <Section
                            title={t('agenda.overdue')}
                            icon={AlertCircle}
                            tasks={sections.overdue}
                            color="text-red-600"
                        />

                        <Section
                            title={t('agenda.dueToday')}
                            icon={Calendar}
                            tasks={sections.dueToday}
                            color="text-yellow-600"
                        />

                        <Section
                            title={t('agenda.nextActions')}
                            icon={ArrowRight}
                            tasks={sections.nextActions}
                            color="text-blue-600"
                        />

                        <Section
                            title={t('agenda.reviewDue') || 'Review Due'}
                            icon={Clock}
                            tasks={sections.reviewDue}
                            color="text-purple-600"
                        />

                        <ProjectSection
                            title={t('agenda.reviewDueProjects') || 'Projects to review'}
                            icon={Folder}
                            projects={reviewDueProjects}
                            color="text-indigo-600"
                        />
                    </div>
                </>
            )}

            {visibleActive === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    <p className="text-4xl mb-4">✨</p>
                    <p className="text-lg font-medium">{t('agenda.allClear')}</p>
                    <p>{hasFilters ? t('filters.noMatch') : t('agenda.noTasks')}</p>
                </div>
            )}
            </div>
        </ErrorBoundary>
    );
}
