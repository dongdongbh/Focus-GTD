import type { AppData, TaskEditorFieldId } from '@mindwtr/core';
import { translateText } from '@mindwtr/core';

import { cn } from '../../../lib/utils';
import type { Language } from '../../../contexts/language-context';

type Labels = {
    autoArchive: string;
    autoArchiveDesc: string;
    autoArchiveNever: string;
    on: string;
    off: string;
    taskEditorLayout: string;
    taskEditorLayoutDesc: string;
    taskEditorLayoutHint: string;
    taskEditorLayoutReset: string;
    taskEditorFieldStatus: string;
    taskEditorFieldProject: string;
    taskEditorFieldPriority: string;
    taskEditorFieldContexts: string;
    taskEditorFieldDescription: string;
    taskEditorFieldTags: string;
    taskEditorFieldTimeEstimate: string;
    taskEditorFieldRecurrence: string;
    taskEditorFieldStartTime: string;
    taskEditorFieldDueDate: string;
    taskEditorFieldReviewAt: string;
    taskEditorFieldAttachments: string;
    taskEditorFieldChecklist: string;
    visible: string;
    hidden: string;
};

type SettingsGtdPageProps = {
    t: Labels;
    language: Language;
    settings: AppData['settings'];
    updateSettings: (updates: Partial<AppData['settings']>) => Promise<void>;
    showSaved: () => void;
    autoArchiveDays: number;
};

