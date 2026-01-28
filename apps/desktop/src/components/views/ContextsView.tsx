import { useState, useEffect, useMemo } from 'react';
import { useTaskStore, matchesHierarchicalToken, isTaskInActiveProject, shallow, TaskStatus } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { Tag, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/language-context';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import { checkBudget } from '../../config/performanceBudgets';

export function ContextsView() {
    const perf = usePerformanceMonitor('ContextsView');
    const { tasks, projects } = useTaskStore(
        (state) => ({ tasks: state.tasks, projects: state.projects }),
        shallow
    );
    const { t } = useLanguage();
    const [selectedContext, setSelectedContext] = useState<string | null>(null);
    const NO_CONTEXT_TOKEN = '__no_context__';
    const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

    useEffect(() => {
        if (!perf.enabled) return;
        const timer = window.setTimeout(() => {
            checkBudget('ContextsView', perf.metrics, 'simple');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [perf.enabled]);

    // Filter out deleted tasks first
    const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const activeTasks = tasks.filter(t => !t.deletedAt && isTaskInActiveProject(t, projectMap));
    const baseTasks = activeTasks.filter(t => t.status !== 'done' && t.status !== 'archived' && t.status !== 'reference');
    const scopedTasks = statusFilter === 'all'
        ? baseTasks
        : baseTasks.filter(t => t.status === statusFilter);

    // Extract all unique contexts from active tasks
    const allContexts = Array.from(new Set(
        scopedTasks.flatMap(t => [...(t.contexts || []), ...(t.tags || [])])
    )).sort();

    const matchesSelected = (task: typeof activeTasks[number], context: string) => {
        const tokens = [...(task.contexts || []), ...(task.tags || [])];
        return tokens.some(token => matchesHierarchicalToken(context, token));
    };

    const hasContext = (task: typeof activeTasks[number]) =>
        (task.contexts?.length || 0) > 0 || (task.tags?.length || 0) > 0;

    const filteredTasks = selectedContext === NO_CONTEXT_TOKEN
        ? scopedTasks.filter((t) => !hasContext(t))
        : selectedContext
            ? scopedTasks.filter(t => matchesSelected(t, selectedContext))
            : scopedTasks.filter((t) => hasContext(t));

    const statusOptions: Array<{ value: TaskStatus | 'all'; label: string }> = [
        { value: 'next', label: t('status.next') },
        { value: 'waiting', label: t('status.waiting') },
        { value: 'someday', label: t('status.someday') },
        { value: 'all', label: t('common.all') || 'All' },
    ];

    return (
        <div className="flex h-full gap-6">
            {/* Sidebar List of Contexts */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-4 border-r border-border pr-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight">{t('contexts.title')}</h2>
                    <Filter className="w-5 h-5 text-muted-foreground" />
                </div>

                <div className="space-y-1 overflow-y-auto flex-1">
                    <div
                        onClick={() => setSelectedContext(null)}
                        className={cn(
                            "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm",
                            selectedContext === null ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                        )}
                    >
                        <Tag className="w-4 h-4" />
                        <span className="flex-1">{t('contexts.all')}</span>
                        <span className="text-xs text-muted-foreground">
                            {scopedTasks.filter((t) => hasContext(t)).length}
                        </span>
                    </div>

                    <div
                        onClick={() => setSelectedContext(NO_CONTEXT_TOKEN)}
                        className={cn(
                            "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm",
                            selectedContext === NO_CONTEXT_TOKEN ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                        )}
                    >
                        <Tag className="w-4 h-4" />
                        <span className="flex-1">{t('contexts.none')}</span>
                        <span className="text-xs text-muted-foreground">
                            {scopedTasks.filter((t) => !hasContext(t)).length}
                        </span>
                    </div>

                    {allContexts.map(context => (
                        <div
                            key={context}
                            onClick={() => setSelectedContext(context)}
                            className={cn(
                                "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm",
                                selectedContext === context ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                            )}
                        >
                            <span className="text-muted-foreground">@</span>
                            <span className="flex-1 truncate">{context.replace(/^@/, '')}</span>
                            <span className="text-xs text-muted-foreground">
                                {scopedTasks.filter(t => matchesSelected(t, context)).length}
                            </span>
                        </div>
                    ))}

                    {allContexts.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            {t('contexts.noContexts')}
                        </div>
                    )}
                </div>
            </div>

            {/* Context Tasks */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <header className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Tag className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">
                            {selectedContext === NO_CONTEXT_TOKEN ? t('contexts.none') : (selectedContext ?? t('contexts.all'))}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {filteredTasks.length} {t('common.tasks')}
                        </p>
                    </div>
                    <div className="ml-auto">
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'all')}
                            className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground"
                        >
                            {statusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {filteredTasks.length > 0 ? (
                        filteredTasks.map(task => (
                            <TaskItem key={task.id} task={task} />
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-12">
                            {t('contexts.noTasks')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
