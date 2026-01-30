import { Calendar as CalendarIcon, Tag, Trash2, ArrowRight, Repeat, Check, Clock, Timer, Paperclip, RotateCcw, Copy, MapPin, Hourglass, BookOpen, Star } from 'lucide-react';
import type { Area, Attachment, Project, Task, TaskStatus, RecurrenceRule, RecurrenceStrategy } from '@mindwtr/core';
import { getChecklistProgress, getTaskAgeLabel, getTaskStaleness, getTaskUrgency, hasTimeComponent, safeFormatDate, stripMarkdown, resolveTaskTextDirection } from '@mindwtr/core';
import { cn } from '../../lib/utils';
import { MetadataBadge } from '../ui/MetadataBadge';
import { AttachmentProgressIndicator } from '../AttachmentProgressIndicator';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

interface TaskItemDisplayProps {
    task: Task;
    project?: Project;
    area?: Area;
    projectColor?: string;
    selectionMode: boolean;
    isViewOpen: boolean;
    onToggleSelect?: () => void;
    onToggleView: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onStatusChange: (status: TaskStatus) => void;
    onOpenProject?: (projectId: string) => void;
    openAttachment: (attachment: Attachment) => void;
    visibleAttachments: Attachment[];
    recurrenceRule: RecurrenceRule | '';
    recurrenceStrategy: RecurrenceStrategy;
    prioritiesEnabled: boolean;
    timeEstimatesEnabled: boolean;
    isStagnant: boolean;
    showQuickDone: boolean;
    showStatusSelect?: boolean;
    showProjectBadgeInActions?: boolean;
    onToggleChecklistItem?: (index: number) => void;
    focusToggle?: {
        isFocused: boolean;
        canToggle: boolean;
        onToggle: () => void;
        title: string;
        ariaLabel: string;
    };
    readOnly: boolean;
    compactMetaEnabled?: boolean;
    dense?: boolean;
    actionsOverlay?: boolean;
    dragHandle?: ReactNode;
    t: (key: string) => string;
}

const getUrgencyColor = (task: Task) => {
    const urgency = getTaskUrgency(task);
    switch (urgency) {
        case 'overdue': return 'text-destructive font-bold';
        case 'urgent': return 'text-orange-500 font-medium';
        case 'upcoming': return 'text-yellow-600';
        default: return 'text-muted-foreground';
    }
};

const formatTimeEstimate = (estimate: string) => {
    const value = String(estimate);
    if (value.endsWith('min')) return value.replace('min', 'm');
    if (value.endsWith('hr+')) return value.replace('hr+', 'h+');
    if (value.endsWith('hr')) return value.replace('hr', 'h');
    return value;
};

