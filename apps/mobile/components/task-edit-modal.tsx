import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, ScrollView, Platform, Share, Alert, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Attachment,
    Task,
    TaskEditorFieldId,
    TaskStatus,
    TaskPriority,
    TimeEstimate,
    useTaskStore,
    createAIProvider,
    generateUUID,
    PRESET_CONTEXTS,
    PRESET_TAGS,
    RecurrenceRule,
    type AIProviderId,
    type RecurrenceStrategy,
    type RecurrenceWeekday,
    type RecurrenceByDay,
    buildRRuleString,
    parseRRuleString,
    RECURRENCE_RULES,
    hasTimeComponent,
    safeFormatDate,
    safeParseDate,
    safeParseDueDate,
} from '@mindwtr/core';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { useLanguage } from '../contexts/language-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { MarkdownText } from './markdown-text';
import { buildAIConfig, buildCopilotConfig, loadAIKey } from '../lib/ai-config';
import { AIResponseModal, type AIResponseAction } from './ai-response-modal';
import { styles } from './task-edit/task-edit-modal.styles';
import { TaskEditViewTab } from './task-edit/TaskEditViewTab';
import { TaskEditFormTab } from './task-edit/TaskEditFormTab';
import { TaskEditHeader } from './task-edit/TaskEditHeader';
import { TaskEditTabs } from './task-edit/TaskEditTabs';
import { TaskEditProjectPicker } from './task-edit/TaskEditProjectPicker';
import {
    MAX_SUGGESTED_TAGS,
    MAX_VISIBLE_SUGGESTIONS,
    WEEKDAY_ORDER,
    WEEKDAY_BUTTONS,
    MONTHLY_WEEKDAY_LABELS,
    getRecurrenceRuleValue,
    getRecurrenceStrategyValue,
    buildRecurrenceValue,
    getRecurrenceByDayValue,
    getRecurrenceRRuleValue,
} from './task-edit/recurrence-utils';


interface TaskEditModalProps {
    visible: boolean;
    task: Task | null;
    onClose: () => void;
    onSave: (taskId: string, updates: Partial<Task>) => void;
    onFocusMode?: (taskId: string) => void;
    defaultTab?: 'task' | 'view';
}

const STATUS_OPTIONS: TaskStatus[] = ['inbox', 'next', 'waiting', 'someday', 'done'];
const COMPACT_STATUS_LABELS: Record<TaskStatus, string> = {
    inbox: 'Inbox',
    next: 'Next',
    waiting: 'Wait',
    someday: 'Later',
    done: 'Done',
};

const DEFAULT_TASK_EDITOR_ORDER: TaskEditorFieldId[] = [
    'status',
    'project',
    'priority',
    'contexts',
    'description',
    'tags',
    'timeEstimate',
    'recurrence',
    'startTime',
    'dueDate',
    'reviewAt',
    'attachments',
    'checklist',
];



type TaskEditTab = 'task' | 'view';

