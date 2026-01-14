import { useMemo, useState, memo, useEffect, useRef, useCallback } from 'react';
import {
    useTaskStore,
    Attachment,
    Task,
    TaskStatus,
    TaskPriority,
    TimeEstimate,
    TaskEditorFieldId,
    type AppData,
    type Recurrence,
    type RecurrenceRule,
    type RecurrenceStrategy,
    type RecurrenceWeekday,
    type RecurrenceByDay,
    buildRRuleString,
    parseRRuleString,
    generateUUID,
    getStatusColor,
    Project,
    createAIProvider,
    PRESET_CONTEXTS,
    PRESET_TAGS,
    type ClarifyResponse,
    type AIProviderId,
    validateAttachmentForUpload,
    safeParseDate,
} from '@mindwtr/core';
import { cn } from '../lib/utils';
import { PromptModal } from './PromptModal';
import { useLanguage } from '../contexts/language-context';
import { isTauriRuntime } from '../lib/runtime';
import { normalizeAttachmentInput } from '../lib/attachment-utils';
import { buildAIConfig, buildCopilotConfig, loadAIKey } from '../lib/ai-config';
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
import {
    isAudioAttachment,
    isImageAttachment,
    isTextAttachment,
    resolveAttachmentSource,
} from './Task/task-item-attachment-utils';
import { invoke } from '@tauri-apps/api/core';
import { readFile, readTextFile, BaseDirectory, size } from '@tauri-apps/plugin-fs';
import { dataDir } from '@tauri-apps/api/path';

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
    const [editAttachments, setEditAttachments] = useState<Attachment[]>(task.attachments || []);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [audioAttachment, setAudioAttachment] = useState<Attachment | null>(null);
    const [audioSource, setAudioSource] = useState<string | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
    const [imageAttachment, setImageAttachment] = useState<Attachment | null>(null);
    const [imageSource, setImageSource] = useState<string | null>(null);
    const [textAttachment, setTextAttachment] = useState<Attachment | null>(null);
    const [textContent, setTextContent] = useState('');
    const [textError, setTextError] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [showLinkPrompt, setShowLinkPrompt] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [aiClarifyResponse, setAiClarifyResponse] = useState<ClarifyResponse | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiBreakdownSteps, setAiBreakdownSteps] = useState<string[] | null>(null);
    const [copilotSuggestion, setCopilotSuggestion] = useState<{ context?: string; timeEstimate?: TimeEstimate; tags?: string[] } | null>(null);
    const [copilotApplied, setCopilotApplied] = useState(false);
    const [copilotContext, setCopilotContext] = useState<string | undefined>(undefined);
    const [copilotEstimate, setCopilotEstimate] = useState<TimeEstimate | undefined>(undefined);
    const copilotInputRef = useRef<string>('');
    const [isAIWorking, setIsAIWorking] = useState(false);
    const copilotAbortRef = useRef<AbortController | null>(null);
    const copilotMountedRef = useRef(true);
    const aiEnabled = settings?.ai?.enabled === true;
    const aiProvider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
    const copilotModel = settings?.ai?.copilotModel;
    const copilotSettings = useMemo(() => ({
        ai: { provider: aiProvider, copilotModel },
    }), [aiProvider, copilotModel]);
    const [aiKey, setAiKey] = useState('');
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;
    const isHighlighted = highlightTaskId === task.id;
    const recurrenceRule = getRecurrenceRuleValue(task.recurrence);
    const recurrenceStrategy = getRecurrenceStrategyValue(task.recurrence);
    const isStagnant = (task.pushCount ?? 0) > 3;
    const effectiveReadOnly = readOnly || task.status === 'done';
    const monthlyAnchorDate = safeParseDate(editDueDate) ?? safeParseDate(task.dueDate) ?? new Date();
    const monthlyWeekdayCode = WEEKDAY_ORDER[monthlyAnchorDate.getDay()];
    const monthlyRecurrence = useMemo(() => {
        if (editRecurrence !== 'monthly') {
            return { pattern: 'date' as const, interval: 1 };
        }
        const parsed = parseRRuleString(editRecurrenceRRule);
        const hasLast = parsed.byDay?.some((day) => String(day).startsWith('-1'));
        const hasNth = parsed.byDay?.some((day) => /^[1-4]/.test(String(day)));
        const hasByMonthDay = parsed.byMonthDay && parsed.byMonthDay.length > 0;
        const interval = parsed.interval && parsed.interval > 0 ? parsed.interval : 1;
        const isCustomDay = hasByMonthDay && parsed.byMonthDay?.[0] !== monthlyAnchorDate.getDate();
        const pattern: 'custom' | 'date' = hasNth || hasLast || interval > 1 || isCustomDay ? 'custom' : 'date';
        return { pattern, interval };
    }, [editRecurrence, editRecurrenceRRule, monthlyAnchorDate]);

    const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
    const [customInterval, setCustomInterval] = useState(1);
    const [customMode, setCustomMode] = useState<'date' | 'nth'>('date');
    const [customOrdinal, setCustomOrdinal] = useState<'1' | '2' | '3' | '4' | '-1'>('1');
    const [customWeekday, setCustomWeekday] = useState<RecurrenceWeekday>(monthlyWeekdayCode);
    const [customMonthDay, setCustomMonthDay] = useState<number>(monthlyAnchorDate.getDate());

    const openCustomRecurrence = useCallback(() => {
        const parsed = parseRRuleString(editRecurrenceRRule);
        const interval = parsed.interval && parsed.interval > 0 ? parsed.interval : 1;
        let mode: 'date' | 'nth' = 'date';
        let ordinal: '1' | '2' | '3' | '4' | '-1' = '1';
        let weekday: RecurrenceWeekday = monthlyWeekdayCode;
        const monthDay = parsed.byMonthDay?.[0];
        if (monthDay) {
            mode = 'date';
            setCustomMonthDay(Math.min(Math.max(monthDay, 1), 31));
        }
        const token = parsed.byDay?.find((day) => /^(-?1|2|3|4)/.test(String(day)));
        if (token) {
            const match = String(token).match(/^(-1|1|2|3|4)?(SU|MO|TU|WE|TH|FR|SA)$/);
            if (match) {
                mode = 'nth';
                ordinal = (match[1] ?? '1') as '1' | '2' | '3' | '4' | '-1';
                weekday = match[2] as RecurrenceWeekday;
            }
        }
        setCustomInterval(interval);
        setCustomMode(mode);
        setCustomOrdinal(ordinal);
        setCustomWeekday(weekday);
        if (!monthDay) {
            setCustomMonthDay(monthlyAnchorDate.getDate());
        }
        setShowCustomRecurrence(true);
    }, [editRecurrenceRRule, monthlyAnchorDate, monthlyWeekdayCode]);

    const handleSetEditTextDirection = useCallback((value: Task['textDirection']) => {
        setEditTextDirection(value ?? 'auto');
    }, []);

    const applyCustomRecurrence = useCallback(() => {
        const intervalValue = Number(customInterval);
        const safeInterval = Number.isFinite(intervalValue) && intervalValue > 0 ? intervalValue : 1;
        const safeMonthDay = Math.min(Math.max(Math.round(customMonthDay || 1), 1), 31);
        const rrule = customMode === 'nth'
            ? buildRRuleString('monthly', [`${customOrdinal}${customWeekday}` as RecurrenceByDay], safeInterval)
            : [
                'FREQ=MONTHLY',
                safeInterval > 1 ? `INTERVAL=${safeInterval}` : null,
                `BYMONTHDAY=${safeMonthDay}`,
            ].filter(Boolean).join(';');
        setEditRecurrence('monthly');
        setEditRecurrenceRRule(rrule);
        setShowCustomRecurrence(false);
    }, [customInterval, customMode, customOrdinal, customWeekday, customMonthDay]);

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

    const resolveValidationMessage = useCallback((error?: string) => {
        if (error === 'file_too_large') return t('attachments.fileTooLarge');
        if (error === 'mime_type_blocked' || error === 'mime_type_not_allowed') return t('attachments.invalidFileType');
        return t('attachments.fileNotSupported');
    }, [t]);

    const resolveAudioBlobSource = useCallback(async (attachment: Attachment) => {
        if (!isTauriRuntime()) return null;
        const uri = attachment.uri.replace(/^file:\/\//i, '');
        try {
            const baseDir = await dataDir();
            if (!uri.startsWith(baseDir)) return null;
            const relative = uri.slice(baseDir.length).replace(/^[\\/]/, '');
            const bytes = await readFile(relative, { baseDir: BaseDirectory.Data });
            const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            const mimeType = attachment.mimeType || 'audio/wav';
            const blob = new Blob([buffer], { type: mimeType });
            return URL.createObjectURL(blob);
        } catch (error) {
            console.warn('Failed to load audio bytes', error);
            return null;
        }
    }, []);

    const loadTextAttachment = useCallback(async (attachment: Attachment) => {
        if (!isTauriRuntime()) {
            throw new Error(t('attachments.fileNotSupported'));
        }
        const uri = attachment.uri.replace(/^file:\/\//i, '');
        if (/^https?:\/\//i.test(uri)) {
            throw new Error(t('attachments.fileNotSupported'));
        }
        const base = await dataDir();
        if (uri.startsWith(base)) {
            const relative = uri.slice(base.length).replace(/^[\\/]/, '');
            return await readTextFile(relative, { baseDir: BaseDirectory.Data });
        }
        return await readTextFile(uri);
    }, [t]);

    const openExternal = useCallback(async (uri: string) => {
        setAttachmentError(null);
        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(uri);
        const normalized = hasScheme ? uri : `file://${uri}`;
        if (isTauriRuntime()) {
            try {
                await invoke('open_path', { path: uri });
                return;
            } catch (error) {
                console.warn('Failed to open attachment', error);
                const message = error instanceof Error ? error.message : String(error);
                setAttachmentError(message || t('attachments.fileNotSupported'));
            }
        }
        window.open(normalized, '_blank');
    }, [t]);

    const closeAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setAudioAttachment(null);
        setAudioSource(null);
        setAudioError(null);
        if (audioObjectUrl) {
            URL.revokeObjectURL(audioObjectUrl);
            setAudioObjectUrl(null);
        }
    }, []);

    const closeImage = useCallback(() => {
        setImageAttachment(null);
        setImageSource(null);
    }, []);

    const closeText = useCallback(() => {
        setTextAttachment(null);
        setTextContent('');
        setTextError(null);
        setTextLoading(false);
    }, []);

    const openAudioExternally = useCallback(() => {
        if (!audioAttachment) return;
        void openExternal(audioAttachment.uri);
    }, [audioAttachment, openExternal]);

    const handleAudioError = useCallback(() => {
        const code = audioRef.current?.error?.code;
        const message = code === 1
            ? 'Audio playback aborted.'
            : code === 2
                ? 'Network error while loading audio.'
                : code === 3
                    ? 'Audio decoding failed.'
                    : code === 4
                        ? 'Audio format not supported.'
                        : 'Audio playback failed.';
        setAudioError(message);
    }, [audioRef]);

    const openTextExternally = useCallback(() => {
        if (!textAttachment) return;
        void openExternal(textAttachment.uri);
    }, [textAttachment, openExternal]);

    useEffect(() => {
        if (!audioAttachment && !imageAttachment && !textAttachment) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            if (audioAttachment) closeAudio();
            if (imageAttachment) closeImage();
            if (textAttachment) closeText();
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [audioAttachment, closeAudio, closeImage, closeText, imageAttachment, textAttachment]);

    const openAttachment = (attachment: Attachment) => {
        if (isAudioAttachment(attachment)) {
            setAudioAttachment(attachment);
            setAudioError(null);
            void resolveAudioBlobSource(attachment).then((blobUrl) => {
                if (blobUrl) {
                    if (audioObjectUrl) {
                        URL.revokeObjectURL(audioObjectUrl);
                    }
                    setAudioObjectUrl(blobUrl);
                    setAudioSource(blobUrl);
                } else {
                    setAudioSource(resolveAttachmentSource(attachment.uri));
                }
            });
            setAudioError(null);
            return;
        }
        if (isTextAttachment(attachment)) {
            setTextAttachment(attachment);
            setTextError(null);
            setTextLoading(true);
            void loadTextAttachment(attachment)
                .then((content) => {
                    setTextContent(content);
                })
                .catch((error) => {
                    console.warn('Failed to read text attachment', error);
                    const message = error instanceof Error ? error.message : String(error);
                    setTextError(message || t('attachments.fileNotSupported'));
                })
                .finally(() => {
                    setTextLoading(false);
                });
            return;
        }
        if (isImageAttachment(attachment)) {
            setImageAttachment(attachment);
            setImageSource(resolveAttachmentSource(attachment.uri));
            return;
        }
        void openExternal(attachment.uri);
    };

    const addFileAttachment = async () => {
        if (!isTauriRuntime()) {
            setAttachmentError(t('attachments.fileNotSupported'));
            return;
        }
        setAttachmentError(null);
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
            multiple: false,
            directory: false,
            title: t('attachments.addFile'),
        });
        if (!selected || typeof selected !== 'string') return;
        try {
            const fileSize = await size(selected);
            const validation = await validateAttachmentForUpload(
                {
                    id: 'pending',
                    kind: 'file',
                    title: selected.split(/[/\\]/).pop() || selected,
                    uri: selected,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                fileSize
            );
            if (!validation.valid) {
                setAttachmentError(resolveValidationMessage(validation.error));
                return;
            }
        } catch (error) {
            console.warn('Failed to validate attachment size', error);
        }
        const now = new Date().toISOString();
        const title = selected.split(/[/\\]/).pop() || selected;
        const attachment: Attachment = {
            id: generateUUID(),
            kind: 'file',
            title,
            uri: selected,
            createdAt: now,
            updatedAt: now,
        };
        setEditAttachments((prev) => [...prev, attachment]);
    };

    const addLinkAttachment = () => {
        setAttachmentError(null);
        setShowLinkPrompt(true);
    };

    const removeAttachment = (id: string) => {
        const now = new Date().toISOString();
        setEditAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, deletedAt: now, updatedAt: now } : a))
        );
    };

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
        setEditTimeEstimate(task.timeEstimate || '');
        setEditPriority(task.priority || '');
        setEditReviewAt(toDateTimeLocalValue(task.reviewAt));
        setEditAttachments(task.attachments || []);
        setAttachmentError(null);
        setShowDescriptionPreview(false);
        setAiClarifyResponse(null);
        setAiError(null);
        setAiBreakdownSteps(null);
        setCopilotSuggestion(null);
        setCopilotApplied(false);
        setCopilotContext(undefined);
        setCopilotEstimate(undefined);
    };

    const resetCopilotDraft = () => {
        setCopilotApplied(false);
        setCopilotContext(undefined);
        setCopilotEstimate(undefined);
    };

    const applyCopilotSuggestion = () => {
        if (!copilotSuggestion) return;
        if (copilotSuggestion.context) {
            const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
            const nextContexts = Array.from(new Set([...currentContexts, copilotSuggestion.context]));
            setEditContexts(nextContexts.join(', '));
            setCopilotContext(copilotSuggestion.context);
        }
        if (copilotSuggestion.tags?.length) {
            const currentTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
            const nextTags = Array.from(new Set([...currentTags, ...copilotSuggestion.tags]));
            setEditTags(nextTags.join(', '));
        }
        if (copilotSuggestion.timeEstimate && timeEstimatesEnabled) {
            setEditTimeEstimate(copilotSuggestion.timeEstimate);
            setCopilotEstimate(copilotSuggestion.timeEstimate);
        }
        setCopilotApplied(true);
    };

    useEffect(() => {
        let active = true;
        loadAIKey(aiProvider)
            .then((key) => {
                if (active) setAiKey(key);
            })
            .catch(() => {
                if (active) setAiKey('');
            });
        return () => {
            active = false;
        };
    }, [aiProvider]);

    useEffect(() => {
        if (!aiEnabled) {
            setCopilotSuggestion(null);
            return;
        }
        if (!aiKey) {
            setCopilotSuggestion(null);
            return;
        }
        const title = editTitle.trim();
        const description = editDescription.trim();
        const input = [title, description].filter(Boolean).join('\n');
        if (input.length < 4) {
            setCopilotSuggestion(null);
            return;
        }
        const signature = JSON.stringify({
            input,
            contexts: editContexts,
            provider: aiProvider,
            model: copilotModel ?? '',
            tags: tagOptions,
            timeEstimatesEnabled,
        });
        if (signature === copilotInputRef.current) {
            return;
        }
        copilotInputRef.current = signature;
        let cancelled = false;
        let localAbort: AbortController | null = null;
        const handle = setTimeout(async () => {
            try {
                const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
                const provider = createAIProvider(buildCopilotConfig(copilotSettings as AppData['settings'], aiKey));
                const abortController = typeof AbortController === 'function' ? new AbortController() : null;
                localAbort = abortController;
                const previousController = copilotAbortRef.current;
                if (abortController) {
                    copilotAbortRef.current = abortController;
                }
                if (previousController) {
                    previousController.abort();
                }
                const suggestion = await provider.predictMetadata(
                    {
                        title: input,
                        contexts: Array.from(new Set([...PRESET_CONTEXTS, ...currentContexts])),
                        tags: tagOptions,
                    },
                    abortController ? { signal: abortController.signal } : undefined
                );
                if (cancelled || !copilotMountedRef.current) return;
                if (!suggestion.context && (!timeEstimatesEnabled || !suggestion.timeEstimate) && !suggestion.tags?.length) {
                    setCopilotSuggestion(null);
                } else {
                    setCopilotSuggestion(suggestion);
                }
            } catch {
                if (!cancelled && copilotMountedRef.current) {
                    setCopilotSuggestion(null);
                }
            }
        }, 800);
        return () => {
            cancelled = true;
            clearTimeout(handle);
            if (copilotAbortRef.current && copilotAbortRef.current === localAbort) {
                copilotAbortRef.current.abort();
                copilotAbortRef.current = null;
            }
        };
    }, [aiEnabled, aiKey, editTitle, editDescription, editContexts, aiProvider, copilotModel, copilotSettings, timeEstimatesEnabled, tagOptions]);

    useEffect(() => {
        copilotMountedRef.current = true;
        return () => {
            copilotMountedRef.current = false;
            if (copilotAbortRef.current) {
                copilotAbortRef.current.abort();
                copilotAbortRef.current = null;
            }
        };
    }, []);

    const logAIDebug = async (context: string, message: string) => {
        if (!isTauriRuntime()) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('log_ai_debug', {
                context,
                message,
                provider: aiProvider,
                model: settings?.ai?.model ?? '',
                taskId: task.id,
            });
        } catch (error) {
            console.warn('AI debug log failed', error);
        }
    };

    const getAIProvider = () => {
        if (!aiEnabled) {
            setAiError(t('ai.disabledBody'));
            return null;
        }
        if (!aiKey) {
            setAiError(t('ai.missingKeyBody'));
            return null;
        }
        return createAIProvider(buildAIConfig(settings, aiKey));
    };

    const applyAISuggestion = (suggested: { title?: string; context?: string; timeEstimate?: TimeEstimate }) => {
        if (suggested.title) setEditTitle(suggested.title);
        if (suggested.timeEstimate && timeEstimatesEnabled) setEditTimeEstimate(suggested.timeEstimate);
        if (suggested.context) {
            const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
            const nextContexts = Array.from(new Set([...currentContexts, suggested.context]));
            setEditContexts(nextContexts.join(', '));
        }
        setAiClarifyResponse(null);
    };

    const handleAIClarify = async () => {
        if (isAIWorking) return;
        const title = editTitle.trim();
        if (!title) return;
        const provider = getAIProvider();
        if (!provider) return;
        setIsAIWorking(true);
        setAiError(null);
        setAiBreakdownSteps(null);
        try {
            const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
            const response = await provider.clarifyTask({
                title,
                contexts: Array.from(new Set([...PRESET_CONTEXTS, ...currentContexts])),
                ...(projectContext ?? {}),
            });
            setAiClarifyResponse(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setAiError(message);
            await logAIDebug('clarify', message);
            console.warn(error);
        } finally {
            setIsAIWorking(false);
        }
    };

    const handleAIBreakdown = async () => {
        if (isAIWorking) return;
        const title = editTitle.trim();
        if (!title) return;
        const provider = getAIProvider();
        if (!provider) return;
        setIsAIWorking(true);
        setAiError(null);
        setAiBreakdownSteps(null);
        try {
            const response = await provider.breakDownTask({
                title,
                description: editDescription,
                ...(projectContext ?? {}),
            });
            const steps = response.steps.map((step) => step.trim()).filter(Boolean).slice(0, 8);
            if (steps.length === 0) return;
            setAiBreakdownSteps(steps);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setAiError(message);
            await logAIDebug('breakdown', message);
            console.warn(error);
        } finally {
            setIsAIWorking(false);
        }
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
                                    setAiBreakdownSteps(null);
                                }}
                                onDismissBreakdown={() => setAiBreakdownSteps(null)}
                                aiClarifyResponse={aiClarifyResponse}
                                onSelectClarifyOption={(action) => {
                                    setEditTitle(action);
                                    setAiClarifyResponse(null);
                                }}
                                onApplyAISuggestion={() => {
                                    if (aiClarifyResponse?.suggestedAction) {
                                        applyAISuggestion(aiClarifyResponse.suggestedAction);
                                    }
                                }}
                                onDismissClarify={() => setAiClarifyResponse(null)}
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
                const normalized = normalizeAttachmentInput(value);
                if (!normalized.uri) return;
                const now = new Date().toISOString();
                const attachment: Attachment = {
                    id: generateUUID(),
                    kind: normalized.kind,
                    title: normalized.title,
                    uri: normalized.uri,
                    createdAt: now,
                    updatedAt: now,
                };
                setEditAttachments((prev) => [...prev, attachment]);
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
            onOpenExternally={() => {
                if (imageAttachment) {
                    void openExternal(imageAttachment.uri);
                }
            }}
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
