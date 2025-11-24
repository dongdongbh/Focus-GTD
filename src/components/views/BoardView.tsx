import React from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, DragEndEvent, DragStartEvent, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskItem } from '../TaskItem';
import { useTaskStore } from '../../store/store';
import { Task, TaskStatus } from '../../types';
import { cn } from '../../lib/utils';

const COLUMNS: { id: TaskStatus; label: string }[] = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'next', label: 'Next Actions' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'someday', label: 'Someday' },
    { id: 'done', label: 'Done' },
];

function DroppableColumn({ id, label, tasks }: { id: TaskStatus; label: string; tasks: Task[] }) {
    const { setNodeRef } = useDroppable({ id });

    return (
        <div ref={setNodeRef} className="flex flex-col h-full min-w-[280px] w-80 bg-muted/30 rounded-lg p-4 border border-border/50">
            <h3 className="font-semibold mb-4 flex items-center justify-between">
                {label}
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{tasks.length}</span>
            </h3>
            <div className="flex-1 space-y-3 overflow-y-auto min-h-[100px]">
                {tasks.map((task) => (
                    <DraggableTask key={task.id} task={task} />
                ))}
            </div>
        </div>
    );
}

function DraggableTask({ task }: { task: Task }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        data: { task },
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    if (isDragging) {
        return (
            <div ref={setNodeRef} style={style} className="opacity-50">
                <TaskItem task={task} />
            </div>
        );
    }

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-none">
            <TaskItem task={task} />
        </div>
    );
}

export function BoardView() {
    const { tasks, moveTask } = useTaskStore();
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [activeTask, setActiveTask] = React.useState<Task | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveTask(event.active.data.current?.task || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            // If dropped over a column (which has an ID matching a TaskStatus)
            const status = over.id as TaskStatus;
            if (COLUMNS.some(c => c.id === status)) {
                moveTask(active.id as string, status);
            }
        }
        setActiveId(null);
        setActiveTask(null);
    };

    return (
        <div className="h-full overflow-x-auto">
            <div className="flex gap-6 h-full min-w-max pb-4">
                <DndContext
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    collisionDetection={closestCorners}
                >
                    {COLUMNS.map((col) => (
                        <DroppableColumn
                            key={col.id}
                            id={col.id}
                            label={col.label}
                            tasks={tasks.filter(t => t.status === col.id)}
                        />
                    ))}

                    <DragOverlay>
                        {activeTask ? (
                            <div className="w-80 rotate-3 cursor-grabbing">
                                <TaskItem task={activeTask} />
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>
        </div>
    );
}
