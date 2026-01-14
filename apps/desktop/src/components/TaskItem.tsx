import { useMemo, useState, memo, useEffect, useRef, useCallback } from 'react';
import {
    useTaskStore,
    generateUUID,
    Task,
    TaskStatus,
    TaskPriority,
    TimeEstimate,
    TaskEditorFieldId,
    type Recurrence,
    type RecurrenceRule,
    type RecurrenceStrategy,
    parseRRuleString,
    getStatusColor,
    Project,
    PRESET_CONTEXTS,
    PRESET_TAGS,
} from '@mindwtr/core';
import { cn } from '../lib/utils';
import { PromptModal } from './PromptModal';
import { useLanguage } from '../contexts/language-context';
import { TaskItemEditor } from './Task/TaskItemEditor';
import { TaskItemDisplay } from './Task/TaskItemDisplay';
import { TaskItemFieldRenderer } from './Task/TaskItemFieldRenderer';
import { TaskItemRecurrenceModal } from './Task/TaskItemRecurrenceModal';
import { AudioAttachmentModal } from './Task/AudioAttachmentModal';
import { ImageAttachmentModal } from './Task/ImageAttachmentModal';
import { TextAttachmentModal } from './Task/TextAttachmentModal';
import { WEEKDAY_FULL_LABELS, WEEKDAY_ORDER } from './Task/recurrence-constants';
import {
    DEFAULT_TASK_EDITOR_HIDDEN,
    DEFAULT_TASK_EDITOR_ORDER,
    getRecurrenceRRuleValue,
    getRecurrenceRuleValue,
    getRecurrenceStrategyValue,
    toDateTimeLocalValue,
} from './Task/task-item-helpers';
import { useTaskItemAttachments } from './Task/useTaskItemAttachments';
import { useTaskItemRecurrence } from './Task/useTaskItemRecurrence';
import { useTaskItemAi } from './Task/useTaskItemAi';

interface TaskItemProps {
    task: Task;
    project?: Project;
    isSelected?: boolean;
    onSelect?: () => void;
    selectionMode?: boolean;
    isMultiSelected?: boolean;
    onToggleSelect?: () => void;
    showQuickDone?: boolean;
    readOnly?: boolean;
    compactMetaEnabled?: boolean;
}

