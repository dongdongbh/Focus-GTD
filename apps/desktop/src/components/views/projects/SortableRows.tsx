import type { Area, Project, Task } from '@mindwtr/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { TaskItem } from '../../TaskItem';

type AreaRowProps = {
    area: Area;
    onDelete: (areaId: string) => void;
    onUpdateName: (areaId: string, name: string) => void;
    onUpdateColor: (areaId: string, color: string) => void;
    t: (key: string) => string;
};

export function SortableAreaRow({
    area,
    onDelete,
    onUpdateName,
    onUpdateColor,
    t,
}: AreaRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: area.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-2">
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                title={t('projects.sortAreas')}
            >
                <GripVertical className="w-4 h-4" />
            </button>
            <input
                type="color"
                value={area.color || '#94a3b8'}
                onChange={(e) => onUpdateColor(area.id, e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                title={t('projects.color')}
            />
            <input
                key={`${area.id}-${area.updatedAt}`}
                defaultValue={area.name}
                onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== area.name) {
                        onUpdateName(area.id, name);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const name = e.currentTarget.value.trim();
                        if (name && name !== area.name) {
                            onUpdateName(area.id, name);
                        }
                        e.currentTarget.blur();
                    }
                }}
                className="flex-1 bg-muted/50 border border-border rounded px-2 py-1 text-sm"
            />
            <button
                type="button"
                onClick={() => onDelete(area.id)}
                className="text-destructive hover:bg-destructive/10 h-8 w-8 rounded-md transition-colors flex items-center justify-center"
                title={t('common.delete')}
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}

export function SortableProjectRow({
    projectId,
    children,
}: {
    projectId: string;
    children: (props: { handle: React.ReactNode; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: projectId });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
    };

    const handle = (
        <button
            type="button"
            {...attributes}
            {...listeners}
            className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
            title="Drag"
        >
            <GripVertical className="w-3.5 h-3.5" />
        </button>
    );

    return (
        <div ref={setNodeRef} style={style}>
            {children({ handle, isDragging })}
        </div>
    );
}

export function SortableProjectTaskRow({
    task,
    project,
}: {
    task: Task;
    project: Project;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
                <TaskItem
                    task={task}
                    project={project}
                    enableDoubleClickEdit
                    showProjectBadgeInActions={false}
                    dragHandle={(
                        <button
                            type="button"
                            {...attributes}
                            {...listeners}
                            onClick={(event) => event.stopPropagation()}
                            className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
                            title="Drag"
                        >
                            <GripVertical className="w-3.5 h-3.5" />
                        </button>
                    )}
                />
            </div>
        </div>
    );
}
