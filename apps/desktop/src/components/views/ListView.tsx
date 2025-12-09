import React, { useState, useMemo } from 'react';
import { Plus, Play, X, Trash2, Moon, User, CheckCircle } from 'lucide-react';
import { useTaskStore, TaskStatus, Task } from '@focus-gtd/core';
import { TaskItem } from '../TaskItem';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/language-context';
import { sortTasks } from '../../lib/task-sorter';

// GTD preset contexts
const PRESET_CONTEXTS = ['@home', '@work', '@errands', '@agendas', '@computer', '@phone', '@anywhere'];

interface ListViewProps {
    title: string;
    statusFilter: TaskStatus | 'all';
}

type ProcessingStep = 'actionable' | 'twomin' | 'decide' | 'context';

export function ListView({ title, statusFilter }: ListViewProps) {
    const { tasks, addTask, updateTask, deleteTask, moveTask } = useTaskStore();
    const { t } = useLanguage();
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [selectedContext, setSelectedContext] = useState<string | null>(null);
    const [customContext, setCustomContext] = useState('');

    // Inbox processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingTask, setProcessingTask] = useState<Task | null>(null);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>('actionable');

    const allContexts = useMemo(() => {
        const taskContexts = tasks.flatMap(t => t.contexts || []);
        return Array.from(new Set([...PRESET_CONTEXTS, ...taskContexts])).sort();
    }, [tasks]);

    // ... (in ListView)

    const filteredTasks = useMemo(() => {
        const filtered = tasks.filter(t => {
            // Always filter out soft-deleted tasks
            if (t.deletedAt) return false;

            if (statusFilter !== 'all' && t.status !== statusFilter) return false;
            // Filter out archived unless we are in archived view (which uses statusFilter='archived')
            // But ListView is generic. If statusFilter is 'inbox', we want inbox.
            // If 'all', we usually want active tasks.
            // Desktop App.tsx passes explicit filters.

            if (statusFilter === 'all' && (t.status === 'archived' || t.status === 'done')) {
                // "All" view usually implies ContextsView or similar. 
                // But ListView statusFilter is usually one status.
            }
            // Just respect statusFilter.

            if (selectedContext && !t.contexts?.includes(selectedContext)) return false;
            return true;
        });

        return sortTasks(filtered);
    }, [tasks, statusFilter, selectedContext]);

    const contextCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        tasks.filter(t => !t.deletedAt && (statusFilter === 'all' || t.status === statusFilter)).forEach(t => {
            (t.contexts || []).forEach(ctx => {
                counts[ctx] = (counts[ctx] || 0) + 1;
            });
        });
        return counts;
    }, [tasks, statusFilter]);

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (newTaskTitle.trim()) {
            addTask(newTaskTitle);
            setNewTaskTitle('');
        }
    };

    // Inbox processing handlers
    const startProcessing = () => {
        const inboxTasks = tasks.filter(t => t.status === 'inbox');
        if (inboxTasks.length > 0) {
            setProcessingTask(inboxTasks[0]);
            setProcessingStep('actionable');
            setIsProcessing(true);
        }
    };

    const processNext = () => {
        const inboxTasks = tasks.filter(t => t.status === 'inbox');
        if (inboxTasks.length > 0) {
            setProcessingTask(inboxTasks[0]);
            setProcessingStep('actionable');
        } else {
            setIsProcessing(false);
            setProcessingTask(null);
        }
    };

    const handleNotActionable = (action: 'trash' | 'someday') => {
        if (!processingTask) return;
        if (action === 'trash') {
            deleteTask(processingTask.id);
        } else {
            moveTask(processingTask.id, 'someday');
        }
        processNext();
    };

    const handleActionable = () => setProcessingStep('twomin');

    const handleTwoMinDone = () => {
        if (processingTask) {
            moveTask(processingTask.id, 'done');
        }
        processNext();
    };

    const handleTwoMinNo = () => setProcessingStep('decide');

    const handleDelegate = () => {
        if (processingTask) {
            moveTask(processingTask.id, 'waiting');
        }
        processNext();
    };

    const handleDefer = () => setProcessingStep('context');

    const handleSetContext = (context: string | null) => {
        if (processingTask) {
            updateTask(processingTask.id, {
                status: 'next',
                contexts: context ? [context] : []
            });
        }
        processNext();
    };

    const showContextFilter = ['next', 'todo', 'all'].includes(statusFilter);
    const isInbox = statusFilter === 'inbox';
    const inboxCount = tasks.filter(t => t.status === 'inbox').length;

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                <span className="text-muted-foreground text-sm">
                    {filteredTasks.length} tasks
                    {selectedContext && <span className="ml-1 text-primary">• {selectedContext}</span>}
                </span>
            </header>

            {/* Inbox Processing Bar */}
            {isInbox && inboxCount > 0 && !isProcessing && (
                <button
                    onClick={startProcessing}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                    <Play className="w-4 h-4" />
                    {t('process.btn')} ({inboxCount})
                </button>
            )}

            {/* Inbox Processing Wizard */}
            {isProcessing && processingTask && (
                <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">📋 {t('process.title')}</h3>
                        <button
                            onClick={() => setIsProcessing(false)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4">
                        <p className="font-medium">{processingTask.title}</p>
                    </div>

                    {processingStep === 'actionable' && (
                        <div className="space-y-4">
                            <p className="text-center font-medium">{t('process.actionable')}</p>
                            <p className="text-center text-sm text-muted-foreground">
                                {t('process.actionableDesc')}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleActionable}
                                    className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90"
                                >
                                    {t('process.yesActionable')}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground text-center pt-2">If not actionable:</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleNotActionable('trash')}
                                    className="flex-1 flex items-center justify-center gap-2 bg-destructive/10 text-destructive py-2 rounded-lg font-medium hover:bg-destructive/20"
                                >
                                    <Trash2 className="w-4 h-4" /> {t('process.trash')}
                                </button>
                                <button
                                    onClick={() => handleNotActionable('someday')}
                                    className="flex-1 flex items-center justify-center gap-2 bg-purple-500/10 text-purple-600 py-2 rounded-lg font-medium hover:bg-purple-500/20"
                                >
                                    <Moon className="w-4 h-4" /> {t('process.someday')}
                                </button>
                            </div>
                        </div>
                    )}

                    {processingStep === 'twomin' && (
                        <div className="space-y-4">
                            <p className="text-center font-medium">{t('process.twoMin')}</p>
                            <p className="text-center text-sm text-muted-foreground">
                                {t('process.twoMinDesc')}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleTwoMinDone}
                                    className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white py-3 rounded-lg font-medium hover:bg-green-600"
                                >
                                    <CheckCircle className="w-4 h-4" /> {t('process.doneIt')}
                                </button>
                                <button
                                    onClick={handleTwoMinNo}
                                    className="flex-1 bg-muted py-3 rounded-lg font-medium hover:bg-muted/80"
                                >
                                    {t('process.takesLonger')}
                                </button>
                            </div>
                        </div>
                    )}

                    {processingStep === 'decide' && (
                        <div className="space-y-4">
                            <p className="text-center font-medium">{t('process.nextStep')}</p>
                            <p className="text-center text-sm text-muted-foreground">
                                {t('process.nextStepDesc')}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleDefer}
                                    className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90"
                                >
                                    {t('process.doIt')}
                                </button>
                                <button
                                    onClick={handleDelegate}
                                    className="flex-1 flex items-center justify-center gap-2 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600"
                                >
                                    <User className="w-4 h-4" /> {t('process.delegate')}
                                </button>
                            </div>
                        </div>
                    )}

                    {processingStep === 'context' && (
                        <div className="space-y-4">
                            <p className="text-center font-medium">{t('process.context')}</p>
                            <p className="text-center text-sm text-muted-foreground">
                                {t('process.contextDesc')}
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder={t('process.newContextPlaceholder')}
                                    value={customContext}
                                    onChange={(e) => setCustomContext(e.target.value)}
                                    className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && customContext.trim()) {
                                            handleSetContext(`@${customContext.trim().replace(/^@/, '')}`);
                                            setCustomContext('');
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        if (customContext.trim()) {
                                            handleSetContext(`@${customContext.trim().replace(/^@/, '')}`);
                                            setCustomContext('');
                                        }
                                    }}
                                    disabled={!customContext.trim()}
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {t('process.addContext')}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center max-h-40 overflow-y-auto">
                                <button
                                    onClick={() => handleSetContext(null)}
                                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-full text-sm font-medium hover:bg-secondary/80"
                                >
                                    {t('process.skip')}
                                </button>
                                {allContexts.map(ctx => (
                                    <button
                                        key={ctx}
                                        onClick={() => handleSetContext(ctx)}
                                        className="px-4 py-2 bg-muted rounded-full text-sm font-medium hover:bg-muted/80"
                                    >
                                        {ctx}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-center text-muted-foreground pt-2">
                        {tasks.filter(t => t.status === 'inbox').length} {t('process.remaining')}
                    </p>
                </div>
            )}

            {/* Context Filter Bar */}
            {showContextFilter && !isProcessing && (
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setSelectedContext(null)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                            selectedContext === null
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        )}
                    >
                        All
                    </button>
                    {allContexts.map(context => (
                        <button
                            key={context}
                            onClick={() => setSelectedContext(context)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                                selectedContext === context
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                            )}
                        >
                            {context}
                            {contextCounts[context] > 0 && (
                                <span className="ml-1 opacity-70">({contextCounts[context]})</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            <form onSubmit={handleAddTask} className="relative">
                <input
                    type="text"
                    placeholder={`Add a task to ${title}...`}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg py-3 pl-4 pr-12 shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                <button
                    type="submit"
                    disabled={!newTaskTitle.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </form>

            <div className="space-y-3">
                {filteredTasks.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>
                            {selectedContext
                                ? `No tasks with ${selectedContext} in ${title}.`
                                : `No tasks found in ${title}.`}
                        </p>
                    </div>
                ) : (
                    filteredTasks.map(task => (
                        <TaskItem key={task.id} task={task} />
                    ))
                )}
            </div>
        </div>
    );
}