export const TaskItem = memo(function TaskItem({
    task,
    project: propProject,
    isSelected,
    onSelect,
    selectionMode = false,
    isMultiSelected = false,
    onToggleSelect,
    showQuickDone = false,
    readOnly = false,
    compactMetaEnabled = true,
}: TaskItemProps) {
    const { updateTask, deleteTask, moveTask, projects, tasks, areas, settings, duplicateTask, resetTaskChecklist, highlightTaskId, setHighlightTask, addProject } = useTaskStore();
    const { t } = useLanguage();
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(task.title);
    const [editDueDate, setEditDueDate] = useState(toDateTimeLocalValue(task.dueDate));
    const [editStartTime, setEditStartTime] = useState(toDateTimeLocalValue(task.startTime));
    const [editProjectId, setEditProjectId] = useState(task.projectId || '');
    const [editStatus, setEditStatus] = useState<TaskStatus>(task.status);
    const [editContexts, setEditContexts] = useState(task.contexts?.join(', ') || '');
    const [editTags, setEditTags] = useState(task.tags?.join(', ') || '');
    const [editDescription, setEditDescription] = useState(task.description || '');
    const [editTextDirection, setEditTextDirection] = useState(task.textDirection ?? 'auto');
    const [showDescriptionPreview, setShowDescriptionPreview] = useState(false);
    const [editLocation, setEditLocation] = useState(task.location || '');
    const [editRecurrence, setEditRecurrence] = useState<RecurrenceRule | ''>(getRecurrenceRuleValue(task.recurrence));
    const [editRecurrenceStrategy, setEditRecurrenceStrategy] = useState<RecurrenceStrategy>(getRecurrenceStrategyValue(task.recurrence));
    const [editRecurrenceRRule, setEditRecurrenceRRule] = useState<string>(getRecurrenceRRuleValue(task.recurrence));
    const [editTimeEstimate, setEditTimeEstimate] = useState<TimeEstimate | ''>(task.timeEstimate || '');
    const [editPriority, setEditPriority] = useState<TaskPriority | ''>(task.priority || '');
    const [editReviewAt, setEditReviewAt] = useState(toDateTimeLocalValue(task.reviewAt));
    const {
        editAttachments,
        attachmentError,
        showLinkPrompt,
        setShowLinkPrompt,
        addFileAttachment,
        addLinkAttachment,
        handleAddLinkAttachment,
        removeAttachment,
        openAttachment,
        resetAttachmentState,
        audioAttachment,
        audioSource,
        audioError,
        audioRef,
        openAudioExternally,
        handleAudioError,
        closeAudio,
        imageAttachment,
        imageSource,
        closeImage,
        textAttachment,
        textContent,
        textError,
        textLoading,
        openTextExternally,
        openImageExternally,
        closeText,
    } = useTaskItemAttachments({ task, t });
    const [isViewOpen, setIsViewOpen] = useState(false);
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const isHighlighted = highlightTaskId === task.id;
    const recurrenceRule = getRecurrenceRuleValue(task.recurrence);
    const recurrenceStrategy = getRecurrenceStrategyValue(task.recurrence);
    const isStagnant = (task.pushCount ?? 0) > 3;
    const effectiveReadOnly = readOnly || task.status === 'done';
    const {
        monthlyRecurrence,
        showCustomRecurrence,
        setShowCustomRecurrence,
        customInterval,
        setCustomInterval,
        customMode,
        setCustomMode,
        customOrdinal,
        setCustomOrdinal,
        customWeekday,
        setCustomWeekday,
        customMonthDay,
        setCustomMonthDay,
        openCustomRecurrence,
        applyCustomRecurrence,
    } = useTaskItemRecurrence({
        task,
        editDueDate,
        editRecurrence,
        editRecurrenceRRule,
        setEditRecurrence,
        setEditRecurrenceRRule,
    });

    const handleSetEditTextDirection = useCallback((value: Task['textDirection']) => {
        setEditTextDirection(value ?? 'auto');
    }, []);

    useEffect(() => {
        if (!isHighlighted) return;
        const timer = setTimeout(() => {
            setHighlightTask(null);
        }, 3500);
        return () => clearTimeout(timer);
    }, [isHighlighted, setHighlightTask]);

    const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

    const projectContext = useMemo(() => {
        const projectId = editProjectId || task.projectId;
        if (!projectId) return null;
        const project = projectById.get(projectId);
        const projectTasks = tasks
            .filter((t) => t.projectId === projectId && t.id !== task.id && !t.deletedAt)
            .map((t) => `${t.title}${t.status ? ` (${t.status})` : ''}`)
            .filter(Boolean)
            .slice(0, 20);
        return {
            projectTitle: project?.title || '',
            projectTasks,
        };
    }, [editProjectId, projectById, task.id, task.projectId, tasks]);

    const tagOptions = useMemo(() => {
        const taskTags = tasks.flatMap((t) => t.tags || []);
        return Array.from(new Set([...PRESET_TAGS, ...taskTags])).filter(Boolean);
    }, [tasks]);

    const {
        aiEnabled,
        isAIWorking,
        aiClarifyResponse,
        aiError,
        aiBreakdownSteps,
        copilotSuggestion,
        copilotApplied,
        copilotContext,
        copilotEstimate,
        resetCopilotDraft,
        resetAiState,
        clearAiBreakdown,
        clearAiClarify,
        applyCopilotSuggestion,
        applyAISuggestion,
        handleAIClarify,
        handleAIBreakdown,
    } = useTaskItemAi({
        taskId: task.id,
        settings,
        t,
        editTitle,
        editDescription,
        editContexts,
        editTags,
        tagOptions,
        projectContext,
        timeEstimatesEnabled,
        setEditTitle,
        setEditContexts,
        setEditTags,
        setEditTimeEstimate,
    });

    const popularTagOptions = useMemo(() => {
        const counts = new Map<string, number>();
        tasks.forEach((t) => {
            t.tags?.forEach((tag) => {
                counts.set(tag, (counts.get(tag) || 0) + 1);
            });
        });
        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([tag]) => tag);
        return Array.from(new Set([...sorted, ...PRESET_TAGS])).slice(0, 8);
    }, [tasks]);
    const allContexts = useMemo(() => {
        const taskContexts = tasks.flatMap((t) => t.contexts || []);
        return Array.from(new Set([...PRESET_CONTEXTS, ...taskContexts])).sort();
    }, [tasks]);
    const DEFAULT_PROJECT_COLOR = '#94a3b8';
    const handleCreateProject = useCallback(async (title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return null;
        const existing = projects.find((project) => project.title.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const created = await addProject(trimmed, DEFAULT_PROJECT_COLOR);
        return created.id;
    }, [addProject, projects]);
    const visibleAttachments = (task.attachments || []).filter((a) => !a.deletedAt);
    const visibleEditAttachments = editAttachments.filter((a) => !a.deletedAt);
    const wasEditingRef = useRef(false);

    const savedOrder = settings?.gtd?.taskEditor?.order ?? [];
    const savedHidden = settings?.gtd?.taskEditor?.hidden ?? DEFAULT_TASK_EDITOR_HIDDEN;
    const disabledFields = useMemo(() => {
        const disabled = new Set<TaskEditorFieldId>();
        if (!prioritiesEnabled) disabled.add('priority');
        if (!timeEstimatesEnabled) disabled.add('timeEstimate');
        return disabled;
    }, [prioritiesEnabled, timeEstimatesEnabled]);

    const taskEditorOrder = useMemo(() => {
        const known = new Set(DEFAULT_TASK_EDITOR_ORDER);
        const normalized = savedOrder.filter((id) => known.has(id));
        const missing = DEFAULT_TASK_EDITOR_ORDER.filter((id) => !normalized.includes(id));
        return [...normalized, ...missing].filter((id) => !disabledFields.has(id));
    }, [savedOrder, disabledFields]);
    const hiddenSet = useMemo(() => {
        const known = new Set(taskEditorOrder);
        const next = new Set(savedHidden.filter((id) => known.has(id)));
        if (settings?.features?.priorities === false) next.add('priority');
        if (settings?.features?.timeEstimates === false) next.add('timeEstimate');
        return next;
    }, [savedHidden, settings?.features?.priorities, settings?.features?.timeEstimates, taskEditorOrder]);

    const hasValue = useCallback((fieldId: TaskEditorFieldId) => {
        switch (fieldId) {
            case 'status':
                return task.status !== 'inbox';
            case 'project':
                return Boolean(editProjectId || task.projectId);
            case 'priority':
                if (!prioritiesEnabled) return false;
                return Boolean(editPriority);
            case 'contexts':
                return Boolean(editContexts.trim());
            case 'description':
                return Boolean(editDescription.trim());
            case 'textDirection':
                return editTextDirection !== undefined && editTextDirection !== 'auto';
            case 'tags':
                return Boolean(editTags.trim());
            case 'timeEstimate':
                if (!timeEstimatesEnabled) return false;
                return Boolean(editTimeEstimate);
            case 'recurrence':
                return Boolean(editRecurrence);
            case 'startTime':
                return Boolean(editStartTime);
            case 'dueDate':
                return Boolean(editDueDate);
            case 'reviewAt':
                return Boolean(editReviewAt);
            case 'attachments':
                return visibleEditAttachments.length > 0;
            case 'checklist':
                return (task.checklist || []).length > 0;
            default:
                return false;
        }
    }, [
        editContexts,
        editDescription,
        editTextDirection,
        editDueDate,
        editPriority,
        editRecurrence,
        editReviewAt,
        editStartTime,
        editTags,
        editTimeEstimate,
        prioritiesEnabled,
        task.checklist,
        task.status,
        timeEstimatesEnabled,
        visibleEditAttachments.length,
    ]);

    const isFieldVisible = useCallback(
        (fieldId: TaskEditorFieldId) => !hiddenSet.has(fieldId) || hasValue(fieldId),
        [hasValue, hiddenSet]
    );
    const showProjectField = isFieldVisible('project');
    const showDueDate = isFieldVisible('dueDate');
    const orderFields = useCallback(
        (fields: TaskEditorFieldId[]) => {
            const ordered = taskEditorOrder.filter((id) => fields.includes(id));
            const missing = fields.filter((id) => !ordered.includes(id));
            return [...ordered, ...missing];
        },
        [taskEditorOrder]
    );
    const filterVisibleFields = useCallback(
        (fields: TaskEditorFieldId[]) => fields.filter((fieldId) => !hiddenSet.has(fieldId) || hasValue(fieldId)),
        [hiddenSet, hasValue]
    );
    const alwaysFields = useMemo(
        () => orderFields(['status']).filter(isFieldVisible),
        [orderFields, isFieldVisible]
    );
    const schedulingFields = useMemo(
        () => filterVisibleFields(orderFields(['startTime', 'recurrence', 'reviewAt'])),
        [filterVisibleFields, orderFields]
    );
    const organizationFields = useMemo(
        () => filterVisibleFields(orderFields(['contexts', 'tags', 'priority', 'timeEstimate'])),
        [filterVisibleFields, orderFields]
    );
    const detailsFields = useMemo(
        () => filterVisibleFields(orderFields(['description', 'textDirection', 'attachments', 'checklist'])),
        [filterVisibleFields, orderFields]
    );
    const sectionCounts = useMemo(
        () => ({
            scheduling: schedulingFields.filter((fieldId) => hasValue(fieldId)).length,
            organization: organizationFields.filter((fieldId) => hasValue(fieldId)).length,
            details: detailsFields.filter((fieldId) => hasValue(fieldId)).length,
        }),
        [detailsFields, hasValue, organizationFields, schedulingFields]
    );

    const renderField = (fieldId: TaskEditorFieldId) => (
        <TaskItemFieldRenderer
            fieldId={fieldId}
            data={{
                t,
                task,
                taskId: task.id,
                showDescriptionPreview,
                editDescription,
                attachmentError,
                visibleEditAttachments,
                editStartTime,
                editReviewAt,
                editStatus,
                editPriority,
                editRecurrence,
                editRecurrenceStrategy,
                editRecurrenceRRule,
                monthlyRecurrence,
                editTimeEstimate,
                editContexts,
                editTags,
                editTextDirection,
                popularTagOptions,
            }}
            handlers={{
                toggleDescriptionPreview: () => setShowDescriptionPreview((prev) => !prev),
                setEditDescription: (value) => {
                    setEditDescription(value);
                    resetCopilotDraft();
                },
                addFileAttachment,
                addLinkAttachment,
                openAttachment,
                removeAttachment,
                setEditStartTime,
                setEditReviewAt,
                setEditStatus,
                setEditPriority,
                setEditRecurrence,
                setEditRecurrenceStrategy,
                setEditRecurrenceRRule,
                openCustomRecurrence,
                setEditTimeEstimate,
                setEditContexts,
                setEditTags,
                setEditTextDirection: handleSetEditTextDirection,
                updateTask,
                resetTaskChecklist,
            }}
        />
    );

    useEffect(() => {
        if (effectiveReadOnly && isEditing) {
            setIsEditing(false);
            return;
        }
        if (!isEditing) {
            wasEditingRef.current = false;
            return;
        }
        wasEditingRef.current = true;
    }, [effectiveReadOnly, isEditing]);

    useEffect(() => {
        if (isEditing) {
            setIsViewOpen(false);
        }
    }, [isEditing]);

    const resetEditState = () => {
        setEditTitle(task.title);
        setEditDueDate(toDateTimeLocalValue(task.dueDate));
        setEditStartTime(toDateTimeLocalValue(task.startTime));
        setEditProjectId(task.projectId || '');
        setEditStatus(task.status);
        setEditContexts(task.contexts?.join(', ') || '');
        setEditTags(task.tags?.join(', ') || '');
        setEditDescription(task.description || '');
        setEditTextDirection(task.textDirection ?? 'auto');
        setEditLocation(task.location || '');
        setEditRecurrence(getRecurrenceRuleValue(task.recurrence));
        setEditRecurrenceStrategy(getRecurrenceStrategyValue(task.recurrence));
        setEditRecurrenceRRule(getRecurrenceRRuleValue(task.recurrence));
        setShowCustomRecurrence(false);
        setEditTimeEstimate(task.timeEstimate || '');
        setEditPriority(task.priority || '');
        setEditReviewAt(toDateTimeLocalValue(task.reviewAt));
        resetAttachmentState(task.attachments);
        setShowDescriptionPreview(false);
        resetAiState();
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editTitle.trim()) {
            const recurrenceValue: Recurrence | undefined = editRecurrence
                ? { rule: editRecurrence, strategy: editRecurrenceStrategy }
                : undefined;
            if (recurrenceValue && editRecurrenceRRule) {
                const parsed = parseRRuleString(editRecurrenceRRule);
                if (parsed.byDay && parsed.byDay.length > 0) {
                    recurrenceValue.byDay = parsed.byDay;
                }
                recurrenceValue.rrule = editRecurrenceRRule;
            }
            const nextTextDirection = editTextDirection === 'auto' ? undefined : editTextDirection;
            updateTask(task.id, {
                title: editTitle,
                status: editStatus,
                dueDate: editDueDate || undefined,
                startTime: editStartTime || undefined,
                projectId: editProjectId || undefined,
                contexts: editContexts.split(',').map(c => c.trim()).filter(Boolean),
                tags: editTags.split(',').map(c => c.trim()).filter(Boolean),
                description: editDescription || undefined,
                textDirection: nextTextDirection,
                location: editLocation || undefined,
                recurrence: recurrenceValue,
                timeEstimate: editTimeEstimate || undefined,
                priority: editPriority || undefined,
                reviewAt: editReviewAt || undefined,
                attachments: editAttachments.length > 0 ? editAttachments : undefined,
            });
            setIsEditing(false);
        }
    };

    const project = propProject || (task.projectId ? projectById.get(task.projectId) : undefined);
    const projectColor = project?.areaId ? areaById.get(project.areaId)?.color : undefined;
    const selectAriaLabel = (() => {
        const label = t('task.select');
        return label === 'task.select' ? 'Select task' : label;
    })();

    return (
        <>
            <div
                data-task-id={task.id}
                onClickCapture={onSelect ? () => onSelect?.() : undefined}
                className={cn(
                    "group bg-card border border-border rounded-lg p-4 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 border-l-4",
                    isSelected && "ring-2 ring-primary/40",
                    isHighlighted && "ring-2 ring-primary/70 border-primary/40"
                )}
                style={{ borderLeftColor: getStatusColor(task.status).border }}
            >
                <div className="flex items-start gap-3">
                    {selectionMode && (
                        <input
                            type="checkbox"
                            aria-label={selectAriaLabel}
                            checked={isMultiSelected}
                            onChange={() => onToggleSelect?.()}
                            className="mt-1.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                    )}

                    {isEditing ? (
                        <div className="flex-1 min-w-0">
                            <TaskItemEditor
                                t={t}
                                editTitle={editTitle}
                                setEditTitle={setEditTitle}
                                resetCopilotDraft={resetCopilotDraft}
                                aiEnabled={aiEnabled}
                                isAIWorking={isAIWorking}
                                handleAIClarify={handleAIClarify}
                                handleAIBreakdown={handleAIBreakdown}
                                copilotSuggestion={copilotSuggestion}
                                copilotApplied={copilotApplied}
                                applyCopilotSuggestion={applyCopilotSuggestion}
                                copilotContext={copilotContext}
                                copilotEstimate={copilotEstimate}
                                copilotTags={copilotSuggestion?.tags ?? []}
                                timeEstimatesEnabled={timeEstimatesEnabled}
                                aiError={aiError}
                                aiBreakdownSteps={aiBreakdownSteps}
                                onAddBreakdownSteps={() => {
                                    if (!aiBreakdownSteps?.length) return;
                                    const newItems = aiBreakdownSteps.map((step) => ({
                                        id: generateUUID(),
                                        title: step,
                                        isCompleted: false,
                                    }));
                                    updateTask(task.id, { checklist: [...(task.checklist || []), ...newItems] });
                                    clearAiBreakdown();
                                }}
                                onDismissBreakdown={clearAiBreakdown}
                                aiClarifyResponse={aiClarifyResponse}
                                onSelectClarifyOption={(action) => {
                                    setEditTitle(action);
                                    clearAiClarify();
                                }}
                                onApplyAISuggestion={() => {
                                    if (aiClarifyResponse?.suggestedAction) {
                                        applyAISuggestion(aiClarifyResponse.suggestedAction);
                                    }
                                }}
                                onDismissClarify={clearAiClarify}
                                projects={projects}
                                editProjectId={editProjectId}
                                setEditProjectId={setEditProjectId}
                                onCreateProject={handleCreateProject}
                                showProjectField={showProjectField}
                                showDueDate={showDueDate}
                                editDueDate={editDueDate}
                                setEditDueDate={setEditDueDate}
                                alwaysFields={alwaysFields}
                                schedulingFields={schedulingFields}
                                organizationFields={organizationFields}
                                detailsFields={detailsFields}
                                sectionCounts={sectionCounts}
                                renderField={renderField}
                                editLocation={editLocation}
                                setEditLocation={setEditLocation}
                                editTextDirection={editTextDirection}
                                inputContexts={allContexts}
                                onDuplicateTask={() => duplicateTask(task.id, false)}
                                onCancel={() => {
                                    resetEditState();
                                    setIsEditing(false);
                                }}
                                onSubmit={handleSubmit}
                            />
                        </div>
                    ) : (
            <TaskItemDisplay
                task={task}
                project={project}
                projectColor={projectColor}
                selectionMode={selectionMode}
                isViewOpen={isViewOpen}
                            onToggleSelect={onToggleSelect}
                            onToggleView={() => setIsViewOpen((prev) => !prev)}
                            onEdit={() => {
                                if (effectiveReadOnly) return;
                                resetEditState();
                                setIsViewOpen(false);
                                setIsEditing(true);
                            }}
                            onDelete={() => deleteTask(task.id)}
                            onDuplicate={() => duplicateTask(task.id, false)}
                            onStatusChange={(status) => moveTask(task.id, status)}
                            openAttachment={openAttachment}
                            visibleAttachments={visibleAttachments}
                            recurrenceRule={recurrenceRule}
                            recurrenceStrategy={recurrenceStrategy}
                prioritiesEnabled={prioritiesEnabled}
                timeEstimatesEnabled={timeEstimatesEnabled}
                isStagnant={isStagnant}
                showQuickDone={showQuickDone}
                readOnly={effectiveReadOnly}
                compactMetaEnabled={compactMetaEnabled}
                t={t}
            />
                    )}
                </div>
            </div>
            {showCustomRecurrence && (
                <TaskItemRecurrenceModal
                    t={t}
                    weekdayOrder={WEEKDAY_ORDER}
                    weekdayLabels={WEEKDAY_FULL_LABELS}
                customInterval={customInterval}
                customMode={customMode}
                customOrdinal={customOrdinal}
                customWeekday={customWeekday}
                customMonthDay={customMonthDay}
                onIntervalChange={(value) => setCustomInterval(value)}
                onModeChange={(value) => setCustomMode(value)}
                onOrdinalChange={(value) => setCustomOrdinal(value)}
                onWeekdayChange={(value) => setCustomWeekday(value)}
                onMonthDayChange={(value) => {
                    const safe = Number.isFinite(value) ? Math.min(Math.max(value, 1), 31) : 1;
                    setCustomMonthDay(safe);
                }}
                onClose={() => setShowCustomRecurrence(false)}
                onApply={applyCustomRecurrence}
            />
        )}
        <PromptModal
            isOpen={showLinkPrompt}
            title={t('attachments.addLink')}
            description={t('attachments.linkPlaceholder')}
            placeholder={t('attachments.linkPlaceholder')}
            defaultValue=""
            confirmLabel={t('common.save')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setShowLinkPrompt(false)}
            onConfirm={(value) => {
                            const added = handleAddLinkAttachment(value);
                            if (!added) return;
                            setShowLinkPrompt(false);
                        }}
                    />
        <AudioAttachmentModal
            attachment={audioAttachment}
            audioSource={audioSource}
            audioRef={audioRef}
            audioError={audioError}
            onClose={closeAudio}
            onAudioError={handleAudioError}
            onOpenExternally={openAudioExternally}
            t={t}
        />
        <ImageAttachmentModal
            attachment={imageAttachment}
            imageSource={imageSource}
            onClose={closeImage}
            onOpenExternally={openImageExternally}
            t={t}
        />
        <TextAttachmentModal
            attachment={textAttachment}
            textContent={textContent}
            textLoading={textLoading}
            textError={textError}
            onClose={closeText}
            onOpenExternally={openTextExternally}
            t={t}
        />
        </>
    );
});