export function TaskEditModal({ visible, task, onClose, onSave, onFocusMode, defaultTab }: TaskEditModalProps) {
    const { tasks, projects, settings, duplicateTask, resetTaskChecklist, addProject, deleteTask } = useTaskStore();
    const { t } = useLanguage();
    const tc = useThemeColors();
    const prioritiesEnabled = settings.features?.priorities === true;
    const timeEstimatesEnabled = settings.features?.timeEstimates === true;
    const liveTask = useMemo(() => {
        if (!task?.id) return task ?? null;
        return tasks.find((item) => item.id === task.id) ?? task;
    }, [task, tasks]);
    const [editedTask, setEditedTaskState] = useState<Partial<Task>>({});
    const isDirtyRef = useRef(false);
    const baseTaskRef = useRef<Task | null>(null);
    const setEditedTask = useCallback(
        (value: React.SetStateAction<Partial<Task>>, markDirty = true) => {
            if (markDirty) {
                isDirtyRef.current = true;
            }
            setEditedTaskState(value);
        },
        []
    );
    const [showDatePicker, setShowDatePicker] = useState<'start' | 'start-time' | 'due' | 'due-time' | 'review' | null>(null);
    const [pendingStartDate, setPendingStartDate] = useState<Date | null>(null);
    const [pendingDueDate, setPendingDueDate] = useState<Date | null>(null);
    const [editTab, setEditTab] = useState<TaskEditTab>('task');
    const [showDescriptionPreview, setShowDescriptionPreview] = useState(false);
    const [linkModalVisible, setLinkModalVisible] = useState(false);
    const [showProjectPicker, setShowProjectPicker] = useState(false);
    const [linkInput, setLinkInput] = useState('');
    const [customWeekdays, setCustomWeekdays] = useState<RecurrenceWeekday[]>([]);
    const [isAIWorking, setIsAIWorking] = useState(false);
    const [aiModal, setAiModal] = useState<{ title: string; message?: string; actions: AIResponseAction[] } | null>(null);
    const aiEnabled = settings.ai?.enabled === true;
    const aiProvider = (settings.ai?.provider ?? 'openai') as AIProviderId;
    const [aiKey, setAiKey] = useState('');
    const [copilotSuggestion, setCopilotSuggestion] = useState<{ context?: string; timeEstimate?: TimeEstimate; tags?: string[] } | null>(null);
    const [copilotApplied, setCopilotApplied] = useState(false);
    const [copilotContext, setCopilotContext] = useState<string | undefined>(undefined);
    const [copilotEstimate, setCopilotEstimate] = useState<TimeEstimate | undefined>(undefined);
    const [copilotTags, setCopilotTags] = useState<string[]>([]);
    const contextOptionsRef = useRef(contextOptions);
    const tagOptionsRef = useRef(tagOptions);
    const copilotMountedRef = useRef(true);
    const copilotAbortRef = useRef<AbortController | null>(null);
    const [showAllContexts, setShowAllContexts] = useState(false);
    const [showAllTags, setShowAllTags] = useState(false);

    // Compute most frequent tags from all tasks
    const suggestedTags = React.useMemo(() => {
        const counts = new Map<string, number>();
        tasks.forEach(t => {
            t.contexts?.forEach(ctx => {
                counts.set(ctx, (counts.get(ctx) || 0) + 1);
            });
        });

        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1]) // Sort desc by count
            .map(([tag]) => tag);

        // Add default tags if we don't have enough history
        const defaults = ['@home', '@work', '@errands', '@computer', '@phone'];
        const unique = new Set([...sorted, ...defaults]);

        return Array.from(unique).slice(0, MAX_SUGGESTED_TAGS);
    }, [tasks]);

    const contextOptions = React.useMemo(() => {
        const taskContexts = tasks.flatMap((item) => item.contexts || []);
        return Array.from(new Set([...PRESET_CONTEXTS, ...taskContexts])).filter(Boolean);
    }, [tasks]);
    const tagOptions = React.useMemo(() => {
        const taskTags = tasks.flatMap((item) => item.tags || []);
        return Array.from(new Set([...PRESET_TAGS, ...taskTags])).filter(Boolean);
    }, [tasks]);

    // Compute most frequent tags (hashtags)
    const suggestedHashtags = React.useMemo(() => {
        const counts = new Map<string, number>();
        tasks.forEach(t => {
            t.tags?.forEach(tag => {
                counts.set(tag, (counts.get(tag) || 0) + 1);
            });
        });

        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1]) // Sort desc by count
            .map(([tag]) => tag);

        // Explicitly cast PRESET_TAGS to string[] or use it directly
        // TS Error Fix: If PRESET_TAGS is constant tuple, spread works but type might need assertion
        // But TS says "Cannot find name", so import is the key.
        const unique = new Set([...sorted, ...PRESET_TAGS]);

        return Array.from(unique).slice(0, MAX_SUGGESTED_TAGS);
    }, [tasks]);

    const visibleContextSuggestions = showAllContexts
        ? suggestedTags
        : suggestedTags.slice(0, MAX_VISIBLE_SUGGESTIONS);
    const visibleTagSuggestions = showAllTags
        ? suggestedHashtags
        : suggestedHashtags.slice(0, MAX_VISIBLE_SUGGESTIONS);

    const resolveInitialTab = (target?: TaskEditTab, currentTask?: Task | null): TaskEditTab => {
        if (target) return target;
        if (currentTask?.taskMode === 'list') return 'view';
        return 'view';
    };

    useEffect(() => {
        if (liveTask) {
            const recurrenceRule = getRecurrenceRuleValue(liveTask.recurrence);
            const recurrenceStrategy = getRecurrenceStrategyValue(liveTask.recurrence);
            const byDay = getRecurrenceByDayValue(liveTask.recurrence);
            const rrule = getRecurrenceRRuleValue(liveTask.recurrence);
            const normalizedTask: Task = {
                ...liveTask,
                recurrence: recurrenceRule
                    ? { rule: recurrenceRule, strategy: recurrenceStrategy, ...(rrule ? { rrule } : {}), ...(byDay.length ? { byDay } : {}) }
                    : undefined,
            };
            const taskChanged = baseTaskRef.current?.id !== normalizedTask.id;
            const updatedChanged = baseTaskRef.current?.updatedAt !== normalizedTask.updatedAt;
            if (taskChanged || (!isDirtyRef.current && updatedChanged)) {
                setCustomWeekdays(byDay);
                setEditedTaskState(normalizedTask);
                baseTaskRef.current = normalizedTask;
                isDirtyRef.current = false;
                setShowDescriptionPreview(false);
                setEditTab(resolveInitialTab(defaultTab, normalizedTask));
                setCopilotSuggestion(null);
                setCopilotApplied(false);
                setCopilotContext(undefined);
                setCopilotEstimate(undefined);
                setCopilotTags([]);
            }
        } else if (visible) {
            setEditedTaskState({});
            baseTaskRef.current = null;
            isDirtyRef.current = false;
            setShowMoreOptions(false);
            setShowDescriptionPreview(false);
            setEditTab(resolveInitialTab(defaultTab, null));
            setCustomWeekdays([]);
        }
    }, [liveTask, defaultTab, visible]);

    useEffect(() => {
        loadAIKey(aiProvider).then(setAiKey).catch(console.error);
    }, [aiProvider]);

    useEffect(() => {
        copilotMountedRef.current = true;
        return () => {
            copilotMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        contextOptionsRef.current = contextOptions;
        tagOptionsRef.current = tagOptions;
    }, [contextOptions, tagOptions]);

    useEffect(() => {
        if (!aiEnabled || !aiKey) {
            setCopilotSuggestion(null);
            return;
        }
        const title = String(editedTask.title ?? '').trim();
        const description = String(editedTask.description ?? '').trim();
        const input = [title, description].filter(Boolean).join('\n');
        if (input.length < 4) {
            setCopilotSuggestion(null);
            return;
        }
        let cancelled = false;
        let localAbortController: AbortController | null = null;
            const handle = setTimeout(async () => {
                const abortController = typeof AbortController === 'function' ? new AbortController() : null;
                localAbortController = abortController;
                const previousController = copilotAbortRef.current;
                if (abortController) {
                    copilotAbortRef.current = abortController;
                }
                if (previousController) {
                    previousController.abort();
                }
                try {
                    const provider = createAIProvider(buildCopilotConfig(settings, aiKey));
                    const suggestion = await provider.predictMetadata(
                        { title: input, contexts: contextOptionsRef.current, tags: tagOptionsRef.current },
                        abortController ? { signal: abortController.signal } : undefined
                    );
                    if (cancelled || !copilotMountedRef.current) return;
                    if (!suggestion.context && (!timeEstimatesEnabled || !suggestion.timeEstimate) && !suggestion.tags?.length) {
                        setCopilotSuggestion(null);
                    } else {
                        setCopilotSuggestion(suggestion);
                    }
                } catch {
                    if (!cancelled && copilotMountedRef.current) setCopilotSuggestion(null);
                }
            }, 800);
            return () => {
                cancelled = true;
                clearTimeout(handle);
                if (copilotAbortRef.current && copilotAbortRef.current === localAbortController) {
                    copilotAbortRef.current.abort();
                    copilotAbortRef.current = null;
                }
            };
    }, [aiEnabled, aiKey, editedTask.title, editedTask.description, settings, timeEstimatesEnabled]);

    useEffect(() => {
        if (!visible) {
            setAiModal(null);
            setCopilotSuggestion(null);
            setCopilotApplied(false);
            setCopilotContext(undefined);
            setCopilotEstimate(undefined);
            setCopilotTags([]);
            if (copilotAbortRef.current) {
                copilotAbortRef.current.abort();
                copilotAbortRef.current = null;
            }
        }
    }, [visible]);

    const closeAIModal = () => setAiModal(null);
    const resetCopilotDraft = () => {
        setCopilotApplied(false);
        setCopilotContext(undefined);
        setCopilotEstimate(undefined);
        setCopilotTags([]);
    };

    const applyCopilotSuggestion = () => {
        if (!copilotSuggestion) return;
        if (copilotSuggestion.context) {
            const current = editedTask.contexts ?? [];
            const next = Array.from(new Set([...current, copilotSuggestion.context]));
            setEditedTask(prev => ({ ...prev, contexts: next }));
            setCopilotContext(copilotSuggestion.context);
        }
        if (copilotSuggestion.tags?.length) {
            const currentTags = editedTask.tags ?? [];
            const nextTags = Array.from(new Set([...currentTags, ...copilotSuggestion.tags]));
            setEditedTask(prev => ({ ...prev, tags: nextTags }));
            setCopilotTags(copilotSuggestion.tags);
        }
        if (copilotSuggestion.timeEstimate && timeEstimatesEnabled) {
            setEditedTask(prev => ({ ...prev, timeEstimate: copilotSuggestion.timeEstimate }));
            setCopilotEstimate(copilotSuggestion.timeEstimate);
        }
        setCopilotApplied(true);
    };

    const projectContext = useMemo(() => {
        const projectId = (editedTask.projectId as string | undefined) ?? task?.projectId;
        if (!projectId) return null;
        const project = projects.find((p) => p.id === projectId);
        const projectTasks = tasks
            .filter((t) => t.projectId === projectId && t.id !== task?.id && !t.deletedAt)
            .map((t) => `${t.title}${t.status ? ` (${t.status})` : ''}`)
            .filter(Boolean)
            .slice(0, 20);
        return {
            projectTitle: project?.title || '',
            projectTasks,
        };
    }, [editedTask.projectId, projects, task?.id, task?.projectId, tasks]);

    const handleSave = () => {
        if (!task) return;
        const updates: Partial<Task> = { ...editedTask };
        const recurrenceRule = getRecurrenceRuleValue(editedTask.recurrence);
        const recurrenceStrategy = getRecurrenceStrategyValue(editedTask.recurrence);
        if (recurrenceRule) {
            if (recurrenceRule === 'weekly' && customWeekdays.length > 0) {
                const rrule = buildRRuleString('weekly', customWeekdays);
                updates.recurrence = { rule: 'weekly', strategy: recurrenceStrategy, byDay: customWeekdays, rrule };
            } else if (recurrenceRRuleValue) {
                const parsed = parseRRuleString(recurrenceRRuleValue);
                if (parsed.byDay?.length) {
                    updates.recurrence = { rule: recurrenceRule, strategy: recurrenceStrategy, byDay: parsed.byDay, rrule: recurrenceRRuleValue };
                } else {
                    updates.recurrence = { rule: recurrenceRule, strategy: recurrenceStrategy, rrule: recurrenceRRuleValue };
                }
            } else {
                updates.recurrence = buildRecurrenceValue(recurrenceRule, recurrenceStrategy);
            }
        } else {
            updates.recurrence = undefined;
        }
        const baseTask = baseTaskRef.current ?? task;
        const trimmedUpdates: Partial<Task> = { ...updates };
        (Object.keys(trimmedUpdates) as (keyof Task)[]).forEach((key) => {
            const nextValue = trimmedUpdates[key];
            const baseValue = baseTask[key];
            if (Array.isArray(nextValue) || typeof nextValue === 'object') {
                const nextSerialized = nextValue == null ? null : JSON.stringify(nextValue);
                const baseSerialized = baseValue == null ? null : JSON.stringify(baseValue);
                if (nextSerialized === baseSerialized) delete trimmedUpdates[key];
            } else if ((nextValue ?? null) === (baseValue ?? null)) {
                delete trimmedUpdates[key];
            }
        });
        if (Object.keys(trimmedUpdates).length === 0) {
            onClose();
            return;
        }
        onSave(task.id, trimmedUpdates);
        onClose();
    };

    const handleShare = async () => {
        if (!task) return;

        const title = String(editedTask.title ?? task.title ?? '').trim();
        const lines: string[] = [];

        if (title) lines.push(title);

        const status = (editedTask.status ?? task.status) as TaskStatus | undefined;
        if (status) lines.push(`${t('taskEdit.statusLabel')}: ${t(`status.${status}`)}`);
        if (prioritiesEnabled) {
            const priority = editedTask.priority ?? task.priority;
            if (priority) lines.push(`${t('taskEdit.priorityLabel')}: ${t(`priority.${priority}`)}`);
        }

        if (editedTask.startTime) lines.push(`${t('taskEdit.startDateLabel')}: ${formatDate(editedTask.startTime)}`);
        if (editedTask.dueDate) lines.push(`${t('taskEdit.dueDateLabel')}: ${formatDueDate(editedTask.dueDate)}`);
        if (editedTask.reviewAt) lines.push(`${t('taskEdit.reviewDateLabel')}: ${formatDate(editedTask.reviewAt)}`);

        if (timeEstimatesEnabled) {
            const estimate = editedTask.timeEstimate as TimeEstimate | undefined;
            if (estimate) lines.push(`${t('taskEdit.timeEstimateLabel')}: ${formatTimeEstimateLabel(estimate)}`);
        }

        const contexts = (editedTask.contexts ?? []).filter(Boolean);
        if (contexts.length) lines.push(`${t('taskEdit.contextsLabel')}: ${contexts.join(', ')}`);

        const tags = (editedTask.tags ?? []).filter(Boolean);
        if (tags.length) lines.push(`${t('taskEdit.tagsLabel')}: ${tags.join(', ')}`);

        const description = String(editedTask.description ?? '').trim();
        if (description) {
            lines.push('');
            lines.push(`${t('taskEdit.descriptionLabel')}:`);
            lines.push(description);
        }

        const checklist = (editedTask.checklist ?? []).filter((item) => item && item.title);
        if (checklist.length) {
            lines.push('');
            lines.push(`${t('taskEdit.checklist')}:`);
            checklist.forEach((item) => {
                lines.push(`${item.isCompleted ? '[x]' : '[ ]'} ${item.title}`);
            });
        }

        const message = lines.join('\n').trim();
        if (!message) return;

        try {
            await Share.share({
                title: title || undefined,
                message,
            });
        } catch (error) {
            console.error('Share failed:', error);
        }
    };

    const attachments = (editedTask.attachments || []) as Attachment[];
    const visibleAttachments = attachments.filter((a) => !a.deletedAt);

    const addFileAttachment = async () => {
        const result = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: false,
            multiple: false,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        const now = new Date().toISOString();
        const attachment: Attachment = {
            id: generateUUID(),
            kind: 'file',
            title: asset.name || 'file',
            uri: asset.uri,
            mimeType: asset.mimeType,
            size: asset.size,
            createdAt: now,
            updatedAt: now,
        };
        setEditedTask((prev) => ({ ...prev, attachments: [...(prev.attachments || []), attachment] }));
    };

    const addImageAttachment = async () => {
        let imagePicker: typeof import('expo-image-picker') | null = null;
        try {
            imagePicker = await import('expo-image-picker');
        } catch (error) {
            console.warn('Image picker unavailable', error);
            Alert.alert(t('attachments.photoUnavailableTitle'), t('attachments.photoUnavailableBody'));
            return;
        }

        const permission = await imagePicker.getMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            const requested = await imagePicker.requestMediaLibraryPermissionsAsync();
            if (!requested.granted) return;
        }
        const result = await imagePicker.launchImageLibraryAsync({
            mediaTypes: imagePicker.MediaTypeOptions.Images,
            quality: 0.9,
            allowsMultipleSelection: false,
        });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        const now = new Date().toISOString();
        const attachment: Attachment = {
            id: generateUUID(),
            kind: 'file',
            title: asset.fileName || asset.uri.split('/').pop() || 'image',
            uri: asset.uri,
            mimeType: asset.mimeType,
            size: (asset as { fileSize?: number }).fileSize,
            createdAt: now,
            updatedAt: now,
        };
        setEditedTask((prev) => ({ ...prev, attachments: [...(prev.attachments || []), attachment] }));
    };

    const confirmAddLink = () => {
        const url = linkInput.trim();
        if (!url) return;
        const now = new Date().toISOString();
        const attachment: Attachment = {
            id: generateUUID(),
            kind: 'link',
            title: url,
            uri: url,
            createdAt: now,
            updatedAt: now,
        };
        setEditedTask((prev) => ({ ...prev, attachments: [...(prev.attachments || []), attachment] }));
        setLinkInput('');
        setLinkModalVisible(false);
    };

    const openAttachment = async (attachment: Attachment) => {
        if (attachment.kind === 'link') {
            Linking.openURL(attachment.uri).catch(console.error);
            return;
        }
        const available = await Sharing.isAvailableAsync().catch((error) => {
            console.warn('[Sharing] availability check failed', error);
            return false;
        });
        if (available) {
            Sharing.shareAsync(attachment.uri).catch(console.error);
        } else {
            Linking.openURL(attachment.uri).catch(console.error);
        }
    };

    const isImageAttachment = (attachment: Attachment) => {
        const mime = attachment.mimeType?.toLowerCase();
        if (mime?.startsWith('image/')) return true;
        return /\.(png|jpg|jpeg|gif|webp|heic|heif)$/i.test(attachment.uri);
    };

    const removeAttachment = (id: string) => {
        const now = new Date().toISOString();
        const next = attachments.map((a) => (a.id === id ? { ...a, deletedAt: now, updatedAt: now } : a));
        setEditedTask((prev) => ({ ...prev, attachments: next }));
    };



    const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        const currentMode = showDatePicker;
        if (!currentMode) return;

        if (event.type === 'dismissed') {
            if (currentMode === 'start-time') setPendingStartDate(null);
            if (currentMode === 'due-time') setPendingDueDate(null);
            setShowDatePicker(null);
            return;
        }

        if (!selectedDate) return;

        if (currentMode === 'start') {
            const dateOnly = safeFormatDate(selectedDate, 'yyyy-MM-dd');
            const existing = editedTask.startTime && hasTimeComponent(editedTask.startTime)
                ? safeParseDate(editedTask.startTime)
                : null;
            if (existing) {
                const combined = new Date(selectedDate);
                combined.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
                setPendingStartDate(combined);
                setEditedTask(prev => ({ ...prev, startTime: combined.toISOString() }));
            } else {
                setPendingStartDate(new Date(selectedDate));
                setEditedTask(prev => ({ ...prev, startTime: dateOnly }));
            }
            if (Platform.OS === 'android') setShowDatePicker(null);
            return;
        }

        if (currentMode === 'start-time') {
            const base = pendingStartDate ?? safeParseDate(editedTask.startTime) ?? new Date();
            const combined = new Date(base);
            combined.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
            setEditedTask(prev => ({ ...prev, startTime: combined.toISOString() }));
            setPendingStartDate(null);
            if (Platform.OS === 'android') setShowDatePicker(null);
            return;
        }

        if (currentMode === 'review') {
            setEditedTask(prev => ({ ...prev, reviewAt: selectedDate.toISOString() }));
            if (Platform.OS === 'android') setShowDatePicker(null);
            return;
        }

        if (currentMode === 'due') {
            const dateOnly = safeFormatDate(selectedDate, 'yyyy-MM-dd');
            const existing = editedTask.dueDate && hasTimeComponent(editedTask.dueDate)
                ? safeParseDate(editedTask.dueDate)
                : null;
            if (existing) {
                const combined = new Date(selectedDate);
                combined.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
                setPendingDueDate(combined);
                setEditedTask(prev => ({ ...prev, dueDate: combined.toISOString() }));
            } else {
                setPendingDueDate(new Date(selectedDate));
                setEditedTask(prev => ({ ...prev, dueDate: dateOnly }));
            }
            if (Platform.OS === 'android') setShowDatePicker(null);
            return;
        }

        // due-time (Android) - combine pending date with chosen time.
        const base = pendingDueDate ?? safeParseDate(editedTask.dueDate) ?? new Date();
        const combined = new Date(base);
        combined.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        setEditedTask(prev => ({ ...prev, dueDate: combined.toISOString() }));
        setPendingDueDate(null);
        if (Platform.OS === 'android') setShowDatePicker(null);
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return t('common.notSet');
        const parsed = safeParseDate(dateStr);
        if (!parsed) return t('common.notSet');
        return parsed.toLocaleDateString();
    };

    const formatStartDateTime = (dateStr?: string) => {
        if (!dateStr) return t('common.notSet');
        const parsed = safeParseDate(dateStr);
        if (!parsed) return t('common.notSet');
        const hasTime = hasTimeComponent(dateStr);
        if (!hasTime) return parsed.toLocaleDateString();
        return parsed.toLocaleString(undefined, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDueDate = (dateStr?: string) => {
        if (!dateStr) return t('common.notSet');
        const parsed = safeParseDueDate(dateStr);
        if (!parsed) return t('common.notSet');
        const hasTime = hasTimeComponent(dateStr);
        if (!hasTime) return parsed.toLocaleDateString();
        return parsed.toLocaleString(undefined, {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getSafePickerDateValue = (dateStr?: string) => {
        if (!dateStr) return new Date();
        const parsed = safeParseDate(dateStr);
        if (!parsed) return new Date();
        return parsed;
    };

    const formatTimeEstimateLabel = (value: TimeEstimate) => {
        if (value === '5min') return '5m';
        if (value === '10min') return '10m';
        if (value === '15min') return '15m';
        if (value === '30min') return '30m';
        if (value === '1hr') return '1h';
        if (value === '2hr') return '2h';
        if (value === '3hr') return '3h';
        if (value === '4hr') return '4h';
        return '4h+';
    };

    const defaultTimeEstimatePresets: TimeEstimate[] = ['10min', '30min', '1hr', '2hr', '3hr', '4hr', '4hr+'];
    const allTimeEstimates: TimeEstimate[] = ['5min', '10min', '15min', '30min', '1hr', '2hr', '3hr', '4hr', '4hr+'];
    const savedPresets = settings.gtd?.timeEstimatePresets;
    const basePresets = savedPresets?.length ? savedPresets : defaultTimeEstimatePresets;
    const normalizedPresets = allTimeEstimates.filter((value) => basePresets.includes(value));
    const currentEstimate = editedTask.timeEstimate as TimeEstimate | undefined;
    const effectivePresets = currentEstimate && !normalizedPresets.includes(currentEstimate)
        ? [...normalizedPresets, currentEstimate]
        : normalizedPresets;

    const timeEstimateOptions: { value: TimeEstimate | ''; label: string }[] = [
        { value: '', label: t('common.none') },
        ...effectivePresets.map((value) => ({ value, label: formatTimeEstimateLabel(value) })),
    ];
    const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

    const savedOrder = useMemo(() => settings.gtd?.taskEditor?.order ?? [], [settings.gtd?.taskEditor?.order]);
    const disabledFields = useMemo(() => {
        const next = new Set<TaskEditorFieldId>();
        if (!prioritiesEnabled) next.add('priority');
        if (!timeEstimatesEnabled) next.add('timeEstimate');
        return next;
    }, [prioritiesEnabled, timeEstimatesEnabled]);

    const taskEditorOrder = useMemo(() => {
        const known = new Set(DEFAULT_TASK_EDITOR_ORDER);
        const normalized = savedOrder.filter((id) => known.has(id));
        const missing = DEFAULT_TASK_EDITOR_ORDER.filter((id) => !normalized.includes(id));
        return [...normalized, ...missing].filter((id) => !disabledFields.has(id));
    }, [savedOrder, disabledFields]);

    const orderFields = useCallback(
        (fields: TaskEditorFieldId[]) => {
            const ordered = taskEditorOrder.filter((id) => fields.includes(id));
            const missing = fields.filter((id) => !ordered.includes(id));
            return [...ordered, ...missing];
        },
        [taskEditorOrder]
    );

    const alwaysFields = useMemo(
        () => orderFields(['status', 'project', 'dueDate']),
        [orderFields]
    );
    const schedulingFields = useMemo(
        () => orderFields(['startTime', 'recurrence', 'reviewAt']),
        [orderFields]
    );
    const organizationFields = useMemo(
        () => orderFields(['contexts', 'tags', 'priority', 'timeEstimate']),
        [orderFields]
    );
    const detailsFields = useMemo(
        () => orderFields(['description', 'checklist', 'attachments']),
        [orderFields]
    );

    const mergedTask = useMemo(() => ({
        ...(task ?? {}),
        ...editedTask,
    }), [task, editedTask]);

    const recurrenceOptions: { value: RecurrenceRule | ''; label: string }[] = [
        { value: '', label: t('recurrence.none') },
        ...RECURRENCE_RULES.map((rule) => ({
            value: rule,
            label: t(`recurrence.${rule}`),
        })),
    ];
    const recurrenceRuleValue = getRecurrenceRuleValue(editedTask.recurrence);
    const recurrenceStrategyValue = getRecurrenceStrategyValue(editedTask.recurrence);
    const recurrenceRRuleValue = getRecurrenceRRuleValue(editedTask.recurrence);
    const monthlyAnchorDate = useMemo(() => {
        return safeParseDate(editedTask.dueDate ?? task?.dueDate) ?? new Date();
    }, [editedTask.dueDate, task?.dueDate]);
    const monthlyWeekdayCode = WEEKDAY_ORDER[monthlyAnchorDate.getDay()];
    const monthlyPattern = useMemo(() => {
        if (recurrenceRuleValue !== 'monthly') return 'date';
        const parsed = parseRRuleString(recurrenceRRuleValue);
        const hasLast = parsed.byDay?.some((day) => String(day).startsWith('-1'));
        const hasNth = parsed.byDay?.some((day) => /^[1-4]/.test(String(day)));
        const hasByMonthDay = parsed.byMonthDay && parsed.byMonthDay.length > 0;
        const interval = parsed.interval && parsed.interval > 0 ? parsed.interval : 1;
        const isCustomDay = hasByMonthDay && parsed.byMonthDay?.[0] !== monthlyAnchorDate.getDate();
        return hasNth || hasLast || interval > 1 || isCustomDay ? 'custom' : 'date';
    }, [recurrenceRuleValue, recurrenceRRuleValue, monthlyAnchorDate]);

    const [customRecurrenceVisible, setCustomRecurrenceVisible] = useState(false);
    const [customInterval, setCustomInterval] = useState(1);
    const [customMode, setCustomMode] = useState<'date' | 'nth'>('date');
    const [customOrdinal, setCustomOrdinal] = useState<'1' | '2' | '3' | '4' | '-1'>('1');
    const [customWeekday, setCustomWeekday] = useState<RecurrenceWeekday>(monthlyWeekdayCode);
    const [customMonthDay, setCustomMonthDay] = useState<number>(monthlyAnchorDate.getDate());

    const openCustomRecurrence = useCallback(() => {
        const parsed = parseRRuleString(recurrenceRRuleValue);
        const interval = parsed.interval && parsed.interval > 0 ? parsed.interval : 1;
        let mode: 'date' | 'nth' = 'date';
        let ordinal: '1' | '2' | '3' | '4' | '-1' = '1';
        let weekday: RecurrenceWeekday = monthlyWeekdayCode;
        const monthDay = parsed.byMonthDay?.[0];
        if (monthDay) {
            mode = 'date';
            setCustomMonthDay(Math.min(Math.max(monthDay, 1), 31));
        }
        const token = parsed.byDay?.find((day) => /^(-1|1|2|3|4)/.test(String(day)));
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
        setCustomRecurrenceVisible(true);
    }, [monthlyAnchorDate, monthlyWeekdayCode, recurrenceRRuleValue]);

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
        setEditedTask(prev => ({
            ...prev,
            recurrence: {
                rule: 'monthly',
                strategy: recurrenceStrategyValue,
                ...(customMode === 'nth' ? { byDay: [`${customOrdinal}${customWeekday}` as RecurrenceByDay] } : {}),
                rrule,
            },
        }));
        setCustomRecurrenceVisible(false);
    }, [customInterval, customMode, customOrdinal, customWeekday, customMonthDay, recurrenceStrategyValue, setEditedTask]);

    const toggleContext = (tag: string) => {
        const current = editedTask.contexts || [];
        const exists = current.includes(tag);

        let newContexts;
        if (exists) {
            newContexts = current.filter(t => t !== tag);
        } else {
            newContexts = [...current, tag];
        }
        setEditedTask(prev => ({ ...prev, contexts: newContexts }));
    };

    const handleDone = () => {
        handleSave();
    };

    const setModeTab = useCallback((mode: TaskEditTab) => {
        setEditTab(mode);
    }, []);

    const [containerWidth, setContainerWidth] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;
    const scrollRef = useRef<ScrollView | null>(null);

    const scrollToTab = useCallback((mode: TaskEditTab, animated = true) => {
        if (!containerWidth) return;
        const x = mode === 'task' ? 0 : containerWidth;
        const node = scrollRef.current as unknown as {
            scrollTo?: (options: { x: number; animated?: boolean }) => void;
            getNode?: () => { scrollTo?: (options: { x: number; animated?: boolean }) => void };
        } | null;
        if (node?.scrollTo) {
            node.scrollTo({ x, animated });
            return;
        }
        node?.getNode?.()?.scrollTo?.({ x, animated });
    }, [containerWidth]);
    const swipeStartX = useRef(0);
    const swipeThreshold = containerWidth ? Math.max(32, containerWidth * 0.1) : 32;

    useEffect(() => {
        if (!visible || !containerWidth) return;
        const targetX = editTab === 'task' ? 0 : containerWidth;
        scrollX.setValue(targetX);
        scrollToTab(editTab, false);
    }, [containerWidth, editTab, scrollToTab, task?.id, visible, scrollX]);

    const handleTabPress = (mode: TaskEditTab) => {
        setModeTab(mode);
        scrollToTab(mode);
    };

    const applyChecklistUpdate = (nextChecklist: NonNullable<Task['checklist']>) => {
        setEditedTask(prev => {
            const currentStatus = (prev.status ?? task?.status ?? 'inbox') as TaskStatus;
            let nextStatus = currentStatus;
            const isListMode = (prev.taskMode ?? task?.taskMode) === 'list';
            if (isListMode) {
                const allComplete = nextChecklist.length > 0 && nextChecklist.every((item) => item.isCompleted);
                if (allComplete) {
                    nextStatus = 'done';
                } else if (currentStatus === 'done') {
                    nextStatus = 'next';
                }
            }
            return {
                ...prev,
                checklist: nextChecklist,
                status: nextStatus,
            };
        });
    };

    const handleResetChecklist = () => {
        const current = editedTask.checklist || [];
        if (current.length === 0 || !task) return;
        const reset = current.map((item) => ({ ...item, isCompleted: false }));
        applyChecklistUpdate(reset);
        resetTaskChecklist(task.id).catch(console.error);
    };

    const handleDuplicateTask = async () => {
        if (!task) return;
        await duplicateTask(task.id, false).catch(console.error);
        Alert.alert(t('taskEdit.duplicateDoneTitle'), t('taskEdit.duplicateDoneBody'));
    };

    const handleDeleteTask = async () => {
        if (!task) return;
        await deleteTask(task.id).catch(console.error);
        onClose();
    };

    const getAIProvider = async () => {
        if (!aiEnabled) {
            Alert.alert(t('ai.disabledTitle'), t('ai.disabledBody'));
            return null;
        }
        const provider = (settings.ai?.provider ?? 'openai') as AIProviderId;
        const apiKey = await loadAIKey(provider);
        if (!apiKey) {
            Alert.alert(t('ai.missingKeyTitle'), t('ai.missingKeyBody'));
            return null;
        }
        return createAIProvider(buildAIConfig(settings, apiKey));
    };

    const applyAISuggestion = (suggested: { title?: string; context?: string; timeEstimate?: TimeEstimate }) => {
        setEditedTask((prev) => {
            const nextContexts = suggested.context
                ? Array.from(new Set([...(prev.contexts ?? []), suggested.context]))
                : prev.contexts;
            return {
                ...prev,
                title: suggested.title ?? prev.title,
                timeEstimate: suggested.timeEstimate ?? prev.timeEstimate,
                contexts: nextContexts,
            };
        });
    };

    const handleAIClarify = async () => {
        if (!task || isAIWorking) return;
        const title = String(editedTask.title ?? task.title ?? '').trim();
        if (!title) return;
        setIsAIWorking(true);
        try {
            const provider = await getAIProvider();
            if (!provider) return;
            const contextOptions = Array.from(new Set([
                ...PRESET_CONTEXTS,
                ...suggestedTags,
                ...(editedTask.contexts ?? []),
            ]));
            const response = await provider.clarifyTask({
                title,
                contexts: contextOptions,
                ...(projectContext ?? {}),
            });
            const actions: AIResponseAction[] = response.options.slice(0, 3).map((option) => ({
                label: option.label,
                onPress: () => {
                    setEditedTask((prev) => ({ ...prev, title: option.action }));
                    closeAIModal();
                },
            }));
            if (response.suggestedAction?.title) {
                actions.push({
                    label: t('ai.applySuggestion'),
                    variant: 'primary',
                    onPress: () => {
                        applyAISuggestion(response.suggestedAction!);
                        closeAIModal();
                    },
                });
            }
            actions.push({
                label: t('common.cancel'),
                variant: 'secondary',
                onPress: closeAIModal,
            });
            setAiModal({
                title: response.question || t('taskEdit.aiClarify'),
                actions,
            });
        } catch (error) {
            console.warn(error);
            Alert.alert(t('ai.errorTitle'), t('ai.errorBody'));
        } finally {
            setIsAIWorking(false);
        }
    };

    const handleAIBreakdown = async () => {
        if (!task || isAIWorking) return;
        const title = String(editedTask.title ?? task.title ?? '').trim();
        if (!title) return;
        setIsAIWorking(true);
        try {
            const provider = await getAIProvider();
            if (!provider) return;
            const response = await provider.breakDownTask({
                title,
                description: String(editedTask.description ?? ''),
                ...(projectContext ?? {}),
            });
            const steps = response.steps.map((step) => step.trim()).filter(Boolean).slice(0, 8);
            if (steps.length === 0) return;
            setAiModal({
                title: t('ai.breakdownTitle'),
                message: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
                actions: [
                    {
                        label: t('common.cancel'),
                        variant: 'secondary',
                        onPress: closeAIModal,
                    },
                    {
                        label: t('ai.addSteps'),
                        variant: 'primary',
                        onPress: () => {
                            const newItems = steps.map((step) => ({
                                id: generateUUID(),
                                title: step,
                                isCompleted: false,
                            }));
                            applyChecklistUpdate([...(editedTask.checklist || []), ...newItems]);
                            closeAIModal();
                        },
                    },
                ],
            });
        } catch (error) {
            console.warn(error);
            Alert.alert(t('ai.errorTitle'), t('ai.errorBody'));
        } finally {
            setIsAIWorking(false);
        }
    };

    const inputStyle = { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text };
    const getStatusChipStyle = (active: boolean) => ([
        styles.statusChip,
        { backgroundColor: active ? tc.tint : tc.filterBg, borderColor: active ? tc.tint : tc.border },
    ]);
    const getStatusTextStyle = (active: boolean) => ([
        styles.statusText,
        { color: active ? '#fff' : tc.secondaryText },
    ]);
    const getSuggestionChipStyle = (active: boolean) => ([
        styles.suggestionChip,
        { backgroundColor: active ? tc.tint : tc.filterBg, borderColor: active ? tc.tint : tc.border },
    ]);
    const getSuggestionTextStyle = (active: boolean) => ([
        styles.suggestionText,
        { color: active ? '#fff' : tc.secondaryText },
    ]);

    const renderField = (fieldId: TaskEditorFieldId) => {
        switch (fieldId) {
            case 'status':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.statusLabel')}</Text>
                        <View style={styles.statusContainerCompact}>
                            {STATUS_OPTIONS.map(status => (
                                <TouchableOpacity
                                    key={status}
                                    style={[styles.statusChipCompact, ...getStatusChipStyle(editedTask.status === status)]}
                                    onPress={() => setEditedTask(prev => ({ ...prev, status }))}
                                >
                                    <Text style={getStatusTextStyle(editedTask.status === status)}>
                                        {COMPACT_STATUS_LABELS[status] ?? t(`status.${status}`)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                );
            case 'project':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.projectLabel')}</Text>
                        <View style={styles.dateRow}>
                            <TouchableOpacity
                                style={[styles.dateBtn, styles.flex1, { backgroundColor: tc.inputBg, borderColor: tc.border }]}
                                onPress={() => setShowProjectPicker(true)}
                            >
                                <Text style={{ color: tc.text }}>
                                    {projects.find((p) => p.id === editedTask.projectId)?.title || t('taskEdit.noProjectOption')}
                                </Text>
                            </TouchableOpacity>
                            {!!editedTask.projectId && (
                                <TouchableOpacity
                                    style={[styles.clearDateBtn, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={() => setEditedTask(prev => ({ ...prev, projectId: undefined }))}
                                >
                                    <Text style={[styles.clearDateText, { color: tc.secondaryText }]}>{t('common.clear')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                );
            case 'priority':
                if (!prioritiesEnabled) return null;
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.priorityLabel')}</Text>
                        <View style={styles.statusContainer}>
                            <TouchableOpacity
                                style={getStatusChipStyle(!editedTask.priority)}
                                onPress={() => setEditedTask(prev => ({ ...prev, priority: undefined }))}
                            >
                                <Text style={getStatusTextStyle(!editedTask.priority)}>
                                    {t('common.none')}
                                </Text>
                            </TouchableOpacity>
                            {priorityOptions.map(priority => (
                                <TouchableOpacity
                                    key={priority}
                                    style={getStatusChipStyle(editedTask.priority === priority)}
                                    onPress={() => setEditedTask(prev => ({ ...prev, priority }))}
                                >
                                    <Text style={getStatusTextStyle(editedTask.priority === priority)}>
                                        {t(`priority.${priority}`)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                );
            case 'contexts':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.contextsLabel')}</Text>
                        <TextInput
                            style={[styles.input, inputStyle]}
                            value={editedTask.contexts?.join(', ')}
                            onChangeText={(text) => setEditedTask(prev => ({
                                ...prev,
                                contexts: text.split(',').map(t => t.trim()).filter(Boolean)
                            }))}
                            placeholder="@home, @work"
                            autoCapitalize="none"
                            placeholderTextColor={tc.secondaryText}
                        />
                        <View style={styles.suggestionsContainer}>
                            <View style={styles.suggestionTags}>
                                {visibleContextSuggestions.map(tag => {
                                    const isActive = Boolean(editedTask.contexts?.includes(tag));
                                    return (
                                        <TouchableOpacity
                                            key={tag}
                                            style={getSuggestionChipStyle(isActive)}
                                            onPress={() => toggleContext(tag)}
                                        >
                                            <Text style={getSuggestionTextStyle(isActive)}>{tag}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                                {!showAllContexts && suggestedTags.length > MAX_VISIBLE_SUGGESTIONS && (
                                    <TouchableOpacity
                                        style={getSuggestionChipStyle(false)}
                                        onPress={() => setShowAllContexts(true)}
                                    >
                                        <Text style={getSuggestionTextStyle(false)}>
                                            +{suggestedTags.length - MAX_VISIBLE_SUGGESTIONS}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                );
            case 'tags':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.tagsLabel')}</Text>
                        <TextInput
                            style={[styles.input, inputStyle]}
                            value={editedTask.tags?.join(', ')}
                            onChangeText={(text) => setEditedTask(prev => ({
                                ...prev,
                                tags: text.split(',').map(t => t.trim()).filter(Boolean)
                            }))}
                            placeholder="#urgent, #idea"
                            autoCapitalize="none"
                            placeholderTextColor={tc.secondaryText}
                        />
                        <View style={styles.suggestionsContainer}>
                            <View style={styles.suggestionTags}>
                                {visibleTagSuggestions.map(tag => {
                                    const isActive = Boolean(editedTask.tags?.includes(tag));
                                    return (
                                        <TouchableOpacity
                                            key={tag}
                                            style={getSuggestionChipStyle(isActive)}
                                            onPress={() => {
                                                const current = editedTask.tags || [];
                                                const newTags = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
                                                setEditedTask(prev => ({ ...prev, tags: newTags }));
                                            }}
                                        >
                                            <Text style={getSuggestionTextStyle(isActive)}>{tag}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                                {!showAllTags && suggestedHashtags.length > MAX_VISIBLE_SUGGESTIONS && (
                                    <TouchableOpacity
                                        style={getSuggestionChipStyle(false)}
                                        onPress={() => setShowAllTags(true)}
                                    >
                                        <Text style={getSuggestionTextStyle(false)}>
                                            +{suggestedHashtags.length - MAX_VISIBLE_SUGGESTIONS}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                );
            case 'timeEstimate':
                if (!timeEstimatesEnabled) return null;
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.timeEstimateLabel')}</Text>
                        <View style={styles.statusContainer}>
                            {timeEstimateOptions.map(opt => (
                                <TouchableOpacity
                                    key={opt.value || 'none'}
                                    style={getStatusChipStyle(
                                        editedTask.timeEstimate === opt.value || (!opt.value && !editedTask.timeEstimate)
                                    )}
                                    onPress={() => setEditedTask(prev => ({ ...prev, timeEstimate: opt.value || undefined }))}
                                >
                                    <Text style={getStatusTextStyle(
                                        editedTask.timeEstimate === opt.value || (!opt.value && !editedTask.timeEstimate)
                                    )}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                );
            case 'recurrence':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.recurrenceLabel')}</Text>
                        <View style={styles.statusContainer}>
                            {recurrenceOptions.map(opt => (
                                <TouchableOpacity
                                    key={opt.value || 'none'}
                                    style={getStatusChipStyle(
                                        recurrenceRuleValue === opt.value || (!opt.value && !recurrenceRuleValue)
                                    )}
                                    onPress={() => {
                                        if (opt.value !== 'weekly') {
                                            setCustomWeekdays([]);
                                        }
                                        if (opt.value === 'monthly') {
                                            setEditedTask(prev => ({
                                                ...prev,
                                                recurrence: {
                                                    rule: 'monthly',
                                                    strategy: recurrenceStrategyValue,
                                                    rrule: buildRRuleString('monthly'),
                                                },
                                            }));
                                            return;
                                        }
                                        setEditedTask(prev => ({
                                            ...prev,
                                            recurrence: buildRecurrenceValue(opt.value as RecurrenceRule | '', recurrenceStrategyValue),
                                        }));
                                    }}
                                >
                                    <Text style={getStatusTextStyle(
                                        recurrenceRuleValue === opt.value || (!opt.value && !recurrenceRuleValue)
                                    )}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {recurrenceRuleValue === 'weekly' && (
                            <View style={[styles.weekdayRow, { marginTop: 10 }]}>
                                {WEEKDAY_BUTTONS.map((day) => {
                                    const active = customWeekdays.includes(day.key);
                                    return (
                                        <TouchableOpacity
                                            key={day.key}
                                            style={[
                                                styles.weekdayButton,
                                                {
                                                    borderColor: tc.border,
                                                    backgroundColor: active ? tc.filterBg : tc.cardBg,
                                                },
                                            ]}
                                            onPress={() => {
                                                const next = active
                                                    ? customWeekdays.filter((d) => d !== day.key)
                                                    : [...customWeekdays, day.key];
                                                setCustomWeekdays(next);
                                                setEditedTask(prev => ({
                                                    ...prev,
                                                    recurrence: {
                                                        rule: 'weekly',
                                                        strategy: recurrenceStrategyValue,
                                                        byDay: next,
                                                        rrule: buildRRuleString('weekly', next),
                                                    },
                                                }));
                                            }}
                                        >
                                            <Text style={[styles.weekdayButtonText, { color: tc.text }]}>{day.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                        {recurrenceRuleValue === 'monthly' && (
                            <View style={[styles.statusContainer, { marginTop: 8 }]}>
                                <TouchableOpacity
                                    style={getStatusChipStyle(monthlyPattern === 'date')}
                                    onPress={() => {
                                        setEditedTask(prev => ({
                                            ...prev,
                                            recurrence: {
                                                rule: 'monthly',
                                                strategy: recurrenceStrategyValue,
                                                rrule: buildRRuleString('monthly'),
                                            },
                                        }));
                                    }}
                                >
                                    <Text style={getStatusTextStyle(monthlyPattern === 'date')}>
                                        {t('recurrence.monthlyOnDay')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={getStatusChipStyle(monthlyPattern === 'custom')}
                                    onPress={openCustomRecurrence}
                                >
                                    <Text style={getStatusTextStyle(monthlyPattern === 'custom')}>
                                        {t('recurrence.custom')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {!!recurrenceRuleValue && (
                            <View style={[styles.statusContainer, { marginTop: 8 }]}>
                                <TouchableOpacity
                                    style={getStatusChipStyle(recurrenceStrategyValue === 'fluid')}
                                    onPress={() => {
                                        const nextStrategy: RecurrenceStrategy = recurrenceStrategyValue === 'fluid' ? 'strict' : 'fluid';
                                        setEditedTask(prev => ({
                                            ...prev,
                                            recurrence:
                                                recurrenceRuleValue === 'weekly' && customWeekdays.length > 0
                                                    ? {
                                                        rule: 'weekly',
                                                        strategy: nextStrategy,
                                                        byDay: customWeekdays,
                                                        rrule: buildRRuleString('weekly', customWeekdays),
                                                    }
                                                    : recurrenceRuleValue && recurrenceRRuleValue
                                                        ? { rule: recurrenceRuleValue, strategy: nextStrategy, ...(parseRRuleString(recurrenceRRuleValue).byDay ? { byDay: parseRRuleString(recurrenceRRuleValue).byDay } : {}), rrule: recurrenceRRuleValue }
                                                        : buildRecurrenceValue(recurrenceRuleValue, nextStrategy),
                                        }));
                                    }}
                                >
                                    <Text style={getStatusTextStyle(recurrenceStrategyValue === 'fluid')}>
                                        {t('recurrence.afterCompletion')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                );
            case 'startTime':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.startDateLabel')}</Text>
                        {(() => {
                            const parsed = editedTask.startTime ? safeParseDate(editedTask.startTime) : null;
                            const hasTime = hasTimeComponent(editedTask.startTime);
                            const dateOnly = parsed ? safeFormatDate(parsed, 'yyyy-MM-dd') : '';
                            const timeOnly = hasTime && parsed ? safeFormatDate(parsed, 'HH:mm') : '';
                            return (
                        <View style={styles.dateRow}>
                            <TouchableOpacity style={[styles.dateBtn, styles.flex1, { backgroundColor: tc.inputBg, borderColor: tc.border }]} onPress={() => setShowDatePicker('start')}>
                                <Text style={{ color: tc.text }}>{formatStartDateTime(editedTask.startTime)}</Text>
                            </TouchableOpacity>
                            {!!editedTask.startTime && (
                                <TouchableOpacity
                                    style={[styles.clearDateBtn, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={() => setShowDatePicker('start-time')}
                                >
                                    <Text style={[styles.clearDateText, { color: tc.secondaryText }]}>
                                        {hasTime && timeOnly ? timeOnly : (t('calendar.changeTime') || 'Add time')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            {!!editedTask.startTime && (
                                <TouchableOpacity
                                    style={[styles.clearDateBtn, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={() => setEditedTask(prev => ({ ...prev, startTime: undefined }))}
                                >
                                    <Text style={[styles.clearDateText, { color: tc.secondaryText }]}>{t('common.clear')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                            );
                        })()}
                    </View>
                );
            case 'dueDate':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.dueDateLabel')}</Text>
                        {(() => {
                            const parsed = editedTask.dueDate ? safeParseDate(editedTask.dueDate) : null;
                            const hasTime = hasTimeComponent(editedTask.dueDate);
                            const dateOnly = parsed ? safeFormatDate(parsed, 'yyyy-MM-dd') : '';
                            const timeOnly = hasTime && parsed ? safeFormatDate(parsed, 'HH:mm') : '';
                            return (
                        <View style={styles.dateRow}>
                            <TouchableOpacity style={[styles.dateBtn, styles.flex1, { backgroundColor: tc.inputBg, borderColor: tc.border }]} onPress={() => setShowDatePicker('due')}>
                                <Text style={{ color: tc.text }}>{formatDueDate(editedTask.dueDate)}</Text>
                            </TouchableOpacity>
                            {!!editedTask.dueDate && (
                                <TouchableOpacity
                                    style={[styles.clearDateBtn, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={() => setShowDatePicker('due-time')}
                                >
                                    <Text style={[styles.clearDateText, { color: tc.secondaryText }]}>
                                        {hasTime && timeOnly ? timeOnly : (t('calendar.changeTime') || 'Add time')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            {!!editedTask.dueDate && (
                                <TouchableOpacity
                                    style={[styles.clearDateBtn, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={() => setEditedTask(prev => ({ ...prev, dueDate: undefined }))}
                                >
                                    <Text style={[styles.clearDateText, { color: tc.secondaryText }]}>{t('common.clear')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                            );
                        })()}
                    </View>
                );
            case 'reviewAt':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.reviewDateLabel')}</Text>
                        <View style={styles.dateRow}>
                            <TouchableOpacity style={[styles.dateBtn, styles.flex1, { backgroundColor: tc.inputBg, borderColor: tc.border }]} onPress={() => setShowDatePicker('review')}>
                                <Text style={{ color: tc.text }}>{formatDate(editedTask.reviewAt)}</Text>
                            </TouchableOpacity>
                            {!!editedTask.reviewAt && (
                                <TouchableOpacity
                                    style={[styles.clearDateBtn, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={() => setEditedTask(prev => ({ ...prev, reviewAt: undefined }))}
                                >
                                    <Text style={[styles.clearDateText, { color: tc.secondaryText }]}>{t('common.clear')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                );
            case 'description':
                return (
                    <View style={styles.formGroup}>
                        <View style={styles.inlineHeader}>
                            <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.descriptionLabel')}</Text>
                            <TouchableOpacity onPress={() => setShowDescriptionPreview((v) => !v)}>
                                <Text style={[styles.inlineAction, { color: tc.tint }]}>
                                    {showDescriptionPreview ? t('markdown.edit') : t('markdown.preview')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        {showDescriptionPreview ? (
                            <View style={[styles.markdownPreview, { backgroundColor: tc.filterBg, borderColor: tc.border }]}>
                                <MarkdownText markdown={editedTask.description || ''} tc={tc} />
                            </View>
                        ) : (
                            <TextInput
                                style={[styles.input, styles.textArea, inputStyle]}
                                value={editedTask.description || ''}
                                onChangeText={(text) => {
                                    setEditedTask(prev => ({ ...prev, description: text }));
                                    resetCopilotDraft();
                                }}
                                placeholder={t('taskEdit.descriptionPlaceholder')}
                                multiline
                                placeholderTextColor={tc.secondaryText}
                            />
                        )}
                    </View>
                );
            case 'attachments':
                return (
                    <View style={styles.formGroup}>
                        <View style={styles.inlineHeader}>
                            <Text style={[styles.label, { color: tc.secondaryText }]}>{t('attachments.title')}</Text>
                            <View style={styles.inlineActions}>
                                <TouchableOpacity
                                    onPress={addFileAttachment}
                                    style={[styles.smallButton, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                >
                                    <Text style={[styles.smallButtonText, { color: tc.tint }]}>{t('attachments.addFile')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={addImageAttachment}
                                    style={[styles.smallButton, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                >
                                    <Text style={[styles.smallButtonText, { color: tc.tint }]}>{t('attachments.addPhoto')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setLinkModalVisible(true)}
                                    style={[styles.smallButton, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                >
                                    <Text style={[styles.smallButtonText, { color: tc.tint }]}>{t('attachments.addLink')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {visibleAttachments.length === 0 ? (
                            <Text style={[styles.helperText, { color: tc.secondaryText }]}>{t('common.none')}</Text>
                        ) : (
                            <View style={[styles.attachmentsList, { borderColor: tc.border, backgroundColor: tc.cardBg }]}>
                                {visibleAttachments.map((attachment) => (
                                    <View key={attachment.id} style={[styles.attachmentRow, { borderBottomColor: tc.border }]}>
                                        <TouchableOpacity
                                            style={styles.attachmentTitleWrap}
                                            onPress={() => openAttachment(attachment)}
                                        >
                                            <Text style={[styles.attachmentTitle, { color: tc.tint }]} numberOfLines={1}>
                                                {attachment.title}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => removeAttachment(attachment.id)}>
                                            <Text style={[styles.attachmentRemove, { color: tc.secondaryText }]}>
                                                {t('attachments.remove')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                );
            case 'checklist':
                return (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.checklist')}</Text>
                        <View style={[styles.checklistContainer, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>
                            {editedTask.checklist?.map((item, index) => (
                                <View key={item.id || index} style={[styles.checklistItem, { borderBottomColor: tc.border }]}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            const newChecklist = (editedTask.checklist || []).map((item, i) =>
                                                i === index ? { ...item, isCompleted: !item.isCompleted } : item
                                            );
                                            setEditedTask(prev => ({ ...prev, checklist: newChecklist }));
                                        }}
                                        style={styles.checkboxTouch}
                                    >
                                        <View style={[styles.checkbox, item.isCompleted && styles.checkboxChecked]}>
                                            {item.isCompleted && <Text style={styles.checkmark}>✓</Text>}
                                        </View>
                                    </TouchableOpacity>
                                    <TextInput
                                        style={[
                                            styles.checklistInput,
                                            { color: item.isCompleted ? tc.secondaryText : tc.text },
                                            item.isCompleted && styles.completedText,
                                        ]}
                                        value={item.title}
                                        onChangeText={(text) => {
                                            const newChecklist = (editedTask.checklist || []).map((item, i) =>
                                                i === index ? { ...item, title: text } : item
                                            );
                                            setEditedTask(prev => ({ ...prev, checklist: newChecklist }));
                                        }}
                                        placeholder={t('taskEdit.itemNamePlaceholder')}
                                        placeholderTextColor={tc.secondaryText}
                                    />
                                    <TouchableOpacity
                                        onPress={() => {
                                            const newChecklist = (editedTask.checklist || []).filter((_, i) => i !== index);
                                            setEditedTask(prev => ({ ...prev, checklist: newChecklist }));
                                        }}
                                        style={styles.deleteBtn}
                                    >
                                        <Text style={[styles.deleteBtnText, { color: tc.secondaryText }]}>×</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <TouchableOpacity
                                style={styles.addChecklistBtn}
                                onPress={() => {
                                    const newItem = {
                                        id: generateUUID(),
                                        title: '',
                                        isCompleted: false
                                    };
                                    setEditedTask(prev => ({
                                        ...prev,
                                        checklist: [...(prev.checklist || []), newItem]
                                    }));
                                }}
                            >
                                <Text style={styles.addChecklistText}>+ {t('taskEdit.addItem')}</Text>
                            </TouchableOpacity>
                            {(editedTask.checklist?.length ?? 0) > 0 && (
                                <View style={styles.checklistActions}>
                                    <TouchableOpacity
                                        style={[styles.checklistActionButton, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                        onPress={handleResetChecklist}
                                    >
                                        <Text style={[styles.checklistActionText, { color: tc.secondaryText }]}>
                                            {t('taskEdit.resetChecklist')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    if (!task) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleDone}
        >
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
                <TaskEditHeader
                    title={String(editedTask.title || '').trim() || t('taskEdit.title')}
                    onDone={handleDone}
                    onShare={handleShare}
                    onDuplicate={handleDuplicateTask}
                    onDelete={handleDeleteTask}
                />

                <TaskEditTabs
                    editTab={editTab}
                    onTabPress={handleTabPress}
                    scrollX={scrollX}
                    containerWidth={containerWidth}
                />

                <View
                    style={styles.tabContent}
                    onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
                >
                    <Animated.ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        scrollEnabled
                        snapToInterval={containerWidth || 1}
                        snapToAlignment="start"
                        decelerationRate="fast"
                        disableIntervalMomentum
                        scrollEventThrottle={16}
                        showsHorizontalScrollIndicator={false}
                        directionalLockEnabled
                        onScrollBeginDrag={(event) => {
                            swipeStartX.current = event.nativeEvent.contentOffset.x;
                        }}
                        onScrollEndDrag={(event) => {
                            if (!containerWidth) return;
                            const velocityX = event.nativeEvent.velocity?.x ?? 0;
                            if (Math.abs(velocityX) > 0.05) return;
                            const offsetX = event.nativeEvent.contentOffset.x;
                            const deltaX = offsetX - swipeStartX.current;
                            if (Math.abs(deltaX) >= swipeThreshold) {
                                const target = deltaX > 0 ? 'view' : 'task';
                                scrollToTab(target);
                                setModeTab(target);
                                return;
                            }
                            scrollToTab(editTab);
                        }}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            { useNativeDriver: true }
                        )}
                        onMomentumScrollEnd={(event) => {
                            if (!containerWidth) return;
                            const offsetX = event.nativeEvent.contentOffset.x;
                            setModeTab(offsetX >= containerWidth * 0.5 ? 'view' : 'task');
                        }}
                    >
                        <TaskEditFormTab
                            t={t}
                            tc={tc}
                            styles={styles}
                            inputStyle={inputStyle}
                            editedTask={editedTask}
                            setEditedTask={setEditedTask}
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
                            copilotTags={copilotTags}
                            timeEstimatesEnabled={timeEstimatesEnabled}
                            renderField={renderField}
                            alwaysFields={alwaysFields}
                            schedulingFields={schedulingFields}
                            organizationFields={organizationFields}
                            detailsFields={detailsFields}
                            showDatePicker={showDatePicker}
                            pendingStartDate={pendingStartDate}
                            pendingDueDate={pendingDueDate}
                            getSafePickerDateValue={getSafePickerDateValue}
                            onDateChange={onDateChange}
                            onCloseDatePicker={() => setShowDatePicker(null)}
                            containerWidth={containerWidth}
                        />
                        <View style={[styles.tabPage, { width: containerWidth || '100%' }]}>
                            <TaskEditViewTab
                                t={t}
                                tc={tc}
                                styles={styles}
                                mergedTask={mergedTask}
                                projects={projects}
                                prioritiesEnabled={prioritiesEnabled}
                                timeEstimatesEnabled={timeEstimatesEnabled}
                                formatTimeEstimateLabel={formatTimeEstimateLabel}
                                formatDate={formatDate}
                                formatDueDate={formatDueDate}
                                getRecurrenceRuleValue={getRecurrenceRuleValue}
                                getRecurrenceStrategyValue={getRecurrenceStrategyValue}
                                applyChecklistUpdate={applyChecklistUpdate}
                                visibleAttachments={visibleAttachments}
                                openAttachment={openAttachment}
                                isImageAttachment={isImageAttachment}
                                nestedScrollEnabled
                            />
                        </View>
                    </Animated.ScrollView>
                </View>

                <Modal
                    visible={linkModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setLinkModalVisible(false)}
                >
                    <View style={styles.overlay}>
                        <View style={[styles.modalCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>
                            <Text style={[styles.modalTitle, { color: tc.text }]}>{t('attachments.addLink')}</Text>
                            <TextInput
                                value={linkInput}
                                onChangeText={setLinkInput}
                                placeholder={t('attachments.linkPlaceholder')}
                                placeholderTextColor={tc.secondaryText}
                                style={[styles.modalInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    onPress={() => {
                                        setLinkModalVisible(false);
                                        setLinkInput('');
                                    }}
                                    style={styles.modalButton}
                                >
                                    <Text style={[styles.modalButtonText, { color: tc.secondaryText }]}>{t('common.cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={confirmAddLink}
                                    disabled={!linkInput.trim()}
                                    style={[styles.modalButton, !linkInput.trim() && styles.modalButtonDisabled]}
                                >
                                    <Text style={[styles.modalButtonText, { color: tc.tint }]}>{t('common.save')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
                <Modal
                    visible={customRecurrenceVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setCustomRecurrenceVisible(false)}
                >
                    <Pressable style={styles.overlay} onPress={() => setCustomRecurrenceVisible(false)}>
                        <Pressable
                            style={[styles.modalCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                            onPress={(event) => event.stopPropagation()}
                        >
                            <Text style={[styles.modalTitle, { color: tc.text }]}>{t('recurrence.customTitle')}</Text>
                            <View style={[styles.customRow, { borderColor: tc.border }]}>
                                <Text style={[styles.modalLabel, { color: tc.secondaryText }]}>{t('recurrence.repeatEvery')}</Text>
                                <TextInput
                                    value={String(customInterval)}
                                    onChangeText={(value) => {
                                        const parsed = Number.parseInt(value, 10);
                                        setCustomInterval(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
                                    }}
                                    keyboardType="number-pad"
                                    style={[styles.customInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                />
                                <Text style={[styles.modalLabel, { color: tc.secondaryText }]}>{t('recurrence.monthUnit')}</Text>
                            </View>
                            <View style={{ marginTop: 12 }}>
                                <Text style={[styles.modalLabel, { color: tc.secondaryText }]}>{t('recurrence.onLabel')}</Text>
                                <View style={[styles.statusContainer, { marginTop: 8 }]}>
                                    <TouchableOpacity
                                        style={getStatusChipStyle(customMode === 'date')}
                                        onPress={() => setCustomMode('date')}
                                    >
                                        <Text style={getStatusTextStyle(customMode === 'date')}>
                                            {t('recurrence.onDayOfMonth').replace('{day}', String(customMonthDay))}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={getStatusChipStyle(customMode === 'nth')}
                                        onPress={() => setCustomMode('nth')}
                                    >
                                        <Text style={getStatusTextStyle(customMode === 'nth')}>
                                            {t('recurrence.onNthWeekday')
                                                .replace('{ordinal}', t(`recurrence.ordinal.${customOrdinal === '-1' ? 'last' : customOrdinal === '1' ? 'first' : customOrdinal === '2' ? 'second' : customOrdinal === '3' ? 'third' : 'fourth'}`))
                                                .replace('{weekday}', MONTHLY_WEEKDAY_LABELS[customWeekday] ?? customWeekday)}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                {customMode === 'nth' && (
                                    <>
                                        <View style={[styles.weekdayRow, { marginTop: 10, flexWrap: 'wrap' }]}>
                                        {(['1', '2', '3', '4', '-1'] as const).map((value) => {
                                            const label = value === '-1' ? 'Last' : `${value}${value === '1' ? 'st' : value === '2' ? 'nd' : value === '3' ? 'rd' : 'th'}`;
                                                return (
                                                    <TouchableOpacity
                                                        key={value}
                                                        style={[
                                                            styles.ordinalButton,
                                                            {
                                                                borderColor: tc.border,
                                                                backgroundColor: customOrdinal === value ? tc.filterBg : tc.cardBg,
                                                            },
                                                        ]}
                                                        onPress={() => setCustomOrdinal(value)}
                                                    >
                                                    <Text style={[styles.weekdayButtonText, { color: tc.text }]}>{label}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                        </View>
                                        <View style={[styles.weekdayRow, { marginTop: 10 }]}>
                                            {WEEKDAY_BUTTONS.map((day) => {
                                                const active = customWeekday === day.key;
                                                return (
                                                    <TouchableOpacity
                                                        key={day.key}
                                                        style={[
                                                            styles.weekdayButton,
                                                            {
                                                                borderColor: tc.border,
                                                                backgroundColor: active ? tc.filterBg : tc.cardBg,
                                                            },
                                                        ]}
                                                        onPress={() => setCustomWeekday(day.key)}
                                                    >
                                                        <Text style={[styles.weekdayButtonText, { color: tc.text }]}>{day.label}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </>
                                )}
                                {customMode === 'date' && (
                                    <View style={[styles.customRow, { marginTop: 10 }]}>
                                        <Text style={[styles.modalLabel, { color: tc.secondaryText }]}>
                                            {t('recurrence.onDayOfMonth').replace('{day}', '')}
                                        </Text>
                                        <TextInput
                                            value={String(customMonthDay)}
                                            onChangeText={(value) => {
                                                const parsed = Number.parseInt(value, 10);
                                                if (!Number.isFinite(parsed)) {
                                                    setCustomMonthDay(1);
                                                } else {
                                                    setCustomMonthDay(Math.min(Math.max(parsed, 1), 31));
                                                }
                                            }}
                                            keyboardType="number-pad"
                                            style={[styles.customInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                        />
                                    </View>
                                )}
                            </View>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={styles.modalButton}
                                    onPress={() => setCustomRecurrenceVisible(false)}
                                >
                                    <Text style={[styles.modalButtonText, { color: tc.secondaryText }]}>{t('common.cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.modalButton}
                                    onPress={applyCustomRecurrence}
                                >
                                    <Text style={[styles.modalButtonText, { color: tc.tint }]}>{t('common.save')}</Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>

                <TaskEditProjectPicker
                    visible={showProjectPicker}
                    projects={projects}
                    tc={tc}
                    t={t}
                    onClose={() => setShowProjectPicker(false)}
                    onSelectProject={(projectId) => {
                        setEditedTask(prev => ({ ...prev, projectId }));
                    }}
                    onCreateProject={(title) => addProject(title, '#94a3b8')}
                />

                {aiModal && (
                    <AIResponseModal
                        visible={Boolean(aiModal)}
                        title={aiModal.title}
                        message={aiModal.message}
                        actions={aiModal.actions}
                        onClose={closeAIModal}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}
