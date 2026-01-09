import { useMemo, useState } from 'react';
import { useTaskStore, sortTasksBy, safeFormatDate } from '@mindwtr/core';
import type { TaskSortBy } from '@mindwtr/core';
import { Undo2, Trash2 } from 'lucide-react';
import { useLanguage } from '../../contexts/language-context';

export function TrashView() {
    const { _allTasks, restoreTask, purgeTask, purgeDeletedTasks, settings } = useTaskStore();
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const sortBy = (settings?.taskSortBy ?? 'default') as TaskSortBy;

    const trashedTasks = useMemo(() => {
        const filtered = _allTasks.filter((task) => task.deletedAt);
        const sorted = sortTasksBy(filtered, sortBy);
        if (!searchQuery) return sorted;
        const query = searchQuery.toLowerCase();
        return sorted.filter((task) => task.title.toLowerCase().includes(query));
    }, [_allTasks, searchQuery, sortBy]);

    const handleClearTrash = () => {
        if (trashedTasks.length === 0) return;
        const confirmMessage = `${t('trash.clearAllConfirm')}\n${t('trash.clearAllConfirmBody')}`;
        if (!window.confirm(confirmMessage)) return;
        purgeDeletedTasks();
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">{t('trash.title')}</h2>
                <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">
                        {trashedTasks.length} {t('common.tasks')}
                    </div>
                    <button
                        onClick={handleClearTrash}
                        disabled={trashedTasks.length === 0}
                        className="text-xs px-3 py-1 rounded-md border transition-colors bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('trash.clearAll')}
                    </button>
                </div>
            </header>

            <div className="relative">
                <input
                    type="text"
                    placeholder={t('trash.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg py-2 pl-4 pr-4 shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                />
            </div>

            <div className="space-y-3">
                {trashedTasks.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                        <p>{t('trash.noTasksFound')}</p>
                        <p className="text-xs mt-2">{t('trash.emptyHint')}</p>
                    </div>
                ) : (
                    trashedTasks.map((task) => (
                        <div
                            key={task.id}
                            className="bg-card border border-border rounded-lg p-4 flex items-center justify-between group hover:shadow-sm transition-all"
                        >
                            <div>
                                <h3 className="font-medium text-foreground line-through opacity-70">{task.title}</h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {task.deletedAt && `${t('trash.deletedAt')}: ${safeFormatDate(task.deletedAt, 'P')}`}
                                </p>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => restoreTask(task.id)}
                                    className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-primary transition-colors"
                                    title={t('trash.restoreToInbox')}
                                >
                                    <Undo2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => purgeTask(task.id)}
                                    className="p-2 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-colors"
                                    title={t('trash.deletePermanently')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
