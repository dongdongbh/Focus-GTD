import type { Project, Task } from '@mindwtr/core';
import { TaskItem } from '../../TaskItem';

type ReviewTaskListProps = {
    tasks: Task[];
    projectMap: Record<string, Project>;
    selectionMode: boolean;
    multiSelectedIds: Set<string>;
    onToggleSelect: (taskId: string) => void;
    t: (key: string) => string;
};

export function ReviewTaskList({
    tasks,
    projectMap,
    selectionMode,
    multiSelectedIds,
    onToggleSelect,
    t,
}: ReviewTaskListProps) {
    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p>{t('review.noTasks')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {tasks.map((task) => (
                <TaskItem
                    key={task.id}
                    task={task}
                    project={task.projectId ? projectMap[task.projectId] : undefined}
                    selectionMode={selectionMode}
                    isMultiSelected={multiSelectedIds.has(task.id)}
                    onToggleSelect={() => onToggleSelect(task.id)}
                />
            ))}
        </div>
    );
}
