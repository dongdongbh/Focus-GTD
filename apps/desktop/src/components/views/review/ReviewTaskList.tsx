import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

    const shouldVirtualize = tasks.length > 100;
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: shouldVirtualize ? tasks.length : 0,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 120,
        overscan: 6,
    });

    if (!shouldVirtualize) {
        return (
            <div className="space-y-3">
                {tasks.map((task) => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        project={task.projectId ? projectMap[task.projectId] : undefined}
                        showProjectBadgeInActions={false}
                        selectionMode={selectionMode}
                        isMultiSelected={multiSelectedIds.has(task.id)}
                        onToggleSelect={() => onToggleSelect(task.id)}
                    />
                ))}
            </div>
        );
    }

    return (
        <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const task = tasks[virtualRow.index];
                    if (!task) return null;
                    return (
                        <div
                            key={task.id}
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <div className="pb-3">
                                <TaskItem
                                    task={task}
                                    project={task.projectId ? projectMap[task.projectId] : undefined}
                                    showProjectBadgeInActions={false}
                                    selectionMode={selectionMode}
                                    isMultiSelected={multiSelectedIds.has(task.id)}
                                    onToggleSelect={() => onToggleSelect(task.id)}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
