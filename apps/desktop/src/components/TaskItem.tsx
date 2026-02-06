import { useMemo, useState, memo, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
    shallow,
    useTaskStore,
    Task,
    TaskEditorFieldId,
    type Recurrence,
    parseRRuleString,
    getStatusColor,
    Project,
    Section,
    PRESET_CONTEXTS,
    PRESET_TAGS,
    parseQuickAdd,
    extractChecklistFromMarkdown,
} from '@mindwtr/core';
import { cn } from '../lib/utils';
import { PromptModal } from './PromptModal';
import { ConfirmModal } from './ConfirmModal';
import { useLanguage } from '../contexts/language-context';
import { TaskItemEditor } from './Task/TaskItemEditor';
import { TaskItemDisplay } from './Task/TaskItemDisplay';
import { TaskItemFieldRenderer } from './Task/TaskItemFieldRenderer';
import { TaskItemRecurrenceModal } from './Task/TaskItemRecurrenceModal';
import { AttachmentModals } from './Task/AttachmentModals';
import { WEEKDAY_FULL_LABELS, WEEKDAY_ORDER } from './Task/recurrence-constants';
import {
    DEFAULT_TASK_EDITOR_HIDDEN,
    DEFAULT_TASK_EDITOR_ORDER,
    getRecurrenceRuleValue,
    getRecurrenceRRuleValue,
    getRecurrenceStrategyValue,
    toDateTimeLocalValue,
} from './Task/task-item-helpers';
import { useTaskItemAttachments } from './Task/useTaskItemAttachments';
import { useTaskItemRecurrence } from './Task/useTaskItemRecurrence';
import { useTaskItemAi } from './Task/useTaskItemAi';
import { useTaskItemEditState } from './Task/useTaskItemEditState';
import { useUiStore } from '../store/ui-store';
import { logError } from '../lib/app-log';
import { mergeMarkdownChecklist } from './Task/task-item-checklist';

interface TaskItemProps {
    task: Task;
    project?: Project;
    isSelected?: boolean;
    onSelect?: () => void;
    selectionMode?: boolean;
    isMultiSelected?: boolean;
    onToggleSelect?: () => void;
    showQuickDone?: boolean;
    showStatusSelect?: boolean;
    showProjectBadgeInActions?: boolean;
    actionsOverlay?: boolean;
    dragHandle?: ReactNode;
    focusToggle?: {
        isFocused: boolean;
        canToggle: boolean;
        onToggle: () => void;
        title: string;
        ariaLabel: string;
    };
    readOnly?: boolean;
    compactMetaEnabled?: boolean;
    enableDoubleClickEdit?: boolean;
    showHoverHint?: boolean;
}

