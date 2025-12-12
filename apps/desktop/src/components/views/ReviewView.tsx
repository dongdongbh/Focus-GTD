import { useState } from 'react';
import { useTaskStore } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { CheckSquare, Calendar, Layers, Archive, ArrowRight, Check, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/language-context';


type ReviewStep = 'intro' | 'inbox' | 'calendar' | 'waiting' | 'projects' | 'someday' | 'completed';

export function ReviewView() {
    const [currentStep, setCurrentStep] = useState<ReviewStep>('intro');
    const { tasks, projects } = useTaskStore();
    const { t } = useLanguage();

    const steps: { id: ReviewStep; title: string; description: string; icon: LucideIcon }[] = [
        { id: 'intro', title: t('review.title'), description: t('review.intro'), icon: RefreshCw },
        { id: 'inbox', title: t('review.inboxStep'), description: t('review.inboxStepDesc'), icon: CheckSquare },
        { id: 'calendar', title: t('review.calendarStep'), description: t('review.calendarStepDesc'), icon: Calendar },
        { id: 'waiting', title: t('review.waitingStep'), description: t('review.waitingStepDesc'), icon: ArrowRight },
        { id: 'projects', title: t('review.projectsStep'), description: t('review.projectsStepDesc'), icon: Layers },
        { id: 'someday', title: t('review.somedayStep'), description: t('review.somedayStepDesc'), icon: Archive },
        { id: 'completed', title: t('review.allDone'), description: t('review.allDoneDesc'), icon: Check },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === currentStep);
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

            case 'inbox':
                const inboxTasks = tasks.filter(t => t.status === 'inbox');
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
                                inboxTasks.map(task => <TaskItem key={task.id} task={task} />)
                            )}
                        </div>
                    </div>
                );

            case 'calendar':
                // Mock calendar review - in a real app this might show actual calendar events
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('review.past14')}</h3>
                                <div className="bg-card border border-border rounded-lg p-4 min-h-[200px] text-sm text-muted-foreground">
                                    {t('review.past14Desc')}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">{t('review.upcoming14')}</h3>
                                <div className="bg-card border border-border rounded-lg p-4 min-h-[200px] text-sm text-muted-foreground">
                                    {t('review.upcoming14Desc')}
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'waiting':
                const waitingTasks = tasks.filter(t => t.status === 'waiting');
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
                                waitingTasks.map(task => <TaskItem key={task.id} task={task} />)
                            )}
                        </div>
                    </div>
                );

            case 'projects':
                const activeProjects = projects.filter(p => p.status === 'active');
                return (
                    <div className="space-y-6">
                        <p className="text-muted-foreground">{t('review.projectsHint')}</p>
                        <div className="space-y-4">
                            {activeProjects.map(project => {
                                const projectTasks = tasks.filter(task => task.projectId === project.id && task.status !== 'done');
                                const hasNextAction = projectTasks.some(task => task.status === 'next');

                                return (
                                    <div key={project.id} className="border border-border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                                                <h3 className="font-semibold">{project.title}</h3>
                                            </div>
                                            <div className={cn("text-xs px-2 py-1 rounded-full", hasNextAction ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600")}>
                                                {hasNextAction ? t('review.hasNextAction') : t('review.needsAction')}
                                            </div>
                                        </div>
                                        <div className="space-y-2 pl-5">
                                            {projectTasks.map(task => (
                                                <TaskItem key={task.id} task={task} />
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

            case 'someday':
                const somedayTasks = tasks.filter(t => t.status === 'someday');
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
                                somedayTasks.map(task => <TaskItem key={task.id} task={task} />)
                            )}
                        </div>
                    </div>
                );

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
                            onClick={() => setCurrentStep('intro')}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            {t('review.finish')}
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="max-w-3xl mx-auto h-full flex flex-col">
            {/* Header / Progress */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {(() => {
                            const Icon = steps[currentStepIndex].icon;
                            return Icon && <Icon className="w-6 h-6" />;
                        })()}
                        {steps[currentStepIndex].title}
                    </h1>
                    <span className="text-sm text-muted-foreground">
                        Step {currentStepIndex + 1} of {steps.length}
                    </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-in-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto mb-8 pr-2">
                {renderStepContent()}
            </div>

            {/* Navigation Footer */}
            {currentStep !== 'intro' && currentStep !== 'completed' && (
                <div className="flex justify-between pt-4 border-t border-border">
                    <button
                        onClick={prevStep}
                        className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Back
                    </button>
                    <button
                        onClick={nextStep}
                        className="bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors"
                    >
                        Next Step
                    </button>
                </div>
            )}
        </div>
    );
}
