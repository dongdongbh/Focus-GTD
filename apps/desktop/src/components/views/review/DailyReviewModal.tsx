import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Check, CheckSquare, RefreshCw, Star, X, type LucideIcon } from 'lucide-react';
import { PRESET_CONTEXTS, isDueForReview, safeParseDate, safeParseDueDate, sortTasksBy, type Task, type TaskSortBy, shallow, useTaskStore, isTaskInActiveProject } from '@mindwtr/core';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../../contexts/language-context';
import { InboxProcessor } from '../InboxProcessor';
import { TaskItem } from '../../TaskItem';

type DailyReviewStep = 'intro' | 'today' | 'focus' | 'inbox' | 'waiting' | 'completed';

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface DailyReviewGuideModalProps {
    onClose: () => void;
}

export function DailyReviewGuideModal({ onClose }: DailyReviewGuideModalProps) {
    const [currentStep, setCurrentStep] = useState<DailyReviewStep>('intro');
    const { tasks, projects, areas, settings, addProject, updateTask, deleteTask } = useTaskStore(
        (state) => ({
            tasks: state.tasks,
            projects: state.projects,
            areas: state.areas,
            settings: state.settings,
            addProject: state.addProject,
            updateTask: state.updateTask,
            deleteTask: state.deleteTask,
        }),
        shallow
    );
    const { t } = useLanguage();
    const [isProcessing, setIsProcessing] = useState(false);

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const sortBy = (settings?.taskSortBy ?? 'default') as TaskSortBy;

    const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

    const activeTasks = tasks.filter((task) => !task.deletedAt && task.status !== 'reference' && isTaskInActiveProject(task, projectMap));
    const inboxTasks = useMemo(() => {
        const now = new Date();
        return activeTasks.filter((task) => {
            if (task.status !== 'inbox') return false;
            const start = safeParseDate(task.startTime);
            if (start && start > now) return false;
            return true;
        });
    }, [activeTasks]);
    const focusedTasks = activeTasks.filter((task) => task.isFocusedToday && task.status !== 'done');
    const waitingTasks = useMemo(
        () => sortTasksBy(activeTasks.filter((task) => task.status === 'waiting'), sortBy),
        [activeTasks, sortBy],
    );

    const dueTodayTasks = activeTasks.filter((task) => {
        if (task.status === 'done') return false;
        if (!task.dueDate) return false;
        const due = safeParseDueDate(task.dueDate);
        if (!due) return false;
        return isSameDay(due, today);
    });

    const overdueTasks = activeTasks.filter((task) => {
        if (task.status === 'done') return false;
        if (!task.dueDate) return false;
        const due = safeParseDueDate(task.dueDate);
        if (!due) return false;
        return due < startOfToday;
    });

    const allContexts = useMemo(() => {
        const taskContexts = activeTasks.flatMap((task) => task.contexts || []);
        return Array.from(new Set([...PRESET_CONTEXTS, ...taskContexts])).sort();
    }, [activeTasks]);

    const sequentialProjectIds = useMemo(
        () => new Set(projects.filter((project) => project.isSequential && !project.deletedAt).map((project) => project.id)),
        [projects],
    );
    const sequentialFirstTaskIds = useMemo(() => {
        const tasksByProject = new Map<string, Task[]>();
        activeTasks.forEach((task) => {
            if (task.status !== 'next' || !task.projectId) return;
            if (!sequentialProjectIds.has(task.projectId)) return;
            const list = tasksByProject.get(task.projectId) ?? [];
            list.push(task);
            tasksByProject.set(task.projectId, list);
        });
        const firstIds: string[] = [];
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
            if (firstTaskId) firstIds.push(firstTaskId);
        });
        return new Set(firstIds);
    }, [activeTasks, sequentialProjectIds]);

    const focusCandidates = useMemo(() => {
        const now = new Date();
        const todayStr = now.toDateString();
        const byId = new Map<string, Task>();
        const addCandidate = (task: Task) => {
            if (!byId.has(task.id)) byId.set(task.id, task);
        };
        activeTasks.forEach((task) => {
            if (task.status === 'done') return;
            if (task.isFocusedToday) addCandidate(task);
            const due = task.dueDate ? safeParseDueDate(task.dueDate) : null;
            if (due && (due < now || due.toDateString() === todayStr)) {
                addCandidate(task);
                return;
            }
            if (task.status === 'next') {
                const start = safeParseDate(task.startTime);
                if (start && start > now) return;
                if (task.projectId && sequentialProjectIds.has(task.projectId) && !sequentialFirstTaskIds.has(task.id)) {
                    return;
                }
                addCandidate(task);
                return;
            }
            if ((task.status === 'waiting' || task.status === 'someday') && isDueForReview(task.reviewAt, now)) {
                addCandidate(task);
            }
        });
        return sortTasksBy(Array.from(byId.values()), sortBy);
    }, [activeTasks, sequentialFirstTaskIds, sequentialProjectIds, sortBy]);

    useEffect(() => {
        if (currentStep !== 'inbox' && isProcessing) {
            setIsProcessing(false);
        }
    }, [currentStep, isProcessing]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const steps: { id: DailyReviewStep; title: string; description: string; icon: LucideIcon }[] = [
        { id: 'intro', title: t('dailyReview.title'), description: t('dailyReview.introDesc'), icon: RefreshCw },
        { id: 'today', title: t('dailyReview.todayStep'), description: t('dailyReview.todayDesc'), icon: Calendar },
        { id: 'focus', title: t('dailyReview.focusStep'), description: t('dailyReview.focusDesc'), icon: CheckSquare },
        { id: 'inbox', title: t('dailyReview.inboxStep'), description: t('dailyReview.inboxDesc'), icon: CheckSquare },
        { id: 'waiting', title: t('dailyReview.waitingStep'), description: t('dailyReview.waitingDesc'), icon: ArrowRight },
        { id: 'completed', title: t('dailyReview.completeTitle'), description: t('dailyReview.completeDesc'), icon: Check },
    ];

    const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
    const progress = ((currentStepIndex) / (steps.length - 1)) * 100;

    const nextStep = () => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStep(steps[currentStepIndex + 1].id);
        }
    };

    const prevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStep(steps[currentStepIndex - 1].id);
        }
    };

    const renderTaskList = (list: Task[], emptyText: string) => {
        if (list.length === 0) {
            return (
                <div className="text-center py-12 text-muted-foreground">
                    <p>{emptyText}</p>
                </div>
            );
        }
        return (
            <div className="space-y-2">
                {list.slice(0, 10).map((task) => (
                    <TaskItem key={task.id} task={task} />
                ))}
            </div>
        );
    };

    const renderFocusList = () => {
        if (focusCandidates.length === 0) {
            return (
                <div className="text-center py-12 text-muted-foreground">
                    <p>{t('agenda.focusHint')}</p>
                </div>
            );
        }
        const focusedCount = focusedTasks.length;
        return (
            <div className="space-y-2">
                {focusCandidates.slice(0, 10).map((task) => {
                    const project = task.projectId ? projectMap.get(task.projectId) : null;
                    const canFocus = task.isFocusedToday || focusedCount < 3;
                    return (
                        <div
                            key={task.id}
                            className={cn(
                                "bg-card border rounded-lg px-4 py-3 flex items-center gap-3",
                                task.isFocusedToday && "border-yellow-500/70 bg-amber-500/10"
                            )}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    {task.isFocusedToday && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                                    <span className={cn("font-medium truncate", task.status === 'done' && "line-through text-muted-foreground")}>
                                        {task.title}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                                    {task.status && (
                                        <span className="px-2 py-0.5 rounded-full bg-muted/60 text-foreground">
                                            {t(`status.${task.status}`)}
                                        </span>
                                    )}
                                    {project && (
                                        <span className="px-2 py-0.5 rounded-full bg-muted/60 text-foreground">
                                            {project.title}
                                        </span>
                                    )}
                                    {task.contexts?.length ? (
                                        <span className="truncate">
                                            {task.contexts.slice(0, 2).join(', ')}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (task.isFocusedToday) {
                                        updateTask(task.id, { isFocusedToday: false });
                                    } else if (focusedCount < 3) {
                                        updateTask(task.id, { isFocusedToday: true });
                                    }
                                }}
                                disabled={!canFocus}
                                className={cn(
                                    "p-2 rounded-full border transition-colors",
                                    task.isFocusedToday
                                        ? "border-yellow-500 text-yellow-500 bg-yellow-500/10"
                                        : canFocus
                                            ? "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                            : "border-border text-muted-foreground/50 cursor-not-allowed"
                                )}
                                aria-label={task.isFocusedToday ? t('agenda.removeFromFocus') : t('agenda.addToFocus')}
                                title={task.isFocusedToday ? t('agenda.removeFromFocus') : focusedCount >= 3 ? t('agenda.maxFocusItems') : t('agenda.addToFocus')}
                            >
                                <Star className={cn("w-4 h-4", task.isFocusedToday && "fill-current")} />
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 'intro':
                return (
                    <div className="text-center space-y-6 py-12">
                        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <RefreshCw className="w-10 h-10 text-primary" />
                        </div>
                        <h2 className="text-3xl font-bold">{t('dailyReview.introTitle')}</h2>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">{t('dailyReview.introDesc')}</p>
                        <button
                            onClick={nextStep}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            {t('dailyReview.start')}
                        </button>
                    </div>
                );

            case 'today': {
                const list = [...overdueTasks, ...dueTodayTasks];
                return (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="font-semibold mb-2">{t('dailyReview.todayStep')}</h3>
                            <p className="text-sm text-muted-foreground">{t('dailyReview.todayDesc')}</p>
                            <p className="text-sm text-muted-foreground mt-2">
                                <span className="font-bold text-foreground">{list.length}</span> {t('common.tasks')}
                            </p>
                        </div>
                        {renderTaskList(list, t('agenda.noTasks'))}
                    </div>
                );
            }

            case 'focus':
                return (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="font-semibold mb-2">{t('dailyReview.focusStep')}</h3>
                            <p className="text-sm text-muted-foreground">{t('dailyReview.focusDesc')}</p>
                            <p className="text-sm text-muted-foreground mt-2">
                                <span className="font-bold text-foreground">{focusedTasks.length}</span> / 3
                            </p>
                        </div>
                        {renderFocusList()}
                    </div>
                );

            case 'inbox':
                return (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="font-semibold mb-2">{t('dailyReview.inboxStep')}</h3>
                            <p className="text-sm text-muted-foreground">{t('dailyReview.inboxDesc')}</p>
                            <p className="text-sm text-muted-foreground mt-2">
                                <span className="font-bold text-foreground">{inboxTasks.length}</span> {t('common.tasks')}
                            </p>
                        </div>
                        <InboxProcessor
                            t={t}
                            isInbox
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
                        {renderTaskList(inboxTasks, t('review.inboxEmpty'))}
                    </div>
                );

            case 'waiting':
                return (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="font-semibold mb-2">{t('dailyReview.waitingStep')}</h3>
                            <p className="text-sm text-muted-foreground">{t('dailyReview.waitingDesc')}</p>
                            <p className="text-sm text-muted-foreground mt-2">
                                <span className="font-bold text-foreground">{waitingTasks.length}</span> {t('common.tasks')}
                            </p>
                        </div>
                        {renderTaskList(waitingTasks, t('review.waitingEmpty'))}
                    </div>
                );

            case 'completed':
                return (
                    <div className="text-center space-y-6 py-12">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Check className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-3xl font-bold">{t('dailyReview.completeTitle')}</h2>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">{t('dailyReview.completeDesc')}</p>
                        <button
                            onClick={onClose}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            {t('review.finish')}
                        </button>
                    </div>
                );
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-label={t('dailyReview.title')}
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        {t('dailyReview.title')}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t('common.close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 flex flex-col flex-1 min-h-0">
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                {(() => {
                                    const Icon = steps[currentStepIndex].icon;
                                    return Icon && <Icon className="w-6 h-6" />;
                                })()}
                                {steps[currentStepIndex].title}
                            </h1>
                            <span className="text-sm text-muted-foreground">
                                {t('review.step')} {currentStepIndex + 1} {t('review.of')} {steps.length}
                            </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-500 ease-in-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2">
                        {renderStepContent()}
                    </div>

                    {currentStep !== 'intro' && currentStep !== 'completed' && (
                        <div className="flex justify-between pt-4 border-t border-border mt-6">
                            <button
                                onClick={prevStep}
                                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {t('review.back')}
                            </button>
                            <button
                                onClick={nextStep}
                                className="bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors"
                            >
                                {t('review.nextStepBtn')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
