import { Calendar, Inbox, CheckSquare, Archive, Layers, Tag, CheckCircle2, HelpCircle, Folder, Settings, Target, Search, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTaskStore } from '@mindwtr/core';
import { useLanguage } from '../contexts/language-context';

interface LayoutProps {
    children: React.ReactNode;
    currentView: string;
    onViewChange: (view: string) => void;
}

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
    const { tasks, settings, updateSettings } = useTaskStore();
    const { t } = useLanguage();
    const isCollapsed = settings?.sidebarCollapsed ?? false;

    // Filter out deleted tasks from counts
    const activeTasks = tasks.filter(t => !t.deletedAt);
    const inboxCount = activeTasks.filter(t => t.status === 'inbox').length;
    const nextCount = activeTasks.filter(t => t.status === 'next').length;

    // Trigger global search by simulating Cmd+K
    const triggerSearch = () => {
        const event = new KeyboardEvent('keydown', {
            key: 'k',
            metaKey: true,
            ctrlKey: true,
            bubbles: true
        });
        window.dispatchEvent(event);
    };

    const savedSearches = settings?.savedSearches || [];

    const toggleSidebar = () => {
        updateSettings({ sidebarCollapsed: !isCollapsed }).catch(console.error);
    };

    const navItems = [
        { id: 'inbox', labelKey: 'nav.inbox', icon: Inbox, count: inboxCount },
        { id: 'agenda', labelKey: 'nav.agenda', icon: Target },
        { id: 'board', labelKey: 'nav.board', icon: Layers },
        { id: 'projects', labelKey: 'nav.projects', icon: Folder },
        { id: 'contexts', labelKey: 'nav.contexts', icon: Tag, path: 'contexts' },
        { id: 'next', labelKey: 'nav.next', icon: Layers, count: nextCount },
        { id: 'waiting', labelKey: 'nav.waiting', icon: Archive },
        { id: 'someday', labelKey: 'nav.someday', icon: Archive },
        { id: 'calendar', labelKey: 'nav.calendar', icon: Calendar },
        { id: 'review', labelKey: 'nav.review', icon: CheckCircle2, path: 'review' },
        { id: 'tutorial', labelKey: 'nav.tutorial', icon: HelpCircle, path: 'tutorial' },
        // Settings moved to footer
        { id: 'done', labelKey: 'nav.done', icon: CheckSquare },
        { id: 'archived', labelKey: 'nav.archived', icon: Archive },
    ];

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <aside className={cn(
                "border-r border-border bg-card flex flex-col transition-all duration-150",
                isCollapsed ? "w-16 p-2" : "w-64 p-4"
            )}>
                <div className={cn("flex items-center gap-2 px-2 mb-4", isCollapsed && "justify-center")}>
                    <img
                        src="/logo.png"
                        alt="Mindwtr"
                        className="w-8 h-8 rounded-lg"
                    />
                    {!isCollapsed && <h1 className="text-xl font-bold">{t('app.name')}</h1>}
                    <button
                        onClick={toggleSidebar}
                        className={cn(
                            "ml-auto p-1 rounded hover:bg-accent transition-colors text-muted-foreground",
                            isCollapsed && "ml-0"
                        )}
                        title={t('keybindings.toggleSidebar')}
                        aria-label={t('keybindings.toggleSidebar')}
                    >
                        {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                    </button>
                </div>

                {/* Search Button */}
                <button
                    onClick={triggerSearch}
                    className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 mb-4 rounded-md text-sm font-medium transition-colors bg-muted/50 hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                        isCollapsed && "justify-center px-2"
                    )}
                    title={t('search.placeholder')}
                >
                    <Search className="w-4 h-4" />
                    {!isCollapsed && (
                        <>
                            <span className="flex-1 text-left">{t('search.placeholder') || 'Search...'}</span>
                            <span className="text-xs opacity-50">⌘K</span>
                        </>
                    )}
                </button>

                {savedSearches.length > 0 && (
                    <div className={cn("mb-4 space-y-1", isCollapsed && "mb-2")}>
                        {!isCollapsed && (
                            <div className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                {t('search.savedSearches')}
                            </div>
                        )}
                        {savedSearches.map((search) => (
                            <button
                                key={search.id}
                                onClick={() => onViewChange(`savedSearch:${search.id}`)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                    currentView === `savedSearch:${search.id}`
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                                    isCollapsed && "justify-center px-2"
                                )}
                                title={search.name}
                            >
                                <Search className="w-4 h-4" />
                                {!isCollapsed && <span className="truncate">{search.name}</span>}
                            </button>
                        ))}
                    </div>
                )}

                <nav className="space-y-1 flex-1">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={cn(
                                "w-full flex items-center rounded-md text-sm font-medium transition-colors",
                                currentView === item.id
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                                isCollapsed ? "justify-center px-2 py-2" : "justify-between px-3 py-2"
                            )}
                            aria-current={currentView === item.id ? 'page' : undefined}
                            title={t(item.labelKey)}
                        >
                            <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
                                <item.icon className="w-4 h-4" />
                                {!isCollapsed && t(item.labelKey)}
                            </div>
                            {!isCollapsed && item.count !== undefined && item.count > 0 && (
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

                <div className="mt-auto pt-4 border-t border-border space-y-1">
                    <button
                        onClick={() => onViewChange('settings')}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            currentView === 'settings'
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                            isCollapsed && "justify-center px-2"
                        )}
                        aria-current={currentView === 'settings' ? 'page' : undefined}
                        title={t('nav.settings')}
                    >
                        <Settings className="w-4 h-4" />
                        {!isCollapsed && t('nav.settings')}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className={cn(
                    "mx-auto p-8 h-full",
                    ['board', 'calendar'].includes(currentView) ? "max-w-full" : "max-w-4xl"
                )}>
                    {children}
                </div>
            </main>
        </div>
    );
}