export function TaskItemDisplay({
    task,
    project,
    area,
    projectColor,
    selectionMode,
    isViewOpen,
    onToggleSelect,
    onToggleView,
    onEdit,
    onDelete,
    onDuplicate,
    onStatusChange,
    openAttachment,
    visibleAttachments,
    recurrenceRule,
    recurrenceStrategy,
    prioritiesEnabled,
    timeEstimatesEnabled,
    isStagnant,
    showQuickDone,
    showStatusSelect = true,
    showProjectBadgeInActions = true,
    onToggleChecklistItem,
    focusToggle,
    readOnly,
    compactMetaEnabled = true,
    dense = false,
    actionsOverlay = false,
    dragHandle,
    t,
    onOpenProject,
}: TaskItemDisplayProps) {
    const checklistProgress = getChecklistProgress(task);
    const ageLabel = getTaskAgeLabel(task.createdAt);
    const showCompactMeta = compactMetaEnabled
        && !isViewOpen
        && (project || area || (task.contexts?.length ?? 0) > 0);
    const resolvedDirection = resolveTaskTextDirection(task);
    const isRtl = resolvedDirection === 'rtl';
    const hoverHintText = (() => {
        const hint = t('task.hoverHint');
        return hint === 'task.hoverHint'
            ? 'Click to toggle details / Double-click to edit'
            : hint;
    })();
    const handleProjectClick = (event: MouseEvent<HTMLSpanElement>, projectId: string) => {
        event.stopPropagation();
        onOpenProject?.(projectId);
    };
    const handleProjectKeyDown = (event: KeyboardEvent<HTMLSpanElement>, projectId: string) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onOpenProject?.(projectId);
        }
    };
    const renderProjectBadge = () => {
        if (!project) return null;
        if (!onOpenProject) {
            return (
                <MetadataBadge
                    variant="project"
                    label={project.title}
                    dotColor={projectColor || '#94a3b8'}
                />
            );
        }
        return (
            <span
                role="button"
                tabIndex={0}
                onClick={(event) => handleProjectClick(event, project.id)}
                onKeyDown={(event) => handleProjectKeyDown(event, project.id)}
                className="inline-flex metadata-badge--interactive"
                aria-label={`${t('projects.title') || 'Project'}: ${project.title}`}
            >
                <MetadataBadge
                    variant="project"
                    label={project.title}
                    dotColor={projectColor || '#94a3b8'}
                />
            </span>
        );
    };

    const showQuickDoneButton = showQuickDone
        && !selectionMode
        && !readOnly
        && task.status !== 'done'
        && task.status !== 'archived';
    const overlayDragHandle = actionsOverlay && !!dragHandle;
    const overlayQuickDone = actionsOverlay && showQuickDoneButton;
    const inlineLeftControls = !actionsOverlay && (showQuickDoneButton || dragHandle);

    return (
        <div className={cn("flex-1 min-w-0 flex items-start gap-3", actionsOverlay && "relative")}>
            {overlayDragHandle && (
                <div
                    className="absolute left-0 top-2 flex items-center -translate-x-2"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {dragHandle}
                </div>
            )}
            {overlayQuickDone && (
                <div
                    className="absolute left-4 top-2 flex items-center"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onStatusChange('done');
                        }}
                        aria-label={t('status.done')}
                        className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-500/20"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                </div>
            )}
            <div className={cn("flex min-w-0 flex-1 items-start gap-2")}>
                {inlineLeftControls && (
                    <div
                        className={cn(
                            "flex items-center gap-1 mt-1 shrink-0",
                            actionsOverlay && dragHandle && "-ml-2"
                        )}
                    >
                        {dragHandle}
                        {showQuickDoneButton && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onStatusChange('done');
                                }}
                                aria-label={t('status.done')}
                                className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-500/20"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}
                <div
                    className={cn(
                        "group/content relative rounded -ml-2 pl-2 pr-1 py-1 transition-colors flex-1 min-w-0",
                        selectionMode ? "cursor-pointer hover:bg-muted/40" : "cursor-default",
                    )}
                >
                    {!selectionMode && !readOnly && (
                        <span
                            className={cn(
                                "pointer-events-none absolute right-2 top-1 text-[10px] text-muted-foreground/70 opacity-0 transition-opacity group-hover/content:opacity-100",
                                isRtl && "left-2 right-auto"
                            )}
                        >
                            {hoverHintText}
                        </span>
                    )}
                    <button
                        type="button"
                        data-task-edit-trigger
                        onClick={onEdit}
                        className="sr-only"
                        aria-label={t('common.edit')}
                        tabIndex={-1}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (selectionMode) {
                                onToggleSelect?.();
                                return;
                            }
                            onToggleView();
                        }}
                        onDoubleClick={() => {
                            if (!selectionMode && !readOnly) {
                                onEdit();
                            }
                        }}
                        className={cn(
                            "block w-full text-left rounded px-0.5 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                            selectionMode ? "cursor-pointer" : "cursor-default",
                            isRtl && "text-right"
                        )}
                        aria-expanded={isViewOpen}
                        aria-label={t('task.toggleDetails') || 'Toggle task details'}
                        dir={resolvedDirection}
                    >
                        <div
                            className={cn(
                                "font-medium truncate text-foreground group-hover/content:text-primary transition-colors",
                                dense ? "text-sm" : "text-base",
                                task.status === 'done' && "line-through text-muted-foreground",
                                actionsOverlay && "pr-20",
                                (overlayDragHandle || overlayQuickDone) && "pl-12"
                            )}
                        >
                            {task.title}
                        </div>
                        {task.description && (
                            <p
                                className={cn(
                                    "text-muted-foreground mt-1 w-full",
                                    dense ? "text-xs" : "text-sm",
                                    isRtl && "text-right"
                                )}
                                dir={resolvedDirection}
                            >
                                {stripMarkdown(task.description)}
                            </p>
                        )}
                        {showCompactMeta && (
                            <div
                                className={cn(
                                    "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
                                    dense ? "mt-0.5" : "mt-1",
                                    (overlayDragHandle || overlayQuickDone) && "pl-12"
                                )}
                            >
                                {renderProjectBadge()}
                                {!project && area && (
                                    <MetadataBadge
                                        variant="project"
                                        label={area.name}
                                        dotColor={area.color || '#94a3b8'}
                                    />
                                )}
                                {(task.contexts ?? []).slice(0, 3).map((ctx) => (
                                    <MetadataBadge key={ctx} variant="context" label={ctx} />
                                ))}
                                {(task.contexts?.length ?? 0) > 3 && (
                                    <span className="text-[10px] text-muted-foreground">+{(task.contexts?.length ?? 0) - 3}</span>
                                )}
                            </div>
                        )}
                    </button>

                    {isViewOpen && (
                        <div onClick={(e) => e.stopPropagation()}>
                            {visibleAttachments.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                                    <Paperclip className="w-3 h-3" />
                                    {visibleAttachments.map((attachment) => (
                                        <div key={attachment.id} className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    openAttachment(attachment);
                                                }}
                                                className="truncate hover:underline"
                                                title={attachment.title}
                                            >
                                                {attachment.title}
                                            </button>
                                            <AttachmentProgressIndicator attachmentId={attachment.id} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                                {renderProjectBadge()}
                                {!project && area && (
                                    <MetadataBadge
                                        variant="project"
                                        label={area.name}
                                        dotColor={area.color || '#94a3b8'}
                                    />
                                )}
                                {task.startTime && (
                                    <MetadataBadge
                                        variant="info"
                                        icon={ArrowRight}
                                        label={safeFormatDate(task.startTime, hasTimeComponent(task.startTime) ? 'MMM d, HH:mm' : 'MMM d')}
                                    />
                                )}
                                {task.dueDate && (
                                    <div className="flex items-center gap-2">
                                        <MetadataBadge
                                            variant="info"
                                            icon={CalendarIcon}
                                            label={safeFormatDate(task.dueDate, hasTimeComponent(task.dueDate) ? 'MMM d, HH:mm' : 'MMM d')}
                                            className={cn(getUrgencyColor(task), isStagnant && "text-muted-foreground/70")}
                                        />
                                        {isStagnant && (
                                            <MetadataBadge
                                                variant="age"
                                                icon={Hourglass}
                                                label={`${task.pushCount ?? 0}`}
                                            />
                                        )}
                                    </div>
                                )}
                                {task.location && (
                                    <MetadataBadge
                                        variant="info"
                                        icon={MapPin}
                                        label={task.location}
                                    />
                                )}
                                {recurrenceRule && (
                                    <MetadataBadge
                                        variant="info"
                                        icon={Repeat}
                                        label={`${t(`recurrence.${recurrenceRule}`)}${recurrenceStrategy === 'fluid' ? ` · ${t('recurrence.afterCompletionShort')}` : ''}`}
                                    />
                                )}
                                {prioritiesEnabled && task.priority && (
                                    <MetadataBadge
                                        variant="priority"
                                        label={t(`priority.${task.priority}`)}
                                    />
                                )}
                                {task.contexts?.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        {task.contexts.map((ctx) => (
                                            <MetadataBadge key={ctx} variant="context" label={ctx} />
                                        ))}
                                    </div>
                                )}
                                {task.tags.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        {task.tags.map((tag) => (
                                            <MetadataBadge key={tag} variant="tag" icon={Tag} label={tag} />
                                        ))}
                                    </div>
                                )}
                                {checklistProgress && (
                                    <div
                                        className="flex items-center gap-2 text-muted-foreground"
                                        title={t('checklist.progress')}
                                    >
                                        <span className="font-medium">
                                            {checklistProgress.completed}/{checklistProgress.total}
                                        </span>
                                        <div className="w-16 h-1 bg-muted rounded overflow-hidden">
                                            <div
                                                className="h-full bg-primary"
                                                style={{ width: `${Math.round(checklistProgress.percent * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {task.status !== 'done' && ageLabel && (
                                    <MetadataBadge
                                        variant="age"
                                        icon={Clock}
                                        label={ageLabel}
                                        className={cn(
                                            getTaskStaleness(task.createdAt) === 'fresh' && 'metadata-badge--age-fresh',
                                            getTaskStaleness(task.createdAt) === 'aging' && 'metadata-badge--age-aging',
                                            getTaskStaleness(task.createdAt) === 'stale' && 'metadata-badge--age-stale',
                                            getTaskStaleness(task.createdAt) === 'very-stale' && 'metadata-badge--age-very-stale'
                                        )}
                                    />
                                )}
                                {timeEstimatesEnabled && task.timeEstimate && (
                                    <MetadataBadge
                                        variant="estimate"
                                        icon={Timer}
                                        label={formatTimeEstimate(task.timeEstimate)}
                                    />
                                )}
                            </div>

                            {(task.checklist || []).length > 0 && (
                                <div
                                    className="mt-3 space-y-1 pl-1"
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    {(task.checklist || []).map((item, index) => (
                                        <button
                                            key={item.id || index}
                                            type="button"
                                            className={cn(
                                                "w-full flex items-center gap-2 text-left text-xs text-muted-foreground rounded px-1.5 py-1 hover:bg-muted/60 transition-colors",
                                                readOnly && "hover:bg-transparent cursor-default"
                                            )}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                if (readOnly) return;
                                                onToggleChecklistItem?.(index);
                                            }}
                                            aria-pressed={item.isCompleted}
                                            disabled={readOnly || !onToggleChecklistItem}
                                        >
                                            <span
                                                className={cn(
                                                    "w-3 h-3 border rounded flex items-center justify-center",
                                                    item.isCompleted
                                                        ? "bg-primary border-primary text-primary-foreground"
                                                        : "border-muted-foreground"
                                                )}
                                            >
                                                {item.isCompleted && <Check className="w-2 h-2" />}
                                            </span>
                                            <span className={cn(item.isCompleted && "line-through")}>{item.title}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {!selectionMode && (
                <div
                    className={cn(
                        "relative flex items-center gap-2",
                        actionsOverlay && "absolute top-1 right-1 z-10"
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {showProjectBadgeInActions && project && (
                        <div className="hidden md:flex items-center max-w-[180px]">
                            {renderProjectBadge()}
                        </div>
                    )}
                    {focusToggle && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                focusToggle.onToggle();
                            }}
                            disabled={!focusToggle.canToggle && !focusToggle.isFocused}
                            title={focusToggle.title}
                            aria-label={focusToggle.ariaLabel}
                            className={cn(
                                "p-1.5 rounded-full transition-colors",
                                focusToggle.isFocused
                                    ? "text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                                    : focusToggle.canToggle
                                        ? "text-muted-foreground hover:text-yellow-500 hover:bg-muted"
                                        : "text-muted-foreground/30 cursor-not-allowed"
                            )}
                        >
                            <Star className={cn("w-4 h-4", focusToggle.isFocused && "fill-current")} />
                        </button>
                    )}
                    {readOnly ? (
                        <>
                            <button
                                type="button"
                                onClick={onDuplicate}
                                aria-label={t('taskEdit.duplicateTask')}
                                title={t('taskEdit.duplicateTask')}
                                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onStatusChange('next')}
                                aria-label={t('waiting.moveToNext')}
                                title={t('waiting.moveToNext')}
                                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onDelete}
                                aria-label={t('task.aria.delete')}
                                className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/20"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            {task.status !== 'reference' && (
                                <button
                                    type="button"
                                    onClick={() => onStatusChange('reference')}
                                    aria-label={t('task.convertToReference')}
                                    title={t('task.convertToReference')}
                                    className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-500/10"
                                >
                                    <BookOpen className="w-4 h-4" />
                                </button>
                            )}
                            {showStatusSelect && (
                                <select
                                    value={task.status}
                                    aria-label={t('task.aria.status')}
                                    onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
                                    className="text-xs px-2 py-1 rounded cursor-pointer bg-muted/50 text-foreground border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="inbox">{t('status.inbox')}</option>
                                    <option value="next">{t('status.next')}</option>
                                    <option value="waiting">{t('status.waiting')}</option>
                                    <option value="someday">{t('status.someday')}</option>
                                    {task.status === 'reference' && (
                                        <option value="reference">{t('status.reference')}</option>
                                    )}
                                    <option value="done">{t('status.done')}</option>
                                </select>
                            )}
                            <button
                                onClick={onDelete}
                                aria-label={t('task.aria.delete')}
                                className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/20"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
