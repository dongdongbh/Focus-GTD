import React, { useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Calendar as CalendarIcon, Tag, Trash2, ArrowRight } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { useTaskStore } from '../store/store';
import { cn } from '../lib/utils';

interface TaskItemProps {
    task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
    const { updateTask, deleteTask, moveTask, projects } = useTaskStore();
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(task.title);
    const [editDueDate, setEditDueDate] = useState(task.dueDate || '');
    const [editStartTime, setEditStartTime] = useState(task.startTime || '');
    const [editProjectId, setEditProjectId] = useState(task.projectId || '');
    const [editContexts, setEditContexts] = useState(task.contexts?.join(', ') || '');

    const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        moveTask(task.id, e.target.value as TaskStatus);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editTitle.trim()) {
            updateTask(task.id, {
                title: editTitle,
                dueDate: editDueDate || undefined,
                startTime: editStartTime || undefined,
                projectId: editProjectId || undefined,
                contexts: editContexts.split(',').map(c => c.trim()).filter(Boolean)
            });
            setIsEditing(false);
        }
    };

    // Urgency Logic
    const getUrgencyColor = () => {
        if (task.status === 'done') return 'text-muted-foreground';
        if (!task.dueDate) return 'text-muted-foreground';

        const now = new Date();
        const due = new Date(task.dueDate);
        const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (diffHours < 0) return 'text-destructive font-bold'; // Overdue
        if (diffHours < 24) return 'text-orange-500 font-medium'; // Due soon
        if (diffHours < 72) return 'text-yellow-600'; // Due in 3 days
        return 'text-muted-foreground';
    };

    // State Colors
    const getStateColor = () => {
        switch (task.status) {
            case 'next': return 'border-l-4 border-l-green-500';
            case 'waiting': return 'border-l-4 border-l-orange-400';
            case 'someday': return 'border-l-4 border-l-purple-400';
            case 'done': return 'border-l-4 border-l-gray-300 bg-muted/30';
            default: return 'border-l-4 border-l-blue-400'; // Inbox
        }
    };

    // Format for datetime-local input (YYYY-MM-DDThh:mm)
    const toInputFormat = (isoString?: string) => {
        if (!isoString) return '';
        return new Date(isoString).toISOString().slice(0, 16);
    };

    const project = projects.find(p => p.id === task.projectId);

    return (
        <div className={cn(
            "group bg-card border border-border rounded-lg p-4 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2",
            getStateColor()
        )}>
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => moveTask(task.id, task.status === 'done' ? 'inbox' : 'done')}
                    className="mt-1.5 h-4 w-4 rounded border-primary text-primary focus:ring-primary cursor-pointer"
                />

                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <input
                                autoFocus
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="w-full bg-transparent border-b border-primary/50 p-1 text-base font-medium focus:ring-0 focus:border-primary outline-none"
                                placeholder="Task title"
                            />
                            <div className="flex flex-wrap gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Start Time</label>
                                    <input
                                        type="datetime-local"
                                        value={editStartTime}
                                        onChange={(e) => setEditStartTime(e.target.value)}
                                        className="text-xs bg-muted/50 border border-border rounded px-2 py-1"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Deadline</label>
                                    <input
                                        type="datetime-local"
                                        value={editDueDate}
                                        onChange={(e) => setEditDueDate(e.target.value)}
                                        className="text-xs bg-muted/50 border border-border rounded px-2 py-1"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Project</label>
                                    <select
                                        value={editProjectId}
                                        onChange={(e) => setEditProjectId(e.target.value)}
                                        className="text-xs bg-muted/50 border border-border rounded px-2 py-1"
                                    >
                                        <option value="">No Project</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>{p.title}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1 w-full">
                                    <label className="text-xs text-muted-foreground font-medium">Contexts (comma separated)</label>
                                    <input
                                        type="text"
                                        value={editContexts}
                                        onChange={(e) => setEditContexts(e.target.value)}
                                        placeholder="@home, @work"
                                        className="text-xs bg-muted/50 border border-border rounded px-2 py-1 w-full"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="submit"
                                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded hover:bg-muted/80"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="group/content">
                            <div
                                onClick={() => setIsEditing(true)}
                                className={cn(
                                    "text-base font-medium cursor-pointer truncate hover:text-primary transition-colors",
                                    task.status === 'done' && "line-through text-muted-foreground"
                                )}
                            >
                                {task.title}
                            </div>

                            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
                                {project && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/50 text-accent-foreground font-medium text-[10px]">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                                        {project.title}
                                    </div>
                                )}
                                {task.startTime && (
                                    <div className="flex items-center gap-1 text-blue-500/80" title="Start Time">
                                        <ArrowRight className="w-3 h-3" />
                                        {format(new Date(task.startTime), 'MMM d, HH:mm')}
                                    </div>
                                )}
                                {task.dueDate && (
                                    <div className={cn("flex items-center gap-1", getUrgencyColor())} title="Deadline">
                                        <CalendarIcon className="w-3 h-3" />
                                        {format(new Date(task.dueDate), 'MMM d, HH:mm')}
                                    </div>
                                )}
                                {task.contexts?.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        {task.contexts.map(ctx => (
                                            <span key={ctx} className="text-muted-foreground hover:text-foreground transition-colors">
                                                {ctx}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {task.tags.length > 0 && (
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                        <Tag className="w-3 h-3" />
                                        {task.tags.join(', ')}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {!isEditing && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <select
                            value={task.status}
                            onChange={handleStatusChange}
                            className="text-xs bg-transparent border border-border rounded px-2 py-1 focus:ring-primary cursor-pointer"
                        >
                            <option value="inbox">Inbox</option>
                            <option value="next">Next</option>
                            <option value="someday">Someday</option>
                            <option value="waiting">Waiting</option>
                            <option value="done">Done</option>
                        </select>

                        <button
                            onClick={() => deleteTask(task.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