export const TaskItem = memo(function TaskItem({
    task,
    project: propProject,
    isSelected,
    onSelect,
    selectionMode = false,
    isMultiSelected = false,
    onToggleSelect,
    showQuickDone = true,
    showStatusSelect = true,
    showProjectBadgeInActions = true,
    actionsOverlay = false,
    dragHandle,
    focusToggle,
    readOnly = false,
    compactMetaEnabled = true,
    enableDoubleClickEdit = false,
    showHoverHint = true,
}: TaskItemProps) {
    const {
        updateTask,
        deleteTask,
        moveTask,
        projects,
        sections,
        areas,
        settings,
        duplicateTask,
        resetTaskChecklist,
        highlightTaskId,
        setHighlightTask,
        addProject,
        addArea,
        addSection,
        lockEditing,
        unlockEditing,
    } = useTaskStore(
        (state) => ({
            updateTask: state.updateTask,
            deleteTask: state.deleteTask,
            moveTask: state.moveTask,
            projects: state.projects,
            sections: state.sections,
            areas: state.areas,
            settings: state.settings,
            duplicateTask: state.duplicateTask,
            resetTaskChecklist: state.resetTaskChecklist,
            highlightTaskId: state.highlightTaskId,
            setHighlightTask: state.setHighlightTask,
            addProject: state.addProject,
            addArea: state.addArea,
            addSection: state.addSection,
            lockEditing: state.lockEditing,
            unlockEditing: state.unlockEditing,
        }),
        shallow
    );
    const {
        setSelectedProjectId,
        editingTaskId,
        setEditingTaskId,
    } = useUiStore((state) => ({
        setSelectedProjectId: (value: string | null) => state.setProjectView({ selectedProjectId: value }),
        editingTaskId: state.editingTaskId,
        setEditingTaskId: state.setEditingTaskId,
    }));
    const { t } = useLanguage();
    const [isEditing, setIsEditing] = useState(false);
    const [autoFocusTitle, setAutoFocusTitle] = useState(false);
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
    const {
        editTitle,
        setEditTitle,
        editDueDate,
        setEditDueDate,
        editStartTime,
        setEditStartTime,
        editProjectId,
        setEditProjectId,
        editSectionId,
        setEditSectionId,
        editAreaId,
        setEditAreaId,
        editStatus,
        setEditStatus,
        editContexts,
        setEditContexts,
        editTags,
        setEditTags,
        editDescription,
        setEditDescription,
        editTextDirection,
        setEditTextDirection,
        editLocation,
        setEditLocation,
        editRecurrence,
        setEditRecurrence,
        editRecurrenceStrategy,
        setEditRecurrenceStrategy,
        editRecurrenceRRule,
        setEditRecurrenceRRule,
        editTimeEstimate,
        setEditTimeEstimate,
        editPriority,
        setEditPriority,
        editReviewAt,
        setEditReviewAt,
        showDescriptionPreview,
        setShowDescriptionPreview,
        resetEditState: resetLocalEditState,
    } = useTaskItemEditState({
        task,
        resetAttachmentState,
    });
    const editTextDirectionRef = useRef<Task['textDirection']>(editTextDirection);
    useEffect(() => {
        editTextDirectionRef.current = editTextDirection;
    }, [editTextDirection]);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const isCompact = settings?.appearance?.density === 'compact';
    const isHighlighted = highlightTaskId === task.id;
    const recurrenceRule = getRecurrenceRuleValue(task.recurrence);
    const recurrenceStrategy = getRecurrenceStrategyValue(task.recurrence);
    const isStagnant = (task.pushCount ?? 0) > 3;
    const effectiveReadOnly = readOnly || task.status === 'done';
    const handleToggleChecklistItem = useCallback((index: number) => {
        if (effectiveReadOnly) return;
        const checklist = task.checklist || [];
        if (!checklist[index]) return;
        const nextChecklist = checklist.map((item, i) =>
            i === index ? { ...item, isCompleted: !item.isCompleted } : item
        );
        void updateTask(task.id, { checklist: nextChecklist });
    }, [effectiveReadOnly, task, updateTask]);
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
        const nextValue = value ?? 'auto';
        editTextDirectionRef.current = nextValue;
        setEditTextDirection(nextValue);
    }, [setEditTextDirection]);

    useEffect(() => {
        if (!isHighlighted) return;
        const timer = setTimeout(() => {
            setHighlightTask(null);
        }, 3500);
        return () => clearTimeout(timer);
    }, [isHighlighted, setHighlightTask]);

    const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const sectionsByProject = useMemo(() => {
        const map = new Map<string, Section[]>();
        sections.forEach((section) => {
            if (section.deletedAt) return;
            const list = map.get(section.projectId) ?? [];
            list.push(section);
            map.set(section.projectId, list);
        });
        map.forEach((list, key) => {
            list.sort((a, b) => {
                const aOrder = Number.isFinite(a.order) ? a.order : 0;
                const bOrder = Number.isFinite(b.order) ? b.order : 0;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.title.localeCompare(b.title);
            });
            map.set(key, list);
        });
        return map;
    }, [sections]);
    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

    const [projectContext, setProjectContext] = useState<{ projectTitle: string; projectTasks: string[] } | null>(null);
    const [tagOptions, setTagOptions] = useState<string[]>(Array.from(PRESET_TAGS));
    const [popularTagOptions, setPopularTagOptions] = useState<string[]>(Array.from(PRESET_TAGS).slice(0, 8));
    const [allContexts, setAllContexts] = useState<string[]>(Array.from(PRESET_CONTEXTS).sort());

    useEffect(() => {
        if (!isEditing) return;
        if (editProjectId) {
            setEditAreaId('');
        }
        const { tasks: storeTasks, projects: storeProjects } = useTaskStore.getState();
        const projectId = editProjectId || task.projectId;
        const project = propProject || (projectId ? storeProjects.find((item) => item.id === projectId) : undefined);
        if (projectId) {
            const projectTasks = storeTasks
                .filter((t) => t.projectId === projectId && t.id !== task.id && !t.deletedAt)
                .map((t) => `${t.title}${t.status ? ` (${t.status})` : ''}`)
                .filter(Boolean)
                .slice(0, 20);
            setProjectContext({
                projectTitle: project?.title || '',
                projectTasks,
            });
        } else {
            setProjectContext(null);
        }

        const tagCounts = new Map<string, number>();
        const tags = new Set<string>(PRESET_TAGS);
        const contexts = new Set<string>(PRESET_CONTEXTS);
        storeTasks.forEach((t) => {
            t.tags?.forEach((tag) => {
                tags.add(tag);
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            });
            t.contexts?.forEach((ctx) => contexts.add(ctx));
        });
        setTagOptions(Array.from(tags).filter(Boolean));

        const sortedTags = Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([tag]) => tag);
        setPopularTagOptions(Array.from(new Set([...sortedTags, ...PRESET_TAGS])).slice(0, 8));
        setAllContexts(Array.from(contexts).sort());
    }, [editProjectId, isEditing, propProject, setEditAreaId, task.id, task.projectId]);

    useEffect(() => {
        const projectId = editProjectId || task.projectId || '';
        if (!projectId) {
            if (editSectionId) setEditSectionId('');
            return;
        }
        const projectSections = sectionsByProject.get(projectId) ?? [];
        if (editSectionId && !projectSections.some((section) => section.id === editSectionId)) {
            setEditSectionId('');
        }
    }, [editProjectId, editSectionId, sectionsByProject, setEditSectionId, task.projectId]);

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

    const resetEditState = useCallback(() => {
        resetLocalEditState();
        setShowCustomRecurrence(false);
        resetAiState();
    }, [resetLocalEditState, resetAiState, setShowCustomRecurrence]);
    const startEditing = useCallback(() => {
        if (effectiveReadOnly || isEditing) return;
        resetEditState();
        setIsViewOpen(false);
        setAutoFocusTitle(true);
        setIsEditing(true);
        setEditingTaskId(task.id);
    }, [effectiveReadOnly, isEditing, resetEditState, setEditingTaskId, task.id]);

    const DEFAULT_PROJECT_COLOR = '#94a3b8';
    const handleCreateProject = useCallback(async (title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return null;
        const existing = projects.find((project) => project.title.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const created = await addProject(trimmed, DEFAULT_PROJECT_COLOR);
        return created?.id ?? null;
    }, [addProject, projects]);
    const handleCreateArea = useCallback(async (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const existing = areas.find((area) => area.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const created = await addArea(trimmed, { color: DEFAULT_PROJECT_COLOR });
        return created?.id ?? null;
    }, [addArea, areas]);
    const handleCreateSection = useCallback(async (title: string) => {
        const trimmed = title.trim();
        if (!trimmed) return null;
        const projectId = editProjectId || task.projectId;
        if (!projectId) return null;
        const existing = (sectionsByProject.get(projectId) ?? [])
            .find((section) => section.title.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        const created = await addSection(projectId, trimmed);
        return created?.id ?? null;
    }, [addSection, editProjectId, sectionsByProject, task.projectId]);
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
    const isReference = editStatus === 'reference';
    const referenceHiddenFields = useMemo(() => new Set<TaskEditorFieldId>([
        'startTime',
        'dueDate',
        'reviewAt',
        'recurrence',
        'priority',
        'timeEstimate',
        'checklist',
    ]), []);

    const hasValue = useCallback((fieldId: TaskEditorFieldId) => {
        switch (fieldId) {
            case 'status':
                return task.status !== 'inbox';
            case 'project':
                return Boolean(editProjectId || task.projectId);
            case 'section':
                return Boolean(editSectionId || task.sectionId);
            case 'area':
                return Boolean(editAreaId || task.areaId);
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
        editSectionId,
        editStartTime,
        editTags,
        editTimeEstimate,
        prioritiesEnabled,
        task.checklist,
        task.status,
        task.sectionId,
        timeEstimatesEnabled,
        visibleEditAttachments.length,
        editAreaId,
        task.areaId,
    ]);

    const isFieldVisible = useCallback(
        (fieldId: TaskEditorFieldId) => {
            if (isReference && referenceHiddenFields.has(fieldId)) return false;
            return !hiddenSet.has(fieldId) || hasValue(fieldId);
        },
        [hasValue, hiddenSet, isReference, referenceHiddenFields]
    );
    const showProjectField = isFieldVisible('project');
    const showAreaField = isFieldVisible('area') && !editProjectId;
    const showSectionField = isFieldVisible('section') && !!editProjectId;
    const showDueDate = isFieldVisible('dueDate');
    const activeProjectId = editProjectId || task.projectId || '';
    const projectSections = activeProjectId ? (sectionsByProject.get(activeProjectId) ?? []) : [];
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
            if (editingTaskId === task.id) {
                setEditingTaskId(null);
            }
            return;
        }
        if (!isEditing) {
            wasEditingRef.current = false;
            return;
        }
        wasEditingRef.current = true;
    }, [effectiveReadOnly, isEditing, editingTaskId, setEditingTaskId, task.id]);

    useEffect(() => {
        if (!isEditing) return;
        if (editingTaskId !== task.id) {
            setIsEditing(false);
        }
    }, [editingTaskId, isEditing, task.id]);

    useEffect(() => {
        if (isEditing) return;
        if (editingTaskId === task.id && !effectiveReadOnly) {
            setIsViewOpen(false);
            setIsEditing(true);
        }
    }, [editingTaskId, effectiveReadOnly, isEditing, task.id]);

    useEffect(() => {
        if (!isEditing) return;
        if (!autoFocusTitle) return;
        const raf = requestAnimationFrame(() => setAutoFocusTitle(false));
        return () => cancelAnimationFrame(raf);
    }, [autoFocusTitle, isEditing]);

    useEffect(() => {
        if (isEditing) {
            setIsViewOpen(false);
        }
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) return;
        lockEditing();
        return () => {
            unlockEditing();
        };
    }, [isEditing, lockEditing, unlockEditing]);


    const handleDiscardChanges = useCallback(() => {
        resetEditState();
        setIsEditing(false);
        if (editingTaskId === task.id) {
            setEditingTaskId(null);
        }
    }, [editingTaskId, resetEditState, setEditingTaskId, task.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { title: parsedTitle, props: parsedProps, projectTitle } = parseQuickAdd(editTitle, projects, new Date(), areas);
        const cleanedTitle = parsedTitle.trim() ? parsedTitle : task.title;
        if (!cleanedTitle.trim()) return;

        const hasProjectCommand = Boolean(parsedProps.projectId || projectTitle);
        let resolvedProjectId = parsedProps.projectId || undefined;
        if (!resolvedProjectId && projectTitle) {
            try {
                const created = await addProject(projectTitle, DEFAULT_PROJECT_COLOR);
                resolvedProjectId = created?.id;
            } catch (error) {
                void logError(error, { scope: 'task', step: 'quickAddProject' });
            }
        }
        if (!resolvedProjectId) {
            resolvedProjectId = editProjectId || undefined;
        }
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
        const resolvedTextDirection = editTextDirectionRef.current ?? 'auto';
        const nextTextDirection = resolvedTextDirection;
        const currentContexts = editContexts.split(',').map(c => c.trim()).filter(Boolean);
        const mergedContexts = Array.from(new Set([...currentContexts, ...(parsedProps.contexts || [])]));
        const currentTags = editTags.split(',').map(c => c.trim()).filter(Boolean);
        const mergedTags = Array.from(new Set([...currentTags, ...(parsedProps.tags || [])]));
        const resolvedDescription = parsedProps.description
            ? (editDescription ? `${editDescription}\n${parsedProps.description}` : parsedProps.description)
            : (editDescription || undefined);
        const markdownChecklist = extractChecklistFromMarkdown(String(resolvedDescription ?? ''));
        const resolvedChecklist = markdownChecklist.length > 0
            ? mergeMarkdownChecklist(markdownChecklist, task.checklist)
            : undefined;
        const projectChangedByCommand = hasProjectCommand && resolvedProjectId !== (editProjectId || undefined);
        const resolvedSectionId = projectChangedByCommand
            ? undefined
            : (resolvedProjectId ? (editSectionId || undefined) : undefined);
        const resolvedAreaId = projectChangedByCommand
            ? undefined
            : (resolvedProjectId ? undefined : (editAreaId || undefined));
        await updateTask(task.id, {
            title: cleanedTitle,
            status: parsedProps.status || editStatus,
            dueDate: parsedProps.dueDate || editDueDate || undefined,
            startTime: editStartTime || undefined,
            projectId: resolvedProjectId,
            sectionId: resolvedSectionId,
            areaId: resolvedAreaId,
            contexts: mergedContexts,
            tags: mergedTags,
            description: resolvedDescription,
            ...(resolvedChecklist ? { checklist: resolvedChecklist } : {}),
            textDirection: nextTextDirection,
            location: editLocation || undefined,
            recurrence: recurrenceValue,
            timeEstimate: editTimeEstimate || undefined,
            priority: editPriority || undefined,
            reviewAt: editReviewAt || undefined,
            attachments: editAttachments.length > 0 ? editAttachments : undefined,
        });
        setIsEditing(false);
        if (editingTaskId === task.id) {
            setEditingTaskId(null);
        }
    };

    const project = propProject || (task.projectId ? projectById.get(task.projectId) : undefined);
    const taskArea = task.projectId
        ? (project?.areaId ? areaById.get(project.areaId) : undefined)
        : (task.areaId ? areaById.get(task.areaId) : undefined);
    const projectColor = project?.areaId ? areaById.get(project.areaId)?.color : undefined;
    const handleOpenProject = useCallback((projectId: string) => {
        setHighlightTask(task.id);
        setSelectedProjectId(projectId);
        window.dispatchEvent(new CustomEvent('mindwtr:navigate', { detail: { view: 'projects' } }));
    }, [setHighlightTask, setSelectedProjectId, task.id]);
    const hasPendingEdits = useCallback(() => {
        if (editTitle !== task.title) return true;
        if (editDescription !== (task.description || '')) return true;
        if (editProjectId !== (task.projectId || '')) return true;
        if (editSectionId !== (task.sectionId || '')) return true;
        if (editAreaId !== (task.areaId || '')) return true;
        if (editStatus !== task.status) return true;
        if (editContexts.trim() !== (task.contexts?.join(', ') || '').trim()) return true;
        if (editTags.trim() !== (task.tags?.join(', ') || '').trim()) return true;
        if (editTextDirection !== (task.textDirection ?? 'auto')) return true;
        if (editLocation !== (task.location || '')) return true;
        if (editRecurrence !== getRecurrenceRuleValue(task.recurrence)) return true;
        if (editRecurrenceStrategy !== getRecurrenceStrategyValue(task.recurrence)) return true;
        if (editRecurrenceRRule !== getRecurrenceRRuleValue(task.recurrence)) return true;
        if (editTimeEstimate !== (task.timeEstimate || '')) return true;
        if (editPriority !== (task.priority || '')) return true;
        if (editDueDate !== toDateTimeLocalValue(task.dueDate)) return true;
        if (editStartTime !== toDateTimeLocalValue(task.startTime)) return true;
        if (editReviewAt !== toDateTimeLocalValue(task.reviewAt)) return true;
        return false;
    }, [
        editTitle,
        editDescription,
        editProjectId,
        editSectionId,
        editAreaId,
        editStatus,
        editContexts,
        editTags,
        editTextDirection,
        editLocation,
        editRecurrence,
        editRecurrenceStrategy,
        editRecurrenceRRule,
        editTimeEstimate,
        editPriority,
        editDueDate,
        editStartTime,
        editReviewAt,
        task,
    ]);

    const selectAriaLabel = (() => {
        const label = t('task.select');
        return label === 'task.select' ? 'Select task' : label;
    })();

    return (
        <>
            <div
                data-task-id={task.id}
                onClickCapture={onSelect ? () => onSelect?.() : undefined}
                onDoubleClick={(event) => {
                    if (!enableDoubleClickEdit || selectionMode || effectiveReadOnly || isEditing) return;
                    event.stopPropagation();
                    startEditing();
                }}
                className={cn(
                    "group bg-card border border-border rounded-lg hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 border-l-4",
                    isCompact ? "p-2" : "p-4",
                    isSelected && "ring-2 ring-primary/40",
                    isHighlighted && "ring-2 ring-primary/70 border-primary/40"
                )}
                style={{ borderLeftColor: getStatusColor(task.status).border }}
            >
                <div className={cn("flex items-start", isCompact ? "gap-2" : "gap-3")}>
                    {selectionMode && (
                        <input
                            type="checkbox"
                            aria-label={selectAriaLabel}
                            checked={isMultiSelected}
                            onChange={() => onToggleSelect?.()}
                            className={cn(
                                "h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer",
                                isCompact ? "mt-1" : "mt-1.5"
                            )}
                        />
                    )}

                    {isEditing ? (
                        <div className="flex-1 min-w-0">
                            <TaskItemEditor
                                t={t}
                                editTitle={editTitle}
                                setEditTitle={setEditTitle}
                                autoFocusTitle={autoFocusTitle}
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
                                areas={areas}
                                editProjectId={editProjectId}
                                setEditProjectId={setEditProjectId}
                                sections={projectSections}
                                editSectionId={editSectionId}
                                setEditSectionId={setEditSectionId}
                                editAreaId={editAreaId}
                                setEditAreaId={setEditAreaId}
                                onCreateProject={handleCreateProject}
                                onCreateArea={handleCreateArea}
                                onCreateSection={handleCreateSection}
                                showProjectField={showProjectField}
                                showAreaField={showAreaField}
                                showSectionField={showSectionField}
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
                                    if (hasPendingEdits()) {
                                        setShowDiscardConfirm(true);
                                        return;
                                    }
                                    handleDiscardChanges();
                                }}
                                onSubmit={handleSubmit}
                            />
                        </div>
                    ) : (
                        <TaskItemDisplay
                            task={task}
                            project={project}
                            area={taskArea}
                            projectColor={projectColor}
                            selectionMode={selectionMode}
                            isViewOpen={isViewOpen}
                            actions={{
                                onToggleSelect,
                                onToggleView: () => setIsViewOpen((prev) => !prev),
                                onEdit: startEditing,
                                onDelete: () => deleteTask(task.id),
                                onDuplicate: () => duplicateTask(task.id, false),
                                onStatusChange: (status) => moveTask(task.id, status),
                                onOpenProject: project ? handleOpenProject : undefined,
                                openAttachment,
                                onToggleChecklistItem: handleToggleChecklistItem,
                                focusToggle,
                            }}
                            visibleAttachments={visibleAttachments}
                            recurrenceRule={recurrenceRule}
                            recurrenceStrategy={recurrenceStrategy}
                            prioritiesEnabled={prioritiesEnabled}
                            timeEstimatesEnabled={timeEstimatesEnabled}
                            isStagnant={isStagnant}
                            showQuickDone={showQuickDone}
                            showStatusSelect={showStatusSelect}
                            showProjectBadgeInActions={showProjectBadgeInActions}
                            readOnly={effectiveReadOnly}
                            compactMetaEnabled={compactMetaEnabled}
                            dense={isCompact}
                            actionsOverlay={actionsOverlay}
                            dragHandle={dragHandle}
                            showHoverHint={showHoverHint}
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
            {showLinkPrompt && (
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
            )}
            {showDiscardConfirm && (
                <ConfirmModal
                    isOpen={showDiscardConfirm}
                    title={t('taskEdit.discardChanges') === 'taskEdit.discardChanges'
                        ? 'Discard unsaved changes?'
                        : t('taskEdit.discardChanges')}
                    description={t('taskEdit.discardChangesDesc') === 'taskEdit.discardChangesDesc'
                        ? 'Your changes will be lost if you leave now.'
                        : t('taskEdit.discardChangesDesc')}
                    confirmLabel={t('common.discard') === 'common.discard' ? 'Discard' : t('common.discard')}
                    cancelLabel={t('common.cancel')}
                    onCancel={() => setShowDiscardConfirm(false)}
                    onConfirm={() => {
                        setShowDiscardConfirm(false);
                        handleDiscardChanges();
                    }}
                />
            )}
            <AttachmentModals
                audioAttachment={audioAttachment}
                audioSource={audioSource}
                audioRef={audioRef}
                audioError={audioError}
                onCloseAudio={closeAudio}
                onAudioError={handleAudioError}
                onOpenAudioExternally={openAudioExternally}
                imageAttachment={imageAttachment}
                imageSource={imageSource}
                onCloseImage={closeImage}
                onOpenImageExternally={openImageExternally}
                textAttachment={textAttachment}
                textContent={textContent}
                textLoading={textLoading}
                textError={textError}
                onCloseText={closeText}
                onOpenTextExternally={openTextExternally}
                t={t}
            />
        </>
    );
});
