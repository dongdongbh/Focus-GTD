import { useMemo } from 'react';
import { useTaskStore, filterTasksBySearch, sortTasks, Project } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { useLanguage } from '../../contexts/language-context';

interface SearchViewProps {
    savedSearchId: string;
}

export function SearchView({ savedSearchId }: SearchViewProps) {
    const { tasks, projects, settings } = useTaskStore();
    const { t } = useLanguage();

    const savedSearch = settings?.savedSearches?.find(s => s.id === savedSearchId);
    const query = savedSearch?.query || '';

    const projectMap = useMemo(() => {
        return projects.reduce((acc, project) => {
            acc[project.id] = project;
            return acc;
        }, {} as Record<string, Project>);
    }, [projects]);

    const filteredTasks = useMemo(() => {
        if (!query) return [];
        return sortTasks(filterTasksBySearch(tasks, projects, query));
    }, [tasks, projects, query]);

    return (
        <div className="space-y-4">
            <header className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">
                    {savedSearch?.name || t('search.savedSearches')}
                </h2>
                {query && (
                    <p className="text-sm text-muted-foreground">
                        {query}
                    </p>
                )}
            </header>

            {filteredTasks.length === 0 && query && (
                <div className="text-sm text-muted-foreground">
                    {t('search.noResults')}
                </div>
            )}

            <div className="space-y-3">
                {filteredTasks.map(task => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        project={task.projectId ? projectMap[task.projectId] : undefined}
                    />
                ))}
            </div>
        </div>
    );
}

