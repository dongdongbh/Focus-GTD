import { useEffect, useMemo, useState } from 'react';
import {
    createAIProvider,
    getStaleItems,
    isDueForReview,
    safeFormatDate,
    safeParseDate,
    safeParseDueDate,
    shallow,
    type ReviewSuggestion,
    useTaskStore,
    type Task,
    type TaskStatus,
    type AIProviderId,
} from '@mindwtr/core';
import { Archive, ArrowRight, Calendar, Check, CheckSquare, Layers, RefreshCw, Sparkles, X, type LucideIcon } from 'lucide-react';

import { TaskItem } from '../../TaskItem';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../../contexts/language-context';
import { buildAIConfig, loadAIKey } from '../../../lib/ai-config';

type ReviewStep = 'intro' | 'inbox' | 'ai' | 'calendar' | 'waiting' | 'projects' | 'someday' | 'completed';
type CalendarReviewEntry = {
    task: Task;
    date: Date;
    kind: 'due' | 'start';
};

type WeeklyReviewGuideModalProps = {
    onClose: () => void;
};

export function WeeklyReviewGuideModal({ onClose }: WeeklyReviewGuideModalProps) {
    const [currentStep, setCurrentStep] = useState<ReviewStep>('intro');
    const { tasks, projects, areas, settings, batchUpdateTasks } = useTaskStore(
        (state) => ({
            tasks: state.tasks,
            projects: state.projects,
            areas: state.areas,
            settings: state.settings,
            batchUpdateTasks: state.batchUpdateTasks,
        }),
        shallow
    );
    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
    const { t } = useLanguage();
    const [aiSuggestions, setAiSuggestions] = useState<ReviewSuggestion[]>([]);
    const [aiSelectedIds, setAiSelectedIds] = useState<Set<string>>(new Set());
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiRan, setAiRan] = useState(false);

    const aiEnabled = settings?.ai?.enabled === true;
    const aiProvider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
    const staleItems = useMemo(() => getStaleItems(tasks, projects), [tasks, projects]);
    const staleItemTitleMap = useMemo(() => {
        return staleItems.reduce((acc, item) => {
            acc[item.id] = item.title;
            return acc;
        }, {} as Record<string, string>);
    }, [staleItems]);
    const calendarReviewItems = useMemo(() => {
        const now = new Date();
        const pastStart = new Date(now);
        pastStart.setDate(pastStart.getDate() - 14);
        const upcomingEnd = new Date(now);
        upcomingEnd.setDate(upcomingEnd.getDate() + 14);
        const entries: CalendarReviewEntry[] = [];

        tasks.forEach((task) => {
            if (task.deletedAt) return;
            const dueDate = safeParseDueDate(task.dueDate);
            if (dueDate) entries.push({ task, date: dueDate, kind: 'due' });
            const startTime = safeParseDate(task.startTime);
            if (startTime) entries.push({ task, date: startTime, kind: 'start' });
        });

        const past = entries
            .filter((entry) => entry.date >= pastStart && entry.date < now)
            .sort((a, b) => b.date.getTime() - a.date.getTime());
        const upcoming = entries
            .filter((entry) => entry.date >= now && entry.date <= upcomingEnd)
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        return { past, upcoming };
    }, [tasks]);

    const steps: { id: ReviewStep; title: string; description: string; icon: LucideIcon }[] = [
        { id: 'intro', title: t('review.title'), description: t('review.intro'), icon: RefreshCw },
        { id: 'inbox', title: t('review.inboxStep'), description: t('review.inboxStepDesc'), icon: CheckSquare },
        { id: 'ai', title: t('review.aiStep'), description: t('review.aiStepDesc'), icon: Sparkles },
        { id: 'calendar', title: t('review.calendarStep'), description: t('review.calendarStepDesc'), icon: Calendar },
        { id: 'waiting', title: t('review.waitingStep'), description: t('review.waitingStepDesc'), icon: ArrowRight },
        { id: 'projects', title: t('review.projectsStep'), description: t('review.projectsStepDesc'), icon: Layers },
        { id: 'someday', title: t('review.somedayStep'), description: t('review.somedayStepDesc'), icon: Archive },
        { id: 'completed', title: t('review.allDone'), description: t('review.allDoneDesc'), icon: Check },
    ];

    const currentStepIndex = steps.findIndex((step) => step.id === currentStep);
    const progress = (currentStepIndex / (steps.length - 1)) * 100;

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

    const isActionableSuggestion = (suggestion: ReviewSuggestion) => {
        if (suggestion.id.startsWith('project:')) return false;
        return suggestion.action === 'someday' || suggestion.action === 'archive';
    };

    const toggleSuggestion = (id: string) => {
        setAiSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const runAiAnalysis = async () => {
        setAiError(null);
        setAiRan(true);
        if (!aiEnabled) {
            setAiError(t('ai.disabledBody'));
            return;
        }
        const apiKey = await loadAIKey(aiProvider);
        if (!apiKey) {
            setAiError(t('ai.missingKeyBody'));
            return;
        }
        if (staleItems.length === 0) {
            setAiSuggestions([]);
            setAiSelectedIds(new Set());
            return;
        }
        setAiLoading(true);
        try {
            const provider = createAIProvider(buildAIConfig(settings, apiKey));
            const response = await provider.analyzeReview({ items: staleItems });
            setAiSuggestions(response.suggestions || []);
            const defaultSelected = new Set(
                (response.suggestions || [])
                    .filter(isActionableSuggestion)
                    .map((suggestion) => suggestion.id),
            );
            setAiSelectedIds(defaultSelected);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setAiError(message || t('ai.errorBody'));
        } finally {
            setAiLoading(false);
        }
    };

    const applyAiSuggestions = async () => {
        const updates = aiSuggestions
            .filter((suggestion) => aiSelectedIds.has(suggestion.id))
            .filter(isActionableSuggestion)
            .map((suggestion) => {
                if (suggestion.action === 'someday') {
                    return { id: suggestion.id, updates: { status: 'someday' as TaskStatus } };
                }
                if (suggestion.action === 'archive') {
                    return { id: suggestion.id, updates: { status: 'archived' as TaskStatus, completedAt: new Date().toISOString() } };
                }
                return null;
            })
            .filter(Boolean) as Array<{ id: string; updates: Partial<Task> }>;

        if (updates.length === 0) return;
        await batchUpdateTasks(updates);
    };

    const renderCalendarList = (items: CalendarReviewEntry[]) => {
        if (items.length === 0) {
            return <div className="text-sm text-muted-foreground">{t('calendar.noTasks')}</div>;
        }
        return (
            <div className="space-y-2">
                {items.map((entry) => (
                    <div key={`${entry.kind}-${entry.task.id}-${entry.date.toISOString()}`} className="flex items-start gap-3 text-sm">
                        <div className="min-w-0">
                            <div className="font-medium truncate">{entry.task.title}</div>
                            <div className="text-xs text-muted-foreground">
                                {(entry.kind === 'due' ? t('taskEdit.dueDateLabel') : t('review.startTime'))}
                                {' / '}
                                {safeFormatDate(entry.date, 'MMM d, HH:mm')}
                            </div>
                        </div>
                    </div>
                ))}
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
                        <h2 className="text-3xl font-bold">{t('review.timeFor')}</h2>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">
                            {t('review.timeForDesc')}
                        </p>
                        <button
                            onClick={nextStep}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            {t('review.startReview')}
                        </button>
                    </div>
                );

            case 'inbox': {
                const inboxTasks = tasks.filter((task) => task.status === 'inbox');
                return (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="font-semibold mb-2">{t('review.inboxZero')}</h3>
                            <p className="text-sm text-muted-foreground">
                                <span className="font-bold text-foreground">{inboxTasks.length}</span> {t('review.inboxZeroDesc')}
                            </p>
                        </div>
                        <div className="space-y-2">
                            {inboxTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
                                    <p>{t('review.inboxEmpty')}</p>
                                </div>
                            ) : (
                                inboxTasks.map((task) => (
                                    <TaskItem key={task.id} task={task} showProjectBadgeInActions={false} />
                                ))
                            )}
                        </div>
                    </div>
                );
            }

            case 'calendar':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('review.past14')}</h3>
                                <div className="bg-card border border-border rounded-lg p-4 min-h-[200px] space-y-3">
                                    <p className="text-xs text-muted-foreground">{t('review.past14Desc')}</p>
                                    {renderCalendarList(calendarReviewItems.past)}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('review.upcoming14')}</h3>
                                <div className="bg-card border border-border rounded-lg p-4 min-h-[200px] space-y-3">
                                    <p className="text-xs text-muted-foreground">{t('review.upcoming14Desc')}</p>
                                    {renderCalendarList(calendarReviewItems.upcoming)}
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'waiting': {
                const waitingTasks = tasks.filter((task) => task.status === 'waiting');
                const waitingDue = waitingTasks.filter((task) => isDueForReview(task.reviewAt));
                const waitingFuture = waitingTasks.filter((task) => !isDueForReview(task.reviewAt));
                return (
                    <div className="space-y-4">
                        <p className="text-muted-foreground">
                            {t('review.waitingHint')}
                        </p>
                        <div className="space-y-2">
                            {waitingTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>{t('review.waitingEmpty')}</p>
                                </div>
                            ) : (
                                <>
                                    {waitingDue.length > 0 && waitingDue.map((task) => (
                                        <TaskItem key={task.id} task={task} showProjectBadgeInActions={false} />
                                    ))}
                                    {waitingFuture.length > 0 && (
                                        <div className="pt-4">
                                            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                                                {t('review.notDueYet')}
                                            </h4>
                                            {waitingFuture.map((task) => (
                                                <TaskItem key={task.id} task={task} showProjectBadgeInActions={false} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            }

            case 'ai': {
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm text-muted-foreground">
                                {t('review.aiStepDesc')}
                            </div>
                            <button
                                onClick={runAiAnalysis}
                                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                disabled={aiLoading}
                            >
                                {aiLoading ? t('review.aiRunning') : t('review.aiRun')}
                            </button>
                        </div>

                        {aiError && (
                            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                                {aiError}
                            </div>
                        )}

                        {aiRan && !aiLoading && aiSuggestions.length === 0 && !aiError && (
                            <div className="text-sm text-muted-foreground">{t('review.aiEmpty')}</div>
                        )}

                        {aiSuggestions.length > 0 && (
                            <div className="space-y-3">
                                {aiSuggestions.map((suggestion) => {
                                    const actionable = isActionableSuggestion(suggestion);
                                    return (
                                        <div
                                            key={suggestion.id}
                                            className="border border-border rounded-lg p-3 flex items-start gap-3"
                                        >
                                            {actionable ? (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSuggestion(suggestion.id)}
                                                    className={cn(
                                                        "mt-1 h-4 w-4 rounded border flex items-center justify-center text-xs",
                                                        aiSelectedIds.has(suggestion.id)
                                                            ? "bg-primary text-primary-foreground border-primary"
                                                            : "border-border text-muted-foreground",
                                                    )}
                                                    aria-pressed={aiSelectedIds.has(suggestion.id)}
                                                >
                                                    {aiSelectedIds.has(suggestion.id) ? '✓' : ''}
                                                </button>
                                            ) : (
                                                <span className="mt-1 h-4 w-4 rounded border border-border/50" />
                                            )}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">{staleItemTitleMap[suggestion.id] || suggestion.id}</span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                        {t(`review.aiAction.${suggestion.action}`)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">{suggestion.reason}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="flex justify-end">
                                    <button
                                        onClick={applyAiSuggestions}
                                        className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        disabled={aiSelectedIds.size === 0}
                                    >
                                        {t('review.aiApply')} ({aiSelectedIds.size})
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            }

            case 'projects': {
                const activeProjects = projects.filter((project) => project.status === 'active');
                const dueProjects = activeProjects.filter((project) => isDueForReview(project.reviewAt));
                const futureProjects = activeProjects.filter((project) => !isDueForReview(project.reviewAt));
                const orderedProjects = [...dueProjects, ...futureProjects];
                return (
                    <div className="space-y-6">
                        <p className="text-muted-foreground">{t('review.projectsHint')}</p>
                        <div className="space-y-4">
                            {orderedProjects.map((project) => {
                                const projectTasks = tasks.filter((task) => task.projectId === project.id && task.status !== 'done' && task.status !== 'reference');
                                const hasNextAction = projectTasks.some((task) => task.status === 'next');

                                return (
                                    <div key={project.id} className="border border-border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: (project.areaId ? areaById.get(project.areaId)?.color : undefined) || '#94a3b8' }} />
                                                <h3 className="font-semibold">{project.title}</h3>
                                            </div>
                                            <div className={cn("text-xs px-2 py-1 rounded-full", hasNextAction ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600")}
                                            >
                                                {hasNextAction ? t('review.hasNextAction') : t('review.needsAction')}
                                            </div>
                                        </div>
                                        <div className="space-y-2 pl-5">
                                            {projectTasks.map((task) => (
                                                <TaskItem key={task.id} task={task} showProjectBadgeInActions={false} />
                                            ))}
                                            {projectTasks.length > 0 && (
                                                <div className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/50">
                                                    <span className="font-semibold mr-1">{t('review.stuckQuestion')}</span>
                                                    {t('review.stuckPrompt')}
                                                </div>
                                            )}
                                            {projectTasks.length === 0 && (
                                                <div className="text-sm text-muted-foreground italic">{t('review.noActiveTasks')}</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            }

            case 'someday': {
                const somedayTasks = tasks.filter((task) => task.status === 'someday');
                const somedayDue = somedayTasks.filter((task) => isDueForReview(task.reviewAt));
                const somedayFuture = somedayTasks.filter((task) => !isDueForReview(task.reviewAt));
                return (
                    <div className="space-y-4">
                        <p className="text-muted-foreground">
                            {t('review.somedayHint')}
                        </p>
                        <div className="space-y-2">
                            {somedayTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>{t('review.listEmpty')}</p>
                                </div>
                            ) : (
                                <>
                                    {somedayDue.length > 0 && somedayDue.map((task) => (
                                        <TaskItem key={task.id} task={task} showProjectBadgeInActions={false} />
                                    ))}
                                    {somedayFuture.length > 0 && (
                                        <div className="pt-4">
                                            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                                                {t('review.notDueYet')}
                                            </h4>
                                            {somedayFuture.map((task) => (
                                                <TaskItem key={task.id} task={task} showProjectBadgeInActions={false} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            }

            case 'completed':
                return (
                    <div className="text-center space-y-6 py-12">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Check className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-3xl font-bold">{t('review.complete')}</h2>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">
                            {t('review.completeDesc')}
                        </p>
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
            aria-label={t('review.title')}
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-primary" />
                        {t('review.title')}
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
