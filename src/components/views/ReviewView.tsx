import React, { useState } from 'react';
import { useTaskStore } from '../../store/store';
import { TaskItem } from '../TaskItem';
import { CheckSquare, Calendar, Layers, Archive, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, subDays, addDays } from 'date-fns';

type ReviewStep = 'intro' | 'inbox' | 'calendar' | 'waiting' | 'projects' | 'someday' | 'completed';

export function ReviewView() {
    const [currentStep, setCurrentStep] = useState<ReviewStep>('intro');
    const { tasks, projects } = useTaskStore();

    const steps: { id: ReviewStep; title: string; description: string; icon: any }[] = [
        { id: 'intro', title: 'Weekly Review', description: 'Get clear, get current, and get creative.', icon: RefreshCw },
        { id: 'inbox', title: 'Process Inbox', description: 'Clarify and organize your inbox items.', icon: CheckSquare },
        { id: 'calendar', title: 'Review Calendar', description: 'Check past 2 weeks and upcoming 2 weeks.', icon: Calendar },
        { id: 'waiting', title: 'Waiting For', description: 'Follow up on delegated tasks.', icon: ArrowRight },
        { id: 'projects', title: 'Review Projects', description: 'Ensure every active project has a next action.', icon: Layers },
        { id: 'someday', title: 'Someday/Maybe', description: 'Review projects you might want to start.', icon: Archive },
        { id: 'completed', title: 'All Done!', description: 'You are ready for the week ahead.', icon: Check },
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
                        <h2 className="text-3xl font-bold">Time for your Weekly Review</h2>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">
                            Clear your mind and get organized. This process will guide you through cleaning up your lists and planning for the week ahead.
                        </p>
                        <button
                            onClick={nextStep}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            Start Review
                        </button>
                    </div>
                );

            case 'inbox':
                const inboxTasks = tasks.filter(t => t.status === 'inbox');
                return (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                            <h3 className="font-semibold mb-2">Inbox Zero Goal</h3>
                            <p className="text-sm text-muted-foreground">
                                You have <span className="font-bold text-foreground">{inboxTasks.length}</span> items in your Inbox.
                                Process them by clarifying what they are and organizing them into next actions, projects, or trash.
                            </p>
                        </div>
                        <div className="space-y-2">
                            {inboxTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
                                    <p>Inbox is empty! Great job.</p>
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
                                <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Past 14 Days</h3>
                                <div className="bg-card border border-border rounded-lg p-4 min-h-[200px] text-sm text-muted-foreground">
                                    Review your calendar for the past two weeks. Did you miss anything? Do any completed appointments require follow-up actions?
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Upcoming 14 Days</h3>
                                <div className="bg-card border border-border rounded-lg p-4 min-h-[200px] text-sm text-muted-foreground">
                                    Look at the upcoming two weeks. What do you need to prepare for? Capture any new next actions.
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
                            Review these items. Have you received what you're waiting for? Do you need to send a reminder?
                        </p>
                        <div className="space-y-2">
                            {waitingTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>Nothing in Waiting For.</p>
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
                        <p className="text-muted-foreground">
                            Review each project. Does it have at least one concrete <strong>Next Action</strong>? If not, add one now.
                            Mark completed projects as done.
                        </p>
                        <div className="space-y-4">
                            {activeProjects.map(project => {
                                const projectTasks = tasks.filter(t => t.projectId === project.id && t.status !== 'done');
                                const hasNextAction = projectTasks.some(t => t.status === 'next');

                                return (
                                    <div key={project.id} className="border border-border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                                                <h3 className="font-semibold">{project.title}</h3>
                                            </div>
                                            <div className={cn("text-xs px-2 py-1 rounded-full", hasNextAction ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600")}>
                                                {hasNextAction ? "Has Next Action" : "Needs Action"}
                                            </div>
                                        </div>
                                        <div className="space-y-2 pl-5">
                                            {projectTasks.map(task => (
                                                <TaskItem key={task.id} task={task} />
                                            ))}
                                            {projectTasks.length === 0 && (
                                                <div className="text-sm text-muted-foreground italic">No active tasks</div>
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
                            Review your Someday/Maybe list. Is there anything here you want to make active now? Or delete?
                        </p>
                        <div className="space-y-2">
                            {somedayTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>List is empty.</p>
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
                        <h2 className="text-3xl font-bold">Review Complete!</h2>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">
                            You've clarified your inputs, updated your lists, and you're ready to engage with your work.
                        </p>
                        <button
                            onClick={() => setCurrentStep('intro')}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:bg-primary/90 transition-colors"
                        >
                            Finish
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
                        {steps[currentStepIndex].icon && React.createElement(steps[currentStepIndex].icon, { className: "w-6 h-6" })}
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
