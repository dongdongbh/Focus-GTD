import { useState } from 'react';
import { useTaskStore } from '@focus-gtd/core';
import { TaskItem } from '../TaskItem';
import { Tag, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ContextsView() {
    const { tasks } = useTaskStore();
    const [selectedContext, setSelectedContext] = useState<string | null>(null);

    // Filter out deleted tasks first
    const activeTasks = tasks.filter(t => !t.deletedAt);

    // Extract all unique contexts from active tasks
    const allContexts = Array.from(new Set(
        activeTasks.flatMap(t => t.contexts || [])
    )).sort();

    const filteredTasks = selectedContext
        ? activeTasks.filter(t => t.contexts?.includes(selectedContext) && t.status !== 'done')
        : activeTasks.filter(t => (t.contexts?.length || 0) > 0 && t.status !== 'done');

    return (
        <div className="flex h-full gap-6">
            {/* Sidebar List of Contexts */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-4 border-r border-border pr-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight">Contexts</h2>
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
                        <span className="flex-1">All Contexts</span>
                        <span className="text-xs text-muted-foreground">
                            {activeTasks.filter(t => (t.contexts?.length || 0) > 0 && t.status !== 'done').length}
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
                                {activeTasks.filter(t => t.contexts?.includes(context) && t.status !== 'done').length}
                            </span>
                        </div>
                    ))}

                    {allContexts.length === 0 && (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            No contexts found. Add contexts like "@home" to your tasks.
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
                            {selectedContext ? selectedContext : 'All Contexts'}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {filteredTasks.length} active tasks
                        </p>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {filteredTasks.length > 0 ? (
                        filteredTasks.map(task => (
                            <TaskItem key={task.id} task={task} />
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-12">
                            No active tasks found for this context.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
