
import React from 'react';
import { Inbox, Calendar, CheckSquare, Layers, Archive, Folder, Plus, Tag, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTaskStore } from '../store/store';

interface LayoutProps {
    children: React.ReactNode;
    currentView: string;
    onViewChange: (view: string) => void;
}

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
    const { tasks } = useTaskStore();

    const inboxCount = tasks.filter(t => t.status === 'inbox').length;
    const nextCount = tasks.filter(t => t.status === 'next').length;

    const navItems = [
        { id: 'inbox', label: 'Inbox', icon: Inbox, count: inboxCount },
        { id: 'board', label: 'Board View', icon: Layers },
        { id: 'projects', label: 'Projects', icon: Folder },
        { id: 'contexts', label: 'Contexts', icon: Tag },
        { id: 'next', label: 'Next Actions', icon: Layers, count: nextCount },
        { id: 'someday', label: 'Someday/Maybe', icon: Archive },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'review', label: 'Weekly Review', icon: RefreshCw },
        { id: 'done', label: 'Done', icon: CheckSquare },
    ];

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border bg-card p-4 flex flex-col">
                <div className="flex items-center gap-2 px-2 mb-8">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <CheckSquare className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-bold">Focus GTD</h1>
                </div>

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                currentView === item.id
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </div>
                            {item.count !== undefined && item.count > 0 && (
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    currentView === item.id
                                        ? "bg-primary-foreground/20 text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                                )}>
                                    {item.count}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="mt-auto pt-4 border-t border-border">
                    <button
                        onClick={() => onViewChange('inbox')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Task
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-4xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
