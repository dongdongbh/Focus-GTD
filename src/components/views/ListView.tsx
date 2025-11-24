import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTaskStore } from '../../store/store';
import { TaskItem } from '../TaskItem';
import { TaskStatus } from '../../types';

interface ListViewProps {
    title: string;
    statusFilter: TaskStatus | 'all';
}

export function ListView({ title, statusFilter }: ListViewProps) {
    const { tasks, addTask } = useTaskStore();
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const filteredTasks = tasks.filter(t =>
        statusFilter === 'all' ? true : t.status === statusFilter
    );

    const handleAddTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (newTaskTitle.trim()) {
            addTask(newTaskTitle);
            setNewTaskTitle('');
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                <span className="text-muted-foreground text-sm">{filteredTasks.length} tasks</span>
            </header>

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
                        <p>No tasks found in {title}.</p>
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
