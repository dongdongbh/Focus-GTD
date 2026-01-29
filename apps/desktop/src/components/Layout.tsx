import { useEffect, useMemo } from 'react';
import { Calendar, Inbox, CheckSquare, Archive, Layers, Tag, CheckCircle2, HelpCircle, Folder, Settings, Target, Search, ChevronsLeft, ChevronsRight, Trash2, PauseCircle, Book } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTaskStore, safeParseDate } from '@mindwtr/core';
import { useLanguage } from '../contexts/language-context';
import { useUiStore } from '../store/ui-store';
import { reportError } from '../lib/report-error';
import { ToastHost } from './ToastHost';
import { AREA_FILTER_ALL, AREA_FILTER_NONE, resolveAreaFilter, taskMatchesAreaFilter } from '../lib/area-filter';

interface LayoutProps {
    children: React.ReactNode;
    currentView: string;
    onViewChange: (view: string) => void;
}

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
    const { tasks, projects, areas, settings, updateSettings, error, setError } = useTaskStore((state) => ({
        tasks: state.tasks,
        projects: state.projects,
        areas: state.areas,
        settings: state.settings,
        updateSettings: state.updateSettings,
        error: state.error,
        setError: state.setError,
    }));
    const { t } = useLanguage();
    const isCollapsed = settings?.sidebarCollapsed ?? false;
    const isFocusMode = useUiStore((state) => state.isFocusMode);
    const dismissLabel = t('common.dismiss');
    const dismissText = dismissLabel && dismissLabel !== 'common.dismiss' ? dismissLabel : 'Dismiss';
    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
    const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const resolvedAreaFilter = useMemo(
        () => resolveAreaFilter(settings?.filters?.areaId, areas),
        [settings?.filters?.areaId, areas],
    );
    const sortedAreas = useMemo(() => [...areas].sort((a, b) => a.order - b.order), [areas]);
    const inboxCount = useMemo(() => {
        const now = Date.now();
        let count = 0;
        for (const task of tasks) {
            if (task.deletedAt) continue;
            if (task.status !== 'inbox') continue;
            const start = safeParseDate(task.startTime);
            if (start && start.getTime() > now) continue;
            if (!taskMatchesAreaFilter(task, resolvedAreaFilter, projectMap, areaById)) continue;
            count += 1;
        }
        return count;
    }, [tasks, resolvedAreaFilter, projectMap, areaById]);
    const wideViews = new Set([
        'inbox',
        'next',
        'focus',
        'someday',
        'reference',
        'waiting',
        'done',
        'archived',
        'trash',
        'review',
        'projects',
        'contexts',
        'search',
        'agenda',
    ]);
    const isWideView = wideViews.has(currentView);

    const navItems = useMemo(() => ([
        { id: 'inbox', labelKey: 'nav.inbox', icon: Inbox, count: inboxCount },
        { id: 'agenda', labelKey: 'nav.agenda', icon: Target },
        { id: 'projects', labelKey: 'nav.projects', icon: Folder },
        { id: 'someday', labelKey: 'nav.someday', icon: Archive },
        { id: 'waiting', labelKey: 'nav.waiting', icon: PauseCircle },
        { id: 'reference', labelKey: 'nav.reference', icon: Book },
        { id: 'calendar', labelKey: 'nav.calendar', icon: Calendar },
        { id: 'review', labelKey: 'nav.review', icon: CheckCircle2, path: 'review' },
        { id: 'contexts', labelKey: 'nav.contexts', icon: Tag, path: 'contexts' },
        { id: 'board', labelKey: 'nav.board', icon: Layers },
        { id: 'tutorial', labelKey: 'nav.tutorial', icon: HelpCircle, path: 'tutorial' },
        // Settings moved to footer
        { id: 'done', labelKey: 'nav.done', icon: CheckSquare },
        { id: 'archived', labelKey: 'nav.archived', icon: Archive },
        { id: 'trash', labelKey: 'nav.trash', icon: Trash2 },
    ]), [inboxCount]);

    const triggerSearch = () => {
        window.dispatchEvent(new CustomEvent('mindwtr:open-search'));
    };

    const savedSearches = settings?.savedSearches || [];

    const toggleSidebar = () => {
        updateSettings({ sidebarCollapsed: !isCollapsed }).catch((error) => reportError('Failed to update settings', error));
    };

    useEffect(() => {
        if (areas.length === 0) return;
        if (resolvedAreaFilter === (settings?.filters?.areaId ?? AREA_FILTER_ALL)) return;
        updateSettings({ filters: { ...(settings?.filters ?? {}), areaId: resolvedAreaFilter } })
            .catch((error) => reportError('Failed to update area filter', error));
    }, [areas.length, resolvedAreaFilter, settings?.filters?.areaId, updateSettings]);

    const handleAreaFilterChange = (value: string) => {
        updateSettings({ filters: { ...(settings?.filters ?? {}), areaId: value } })
            .catch((error) => reportError('Failed to update area filter', error));
    };


    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground"
            >
                {t('accessibility.skipToContent') || 'Skip to content'}
            </a>
            {/* Sidebar */}
            {!isFocusMode && (
                <aside className={cn(
                    "border-r border-border bg-card flex flex-col transition-all duration-150",
                    isCollapsed ? "w-16 p-2" : "w-64 p-4"
                )}>
                <div className={cn("flex items-center gap-2 px-2 mb-4", isCollapsed && "justify-center")}>
                    {!isCollapsed && (
                        <img
                            src="/logo.png"
                            alt="Mindwtr"
                            className="w-8 h-8 rounded-lg"
                        />
                    )}
                    {!isCollapsed && <h1 className="text-xl font-bold">{t('app.name')}</h1>}
                    <button
                        onClick={toggleSidebar}
                        className={cn(
                            "ml-auto p-1 rounded hover:bg-accent transition-colors text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40",
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
                        "w-full flex items-center gap-3 px-3 py-2 mb-4 rounded-md text-sm font-medium transition-colors bg-muted/50 hover:bg-accent hover:text-accent-foreground text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40",
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

                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
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
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background focus:bg-accent focus:text-accent-foreground",
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

                    <nav className="space-y-1 pb-4" data-sidebar-nav>
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => onViewChange(item.id)}
                                data-sidebar-item
                                data-view={item.id}
                                className={cn(
                                    "w-full flex items-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background focus:bg-accent focus:text-accent-foreground",
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
                </div>

                <div className="mt-auto pt-4 border-t border-border space-y-3">
                    {!isCollapsed && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                {t('projects.areaFilter')}
                            </label>
                            <select
                                value={resolvedAreaFilter}
                                onChange={(event) => handleAreaFilterChange(event.target.value)}
                                className="w-full text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground"
                            >
                                <option value={AREA_FILTER_ALL}>{t('projects.allAreas')}</option>
                                {sortedAreas.map((area) => (
                                    <option key={area.id} value={area.id}>
                                        {area.name}
                                    </option>
                                ))}
                                <option value={AREA_FILTER_NONE}>{t('projects.noArea')}</option>
                            </select>
                        </div>
                    )}
                    <button
                        onClick={() => onViewChange('settings')}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background focus:bg-accent focus:text-accent-foreground",
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
            )}

            {/* Main Content */}
            <main
                id="main-content"
                className="flex-1 overflow-auto"
                data-main-content
                tabIndex={-1}
                role="main"
                aria-label={t('accessibility.mainContent') || 'Main content'}
            >
                <div className={cn(
                    "mx-auto p-8 h-full",
                    isFocusMode
                        ? "max-w-[800px]"
                        : currentView === 'board'
                            ? "w-full max-w-none"
                            : (isWideView || currentView === 'calendar')
                            ? "w-full max-w-6xl"
                            : "max-w-4xl"
                )}>
                    {error && (
                        <div
                            role="alert"
                            aria-live="assertive"
                            className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        >
                            <span>{error}</span>
                            <button
                                type="button"
                                className="text-destructive/80 hover:text-destructive underline underline-offset-2"
                                onClick={() => setError(null)}
                            >
                                {dismissText}
                            </button>
                        </div>
                    )}
                    {children}
                </div>
            </main>
            <ToastHost />
        </div>
    );
}