export function SettingsGtdPage({
    t,
    language,
    settings,
    updateSettings,
    showSaved,
    autoArchiveDays,
}: SettingsGtdPageProps) {
    const autoArchiveOptions = [0, 1, 3, 7, 14, 30, 60];
    const formatArchiveLabel = (days: number) => {
        if (days <= 0) return t.autoArchiveNever;
        const dayLabelMap: Record<Language, string> = {
            en: 'days',
            zh: '天',
            es: 'días',
            hi: 'दिन',
            ar: 'أيام',
            de: translateText('days', 'de'),
            ru: translateText('days', 'ru'),
            ja: translateText('days', 'ja'),
            fr: translateText('days', 'fr'),
            pt: translateText('days', 'pt'),
            ko: translateText('days', 'ko'),
            it: translateText('days', 'it'),
            tr: translateText('days', 'tr'),
        };
        const label = dayLabelMap[language] ?? 'days';
        return `${days} ${label}`;
    };
    const featureHiddenFields = new Set<TaskEditorFieldId>();
    if (settings.features?.priorities === false) {
        featureHiddenFields.add('priority');
    }
    if (settings.features?.timeEstimates === false) {
        featureHiddenFields.add('timeEstimate');
    }

    const baseTaskEditorOrder: TaskEditorFieldId[] = [
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
    const defaultTaskEditorOrder = baseTaskEditorOrder;
    const defaultVisibleFields = new Set<TaskEditorFieldId>([
        'status',
        'project',
        'description',
        'checklist',
        'dueDate',
        'priority',
        'timeEstimate',
    ]);
    const defaultTaskEditorHidden = defaultTaskEditorOrder.filter(
        (fieldId) => !defaultVisibleFields.has(fieldId) || featureHiddenFields.has(fieldId)
    );
    const savedOrder = settings.gtd?.taskEditor?.order ?? [];
    const savedHidden = settings.gtd?.taskEditor?.hidden ?? defaultTaskEditorHidden;
    const taskEditorOrder: TaskEditorFieldId[] = [
        ...savedOrder.filter((id) => defaultTaskEditorOrder.includes(id)),
        ...defaultTaskEditorOrder.filter((id) => !savedOrder.includes(id)),
    ];
    const hiddenSet = new Set(savedHidden);
    const fieldLabel = (fieldId: TaskEditorFieldId) => {
        switch (fieldId) {
            case 'status':
                return t.taskEditorFieldStatus;
            case 'project':
                return t.taskEditorFieldProject;
            case 'priority':
                return t.taskEditorFieldPriority;
            case 'contexts':
                return t.taskEditorFieldContexts;
            case 'description':
                return t.taskEditorFieldDescription;
            case 'tags':
                return t.taskEditorFieldTags;
            case 'timeEstimate':
                return t.taskEditorFieldTimeEstimate;
            case 'recurrence':
                return t.taskEditorFieldRecurrence;
            case 'startTime':
                return t.taskEditorFieldStartTime;
            case 'dueDate':
                return t.taskEditorFieldDueDate;
            case 'reviewAt':
                return t.taskEditorFieldReviewAt;
            case 'attachments':
                return t.taskEditorFieldAttachments;
            case 'checklist':
                return t.taskEditorFieldChecklist;
            default:
                return fieldId;
        }
    };
    const saveTaskEditor = (
        next: { order?: TaskEditorFieldId[]; hidden?: TaskEditorFieldId[] },
        nextFeatures?: AppData['settings']['features']
    ) => {
        updateSettings({
            ...(nextFeatures ? { features: nextFeatures } : null),
            gtd: {
                ...(settings.gtd ?? {}),
                taskEditor: {
                    ...(settings.gtd?.taskEditor ?? {}),
                    ...next,
                },
            },
        }).then(showSaved).catch(console.error);
    };
    const toggleFieldVisibility = (fieldId: TaskEditorFieldId) => {
        const nextHidden = new Set(hiddenSet);
        if (nextHidden.has(fieldId)) {
            nextHidden.delete(fieldId);
        } else {
            nextHidden.add(fieldId);
        }
        const nextFeatures = { ...(settings.features ?? {}) };
        if (fieldId === 'priority') {
            nextFeatures.priorities = !nextHidden.has('priority');
        }
        if (fieldId === 'timeEstimate') {
            nextFeatures.timeEstimates = !nextHidden.has('timeEstimate');
        }
        saveTaskEditor({ order: taskEditorOrder, hidden: Array.from(nextHidden) }, nextFeatures);
    };
    const moveFieldInGroup = (fieldId: TaskEditorFieldId, delta: number, groupFields: TaskEditorFieldId[]) => {
        const groupOrder = taskEditorOrder.filter((id) => groupFields.includes(id));
        const fromIndex = groupOrder.indexOf(fieldId);
        if (fromIndex === -1) return;
        const toIndex = Math.max(0, Math.min(groupOrder.length - 1, fromIndex + delta));
        if (fromIndex === toIndex) return;
        const nextGroupOrder = [...groupOrder];
        const [moved] = nextGroupOrder.splice(fromIndex, 1);
        nextGroupOrder.splice(toIndex, 0, moved);
        let groupIndex = 0;
        const nextOrder = taskEditorOrder.map((id) =>
            groupFields.includes(id) ? nextGroupOrder[groupIndex++] : id
        );
        saveTaskEditor({ order: nextOrder, hidden: Array.from(hiddenSet) });
    };

    const fieldGroups: { id: string; title: string; fields: TaskEditorFieldId[] }[] = [
        { id: 'basic', title: translateText('Basic', language), fields: ['status', 'project', 'dueDate'] },
        { id: 'scheduling', title: translateText('Scheduling', language), fields: ['startTime', 'recurrence', 'reviewAt'] },
        { id: 'organization', title: translateText('Organization', language), fields: ['contexts', 'tags', 'priority', 'timeEstimate'] },
        { id: 'details', title: translateText('Details', language), fields: ['description', 'attachments', 'checklist'] },
    ];

    return (
        <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t.autoArchive}</div>
                        <div className="text-xs text-muted-foreground mt-1">{t.autoArchiveDesc}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select
                            value={autoArchiveDays}
                            onChange={(e) => {
                                const value = Number.parseInt(e.target.value, 10);
                                updateSettings({
                                    gtd: {
                                        ...(settings.gtd ?? {}),
                                        autoArchiveDays: Number.isFinite(value) ? value : 7,
                                    },
                                }).then(showSaved).catch(console.error);
                            }}
                            className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            {autoArchiveOptions.map((days) => (
                                <option key={days} value={days}>
                                    {formatArchiveLabel(days)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-medium">{t.taskEditorLayout}</div>
                        <div className="text-xs text-muted-foreground mt-1">{t.taskEditorLayoutDesc}</div>
                        <div className="text-xs text-muted-foreground">{t.taskEditorLayoutHint}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const nextFeatures = { ...(settings.features ?? {}) };
                            nextFeatures.priorities = !defaultTaskEditorHidden.includes('priority');
                            nextFeatures.timeEstimates = !defaultTaskEditorHidden.includes('timeEstimate');
                            saveTaskEditor({ order: [...defaultTaskEditorOrder], hidden: [...defaultTaskEditorHidden] }, nextFeatures);
                        }}
                        className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
                    >
                        {t.taskEditorLayoutReset}
                    </button>
                </div>
                <div className="space-y-4">
                    {fieldGroups.map((group) => {
                        const groupOrder = taskEditorOrder.filter((id) => group.fields.includes(id));
                        return (
                            <div key={group.id} className="space-y-2">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                                    {group.title}
                                </div>
                                {groupOrder.map((fieldId, index) => {
                                    const isVisible = !hiddenSet.has(fieldId);
                                    return (
                                        <div
                                            key={fieldId}
                                            className={cn(
                                                "flex items-center justify-between rounded-md px-3 py-2 border transition-colors cursor-pointer",
                                                isVisible ? "bg-primary/10 border-primary/40" : "bg-muted/30 border-transparent hover:border-border"
                                            )}
                                            onClick={() => toggleFieldVisibility(fieldId)}
                                        >
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className={cn("text-xs uppercase tracking-wide", isVisible ? "text-primary" : "text-muted-foreground")}>
                                                    {isVisible ? t.visible : t.hidden}
                                                </span>
                                                <span className={cn(isVisible ? "text-foreground" : "text-muted-foreground")}>
                                                    {fieldLabel(fieldId)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        moveFieldInGroup(fieldId, -1, group.fields);
                                                    }}
                                                    disabled={index === 0}
                                                    className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors disabled:opacity-40"
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        moveFieldInGroup(fieldId, 1, group.fields);
                                                    }}
                                                    disabled={index === groupOrder.length - 1}
                                                    className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors disabled:opacity-40"
                                                >
                                                    ↓
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
