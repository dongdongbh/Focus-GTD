import { useState, useEffect, useRef } from 'react';
import { Search, FileText, CheckCircle, Save } from 'lucide-react';
import { useTaskStore, Task, Project, searchAll, generateUUID, SavedSearch } from '@mindwtr/core';
import { useLanguage } from '../contexts/language-context';
import { cn } from '../lib/utils';

interface GlobalSearchProps {
    onNavigate: (view: string, itemId?: string) => void;
}

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const { tasks, projects, settings, updateSettings } = useTaskStore();
    const { t } = useLanguage();

    // Toggle search with Cmd+K / Ctrl+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    const trimmedQuery = query.trim();
    const { tasks: taskResults, projects: projectResults } = trimmedQuery === ''
        ? { tasks: [] as Task[], projects: [] as Project[] }
        : searchAll(tasks, projects, trimmedQuery);

    const results = trimmedQuery === '' ? [] : [
        ...projectResults.map(p => ({ type: 'project' as const, item: p })),
        ...taskResults.map(t => ({ type: 'task' as const, item: t })),
    ].slice(0, 50); // Limit results

    // Keyboard navigation
    const handleListKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                handleSelect(results[selectedIndex]);
            }
        }
    };

    const handleSelect = (result: { type: 'project' | 'task', item: Project | Task }) => {
        setIsOpen(false);
        if (result.type === 'project') {
            onNavigate('projects', result.item.id);
        } else {
            // Map task status to appropriate view
            const task = result.item as Task;
            const statusViewMap: Record<string, string> = {
                'inbox': 'inbox',
                'next': 'next',
                'todo': 'next', // todo tasks shown in next actions
                'in-progress': 'next',
                'waiting': 'waiting',
                'someday': 'someday',
                'done': 'done',
                'archived': 'archived',
            };
            const targetView = statusViewMap[task.status] || 'next';
            onNavigate(targetView, task.id);
        }
    };

    if (!isOpen) return null;

    const savedSearches = settings?.savedSearches || [];
    const canSave = trimmedQuery.length > 0;

    const handleSaveSearch = async () => {
        if (!canSave) return;
        const existing = savedSearches.find(s => s.query === trimmedQuery);
        if (existing) {
            setIsOpen(false);
            onNavigate(`savedSearch:${existing.id}`);
            return;
        }
        const name = window.prompt(t('search.saveSearchPrompt'), trimmedQuery);
        if (!name || !name.trim()) return;

        const newSearch: SavedSearch = {
            id: generateUUID(),
            name: name.trim(),
            query: trimmedQuery,
        };
        await updateSettings({ savedSearches: [...savedSearches, newSearch] });
        setIsOpen(false);
        onNavigate(`savedSearch:${newSearch.id}`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-background/80 backdrop-blur-sm animate-in fade-in-0">
            <div
                className="w-full max-w-lg bg-popover text-popover-foreground rounded-xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center border-b px-4 py-3 gap-3">
                    <Search className="w-5 h-5 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={handleListKeyDown}
                        placeholder={t('search.placeholder') || "Search tasks and projects..."}
                        className="flex-1 bg-transparent border-none outline-none text-lg placeholder:text-muted-foreground"
                    />
                    {canSave && (
                        <button
                            onClick={handleSaveSearch}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
                            title={t('search.saveSearch')}
                        >
                            <Save className="w-3 h-3" />
                            {t('search.saveSearch')}
                        </button>
                    )}
                    <div className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 hidden sm:inline-block">
                        ESC
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {results.length === 0 && trimmedQuery !== '' && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            {t('search.noResults')} "{trimmedQuery}"
                        </div>
                    )}

                    {results.length === 0 && trimmedQuery === '' && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            {t('search.typeToSearch')}
                        </div>
                    )}

                    {results.map((result, index) => (
                        <button
                            key={`${result.type}-${result.item.id}`}
                            onClick={() => handleSelect(result)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
                                index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                            )}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            {result.type === 'project' ? (
                                <FileText className="w-4 h-4 text-blue-500" />
                            ) : (
                                <CheckCircle className={cn("w-4 h-4", (result.item as Task).status === 'done' ? "text-green-500" : "text-gray-400")} />
                            )}

                            <div className="flex-1 flex flex-col overflow-hidden">
                                <span className="truncate font-medium">{result.item.title}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {result.type === 'project' ? t('search.resultProject') : t('search.resultTask')}
                                    {result.type === 'task' && (result.item as Task).projectId ? ` • ${t('search.inProjectSuffix')}` : ''}
                                </span>
                            </div>

                            {index === selectedIndex && (
                                <span className="text-xs text-muted-foreground">↵</span>
                            )}
                        </button>
                    ))}

                    {trimmedQuery !== '' && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border mt-2">
                            {t('search.helpOperators')}
                        </div>
                    )}
                </div>
            </div>

            {/* Click backdrop to close */}
            <div className="absolute inset-0 -z-10" onClick={() => setIsOpen(false)} />
        </div>
    );
}
