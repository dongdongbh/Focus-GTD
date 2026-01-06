import { useState, useMemo, useEffect } from 'react';
import { useTaskStore, Attachment, Task, type Project, type Area, generateUUID, safeFormatDate, safeParseDate, parseQuickAdd, PRESET_CONTEXTS } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { TaskInput } from '../Task/TaskInput';
import { Plus, Folder, Trash2, ListOrdered, ChevronRight, ChevronDown, Archive as ArchiveIcon, RotateCcw, Paperclip, Link2, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/language-context';
import { Markdown } from '../Markdown';
import { PromptModal } from '../PromptModal';
import { isTauriRuntime } from '../../lib/runtime';
import { normalizeAttachmentInput } from '../../lib/attachment-utils';

function toDateTimeLocalValue(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const parsed = safeParseDate(dateStr);
    if (!parsed) return dateStr;
    return safeFormatDate(parsed, "yyyy-MM-dd'T'HH:mm", dateStr);
}

type AreaRowProps = {
    area: Area;
    onDelete: (areaId: string) => void;
    onUpdateName: (areaId: string, name: string) => void;
    onUpdateColor: (areaId: string, color: string) => void;
    t: (key: string) => string;
};

function SortableAreaRow({
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

function SortableProjectRow({
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

export function ProjectsView() {
    const { projects, tasks, areas, addArea, updateArea, deleteArea, reorderAreas, reorderProjects, addProject, updateProject, deleteProject, addTask, toggleProjectFocus, queryTasks, lastDataChangeAt } = useTaskStore();
    const { t } = useLanguage();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [showNotesPreview, setShowNotesPreview] = useState(false);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [showLinkPrompt, setShowLinkPrompt] = useState(false);
    const [showDeferredProjects, setShowDeferredProjects] = useState(false);
    const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});
    const [showAreaManager, setShowAreaManager] = useState(false);
    const [newAreaName, setNewAreaName] = useState('');
    const [newAreaColor, setNewAreaColor] = useState('#94a3b8');
    const [showQuickAreaPrompt, setShowQuickAreaPrompt] = useState(false);
    const [pendingAreaAssignProjectId, setPendingAreaAssignProjectId] = useState<string | null>(null);
    const [tagDraft, setTagDraft] = useState('');
    const [editProjectTitle, setEditProjectTitle] = useState('');
    const [projectTaskTitle, setProjectTaskTitle] = useState('');
    const ALL_AREAS = '__all__';
    const NO_AREA = '__none__';
    const ALL_TAGS = '__all__';
    const NO_TAGS = '__none__';
    const [selectedArea, setSelectedArea] = useState(ALL_AREAS);
    const [selectedTag, setSelectedTag] = useState(ALL_TAGS);

    useEffect(() => {
        setAttachmentError(null);
    }, [selectedProjectId]);

    const sortedAreas = useMemo(() => {
        return [...areas].sort((a, b) => a.order - b.order);
    }, [areas]);

    const areaSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 4 },
        }),
    );

    const projectSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 4 },
        }),
    );

    const areaById = useMemo(() => {
        return new Map(sortedAreas.map((area) => [area.id, area]));
    }, [sortedAreas]);

    const normalizeTag = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    };

    const parseTagInput = (input: string) => {
        const values = input
            .split(',')
            .map((tag) => normalizeTag(tag))
            .filter(Boolean);
        return Array.from(new Set(values));
    };

    const toggleAreaCollapse = (areaId: string) => {
        setCollapsedAreas((prev) => ({ ...prev, [areaId]: !prev[areaId] }));
    };

    const getProjectColor = (project: Project) => {
        if (project.areaId) {
            const area = areaById.get(project.areaId);
            if (area?.color) return area.color;
        }
        return '#94a3b8';
    };

    const handleAreaDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = sortedAreas.findIndex((area) => area.id === active.id);
        const newIndex = sortedAreas.findIndex((area) => area.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(sortedAreas, oldIndex, newIndex).map((area) => area.id);
        reorderAreas(reordered);
    };

    const handleDeleteArea = async (areaId: string) => {
        const confirmed = isTauriRuntime()
            ? await import('@tauri-apps/plugin-dialog').then(({ confirm }) =>
                confirm(t('projects.deleteConfirm'), {
                    title: 'Area',
                    kind: 'warning',
                }),
            )
            : window.confirm(t('projects.deleteConfirm'));
        if (confirmed) {
            deleteArea(areaId);
        }
    };

    const sortAreasByName = () => {
        const reordered = [...sortedAreas]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((area) => area.id);
        reorderAreas(reordered);
    };

    const sortAreasByColor = () => {
        const reordered = [...sortedAreas]
            .sort((a, b) => {
                const colorA = (a.color || '').toLowerCase();
                const colorB = (b.color || '').toLowerCase();
                if (colorA && colorB && colorA !== colorB) return colorA.localeCompare(colorB);
                if (colorA && !colorB) return -1;
                if (!colorA && colorB) return 1;
                return a.name.localeCompare(b.name);
            })
            .map((area) => area.id);
        reorderAreas(reordered);
    };

    // Group tasks by project to avoid O(N*M) filtering
    const tasksByProject = projects.reduce((acc, project) => {
        acc[project.id] = [];
        return acc;
    }, {} as Record<string, Task[]>);

    tasks.forEach(task => {
        if (task.projectId && !task.deletedAt && task.status !== 'done') {
            if (tasksByProject[task.projectId]) {
                tasksByProject[task.projectId].push(task);
            }
        }
    });

    const areaOptions = useMemo(() => {
        const visibleProjects = projects.filter(p => !p.deletedAt);
        const hasNoArea = visibleProjects.some((project) => !project.areaId || !areaById.has(project.areaId));
        return {
            list: sortedAreas,
            hasNoArea,
        };
    }, [projects, sortedAreas, areaById]);

    const tagOptions = useMemo(() => {
        const visibleProjects = projects.filter(p => !p.deletedAt);
        const tags = new Set<string>();
        let hasNoTags = false;
        visibleProjects.forEach((project) => {
            const list = project.tagIds || [];
            if (list.length === 0) {
                hasNoTags = true;
                return;
            }
            list.forEach((tag) => tags.add(tag));
        });
        return {
            list: Array.from(tags).sort(),
            hasNoTags,
        };
    }, [projects]);

    const { groupedActiveProjects, groupedDeferredProjects } = useMemo(() => {
        const visibleProjects = projects.filter(p => !p.deletedAt);
        const sorted = [...visibleProjects].sort((a, b) => {
            const orderA = Number.isFinite(a.order) ? a.order : 0;
            const orderB = Number.isFinite(b.order) ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.title.localeCompare(b.title);
        });
        const filtered = sorted.filter((project) => {
            if (selectedArea === ALL_AREAS) return true;
            if (selectedArea === NO_AREA) return !project.areaId || !areaById.has(project.areaId);
            return project.areaId === selectedArea;
        });
        const filteredByTag = filtered.filter((project) => {
            const tags = project.tagIds || [];
            if (selectedTag === ALL_TAGS) return true;
            if (selectedTag === NO_TAGS) return tags.length === 0;
            return tags.includes(selectedTag);
        });

        const groupByArea = (list: typeof filtered) => {
            const groups = new Map<string, typeof filtered>();
            for (const project of list) {
                const areaId = project.areaId && areaById.has(project.areaId) ? project.areaId : NO_AREA;
                if (!groups.has(areaId)) groups.set(areaId, []);
                groups.get(areaId)!.push(project);
            }
            const ordered: Array<[string, typeof filtered]> = [];
            sortedAreas.forEach((area) => {
                const entries = groups.get(area.id);
                if (entries && entries.length > 0) ordered.push([area.id, entries]);
            });
            const noAreaEntries = groups.get(NO_AREA);
            if (noAreaEntries && noAreaEntries.length > 0) ordered.push([NO_AREA, noAreaEntries]);
            return ordered;
        };

        const active = filteredByTag.filter((project) => project.status === 'active');
        const deferred = filteredByTag.filter((project) => project.status !== 'active');

        return {
            groupedActiveProjects: groupByArea(active),
            groupedDeferredProjects: groupByArea(deferred),
        };
    }, [projects, selectedArea, selectedTag, ALL_AREAS, NO_AREA, ALL_TAGS, NO_TAGS, areaById, sortedAreas]);

    const handleProjectDragEnd = (areaId: string, areaProjects: Project[]) => (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = areaProjects.findIndex((project) => project.id === active.id);
        const newIndex = areaProjects.findIndex((project) => project.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(areaProjects, oldIndex, newIndex).map((project) => project.id);
        reorderProjects(reordered, areaId === NO_AREA ? undefined : areaId);
    };

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (newProjectTitle.trim()) {
            const resolvedAreaId =
                selectedArea !== ALL_AREAS && selectedArea !== NO_AREA ? selectedArea : undefined;
            const areaColor = resolvedAreaId ? areaById.get(resolvedAreaId)?.color : undefined;
            addProject(newProjectTitle, areaColor || '#94a3b8', resolvedAreaId ? { areaId: resolvedAreaId } : undefined);
            setNewProjectTitle('');
            setIsCreating(false);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    useEffect(() => {
        setEditProjectTitle(selectedProject?.title ?? '');
    }, [selectedProject?.id, selectedProject?.title]);
    const [projectTasks, setProjectTasks] = useState<Task[]>([]);
    const [projectAllTasks, setProjectAllTasks] = useState<Task[]>([]);
    useEffect(() => {
        if (!selectedProjectId) {
            setProjectTasks([]);
            setProjectAllTasks([]);
            return;
        }
        let cancelled = false;
        queryTasks({
            projectId: selectedProjectId,
            includeDeleted: false,
            includeArchived: true,
        }).then((result) => {
            if (cancelled) return;
            setProjectAllTasks(result);
            setProjectTasks(result.filter((task) => task.status !== 'done'));
        }).catch(() => {
            if (cancelled) return;
            setProjectAllTasks([]);
            setProjectTasks([]);
        });
        return () => {
            cancelled = true;
        };
    }, [selectedProjectId, queryTasks, lastDataChangeAt]);
    const visibleAttachments = (selectedProject?.attachments || []).filter((a) => !a.deletedAt);
    const projectProgress = useMemo(() => {
        if (!selectedProjectId) return null;
        const doneCount = projectAllTasks.filter((task) => task.status === 'done').length;
        const remainingCount = projectAllTasks.length - doneCount;
        return { doneCount, remainingCount, total: projectAllTasks.length };
    }, [projectAllTasks, selectedProjectId]);
    const allContexts = useMemo(() => {
        const taskContexts = tasks.flatMap((task) => task.contexts || []);
        return Array.from(new Set([...PRESET_CONTEXTS, ...taskContexts])).sort();
    }, [tasks]);

    useEffect(() => {
        if (!selectedProject) {
            setTagDraft('');
            return;
        }
        setTagDraft((selectedProject.tagIds || []).join(', '));
    }, [selectedProject?.id, selectedProject?.tagIds]);

    useEffect(() => {
        setProjectTaskTitle('');
    }, [selectedProject?.id]);

    const openAttachment = (attachment: Attachment) => {
        if (attachment.kind === 'link') {
            window.open(attachment.uri, '_blank');
            return;
        }
        const url = attachment.uri.startsWith('file://') ? attachment.uri : `file://${attachment.uri}`;
        window.open(url, '_blank');
    };

    const addProjectFileAttachment = async () => {
        if (!selectedProject) return;
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
        updateProject(selectedProject.id, { attachments: [...(selectedProject.attachments || []), attachment] });
    };

    const addProjectLinkAttachment = () => {
        if (!selectedProject) return;
        setAttachmentError(null);
        setShowLinkPrompt(true);
    };

    const removeProjectAttachment = (id: string) => {
        if (!selectedProject) return;
        const now = new Date().toISOString();
        const next = (selectedProject.attachments || []).map((a) =>
            a.id === id ? { ...a, deletedAt: now, updatedAt: now } : a
        );
        updateProject(selectedProject.id, { attachments: next });
    };

    return (
        <>
        <div className="flex h-full gap-6">
            {/* Sidebar List of Projects */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-4 border-r border-border pr-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight">{t('projects.title')}</h2>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="p-1 hover:bg-accent rounded-md transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('projects.areaFilter')}
                    </label>
                    <select
                        value={selectedArea}
                        onChange={(e) => setSelectedArea(e.target.value)}
                        className="w-full text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground"
                    >
                        <option value={ALL_AREAS}>{t('projects.allAreas')}</option>
                        {areaOptions.list.map((area) => (
                            <option key={area.id} value={area.id}>
                                {area.name}
                            </option>
                        ))}
                        {areaOptions.hasNoArea && (
                            <option value={NO_AREA}>{t('projects.noArea')}</option>
                        )}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {t('projects.tagFilter')}
                    </label>
                    <select
                        value={selectedTag}
                        onChange={(e) => setSelectedTag(e.target.value)}
                        className="w-full text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground"
                    >
                        <option value={ALL_TAGS}>{t('projects.allTags')}</option>
                        {tagOptions.list.map((tag) => (
                            <option key={tag} value={tag}>
                                {tag}
                            </option>
                        ))}
                        {tagOptions.hasNoTags && (
                            <option value={NO_TAGS}>{t('projects.noTags')}</option>
                        )}
                    </select>
                </div>

                {isCreating && (
                    <form onSubmit={handleCreateProject} className="bg-card border border-border rounded-lg p-3 space-y-3 animate-in slide-in-from-top-2">
                        <input
                            autoFocus
                            type="text"
                            value={newProjectTitle}
                            onChange={(e) => setNewProjectTitle(e.target.value)}
                            placeholder={t('projects.projectName')}
                            className="w-full bg-transparent border-b border-primary/50 p-1 text-sm focus:outline-none"
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="text-xs px-2 py-1 hover:bg-muted rounded"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                            >
                                {t('projects.create')}
                            </button>
                        </div>
                    </form>
                )}

                <div className="space-y-3 overflow-y-auto flex-1">
                    {groupedActiveProjects.length > 0 && (
                        <div className="px-2 pt-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('projects.activeSection')}
                        </div>
                    )}
                    {groupedActiveProjects.map(([areaId, areaProjects]) => {
                        const area = areaById.get(areaId);
                        const areaLabel = area ? area.name : t('projects.noArea');
                        const isCollapsed = collapsedAreas[areaId] ?? false;

                        return (
                            <div key={areaId} className="space-y-1">
                                <button
                                    type="button"
                                    onClick={() => toggleAreaCollapse(areaId)}
                                    className="w-full flex items-center justify-between px-2 pt-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                                >
                                    <span className="flex items-center gap-2">
                                        {area?.color && (
                                            <span
                                                className="w-2 h-2 rounded-full border border-border/50"
                                                style={{ backgroundColor: area.color }}
                                            />
                                        )}
                                        {area?.icon && <span className="text-[10px]">{area.icon}</span>}
                                        {areaLabel}
                                    </span>
                                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                {!isCollapsed && (
                                    <DndContext
                                        sensors={projectSensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleProjectDragEnd(areaId, areaProjects)}
                                    >
                                        <SortableContext items={areaProjects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
                                            {areaProjects.map((project) => {
                                                const projTasks = tasksByProject[project.id] || [];
                                                let nextAction = undefined;
                                                let nextCandidate = undefined;
                                                for (const t of projTasks) {
                                                    if (!nextCandidate && t.status === 'next') {
                                                        nextCandidate = t;
                                                    }
                                                    if (!nextAction && t.status === 'inbox') {
                                                        nextAction = t;
                                                    }
                                                }
                                                nextAction = nextAction || nextCandidate;
                                                const focusedCount = projects.filter(p => p.isFocused).length;

                                                return (
                                                    <SortableProjectRow key={project.id} projectId={project.id}>
                                                        {({ handle, isDragging }) => (
                                                            <div
                                                                className={cn(
                                                                    "rounded-lg cursor-pointer transition-colors text-sm border",
                                                                    selectedProjectId === project.id
                                                                        ? "bg-accent text-accent-foreground border-accent"
                                                                        : project.isFocused
                                                                            ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                                                                            : "border-transparent hover:bg-muted/50",
                                                                    isDragging && "opacity-70"
                                                                )}
                                                            >
                                                                <div
                                                                    className="flex items-center gap-2 p-2"
                                                                    onClick={() => setSelectedProjectId(project.id)}
                                                                >
                                                                    {handle}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleProjectFocus(project.id);
                                                                        }}
                                                                        className={cn(
                                                                            "text-sm transition-colors",
                                                                            project.isFocused ? "text-amber-500" : "text-muted-foreground hover:text-amber-500",
                                                                            !project.isFocused && focusedCount >= 5 && "opacity-30 cursor-not-allowed"
                                                                        )}
                                                                        title={project.isFocused ? "Remove from focus" : focusedCount >= 5 ? "Max 5 focused projects" : "Add to focus"}
                                                                    >
                                                                        {project.isFocused ? '⭐' : '☆'}
                                                                    </button>
                                                                    <Folder className="w-4 h-4" style={{ color: getProjectColor(project) }} />
                                                                    <span className="flex-1 truncate">{project.title}</span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {projTasks.length}
                                                                    </span>
                                                                </div>
                                                                <div className="px-2 pb-2 pl-8">
                                                                    {nextAction ? (
                                                                        <span className="text-xs text-muted-foreground truncate block">
                                                                            ↳ {nextAction.title}
                                                                        </span>
                                                                    ) : projTasks.length > 0 ? (
                                                                        <span className="text-xs text-amber-600 dark:text-amber-400">
                                                                            ⚠️ {t('projects.noNextAction')}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </SortableProjectRow>
                                                );
                                            })}
                                        </SortableContext>
                                    </DndContext>
                                )}
                            </div>
                        );
                    })}

                    {groupedDeferredProjects.length > 0 && (
                        <div className="pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setShowDeferredProjects((prev) => !prev)}
                                className="w-full flex items-center justify-between px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                            >
                                <span>{t('projects.deferredSection')}</span>
                                {showDeferredProjects ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            {showDeferredProjects && (
                                <div className="space-y-3">
                                    {groupedDeferredProjects.map(([areaId, areaProjects]) => {
                                        const area = areaById.get(areaId);
                                        const areaLabel = area ? area.name : t('projects.noArea');
                                        const isCollapsed = collapsedAreas[areaId] ?? false;

                                        return (
                                            <div key={`deferred-${areaId}`} className="space-y-1">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleAreaCollapse(areaId)}
                                                    className="w-full flex items-center justify-between px-2 pt-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        {area?.color && (
                                                            <span
                                                                className="w-2 h-2 rounded-full border border-border/50"
                                                                style={{ backgroundColor: area.color }}
                                                            />
                                                        )}
                                                        {area?.icon && <span className="text-[10px]">{area.icon}</span>}
                                                        {areaLabel}
                                                    </span>
                                                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                                {!isCollapsed && (
                                                    <DndContext
                                                        sensors={projectSensors}
                                                        collisionDetection={closestCenter}
                                                        onDragEnd={handleProjectDragEnd(areaId, areaProjects)}
                                                    >
                                                        <SortableContext items={areaProjects.map((project) => project.id)} strategy={verticalListSortingStrategy}>
                                                            {areaProjects.map((project) => (
                                                                <SortableProjectRow key={project.id} projectId={project.id}>
                                                                    {({ handle, isDragging }) => (
                                                                        <div
                                                                            className={cn(
                                                                                "rounded-lg cursor-pointer transition-colors text-sm border",
                                                                                selectedProjectId === project.id
                                                                                    ? "bg-accent text-accent-foreground border-accent"
                                                                                    : "border-transparent hover:bg-muted/50",
                                                                                isDragging && "opacity-70"
                                                                            )}
                                                                            onClick={() => setSelectedProjectId(project.id)}
                                                                        >
                                                                            <div className="flex items-center gap-2 p-2">
                                                                                {handle}
                                                                                <Folder className="w-4 h-4" style={{ color: getProjectColor(project) }} />
                                                                                <span className="flex-1 truncate">{project.title}</span>
                                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                                                                                    {t(`status.${project.status}`) || project.status}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </SortableProjectRow>
                                                            ))}
                                                        </SortableContext>
                                                    </DndContext>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {groupedActiveProjects.length === 0 && groupedDeferredProjects.length === 0 && !isCreating && (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            {t('projects.noProjects')}
                        </div>
                    )}
                </div>
            </div>

            {/* Project Details & Tasks */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {selectedProject ? (
                    <>
                        <header className="mb-6 space-y-3">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span
                                        className="w-3 h-3 rounded-full border border-border"
                                        style={{ backgroundColor: getProjectColor(selectedProject) }}
                                        aria-hidden="true"
                                    />
                                    <div className="flex flex-col min-w-0">
                                        <input
                                            value={editProjectTitle}
                                            onChange={(e) => setEditProjectTitle(e.target.value)}
                                            onBlur={() => {
                                                if (!selectedProject) return;
                                                const nextTitle = editProjectTitle.trim();
                                                if (!nextTitle) {
                                                    setEditProjectTitle(selectedProject.title);
                                                    return;
                                                }
                                                if (nextTitle !== selectedProject.title) {
                                                    updateProject(selectedProject.id, { title: nextTitle });
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (!selectedProject) return;
                                                if (e.key === 'Enter') {
                                                    (e.currentTarget as HTMLInputElement).blur();
                                                } else if (e.key === 'Escape') {
                                                    setEditProjectTitle(selectedProject.title);
                                                    (e.currentTarget as HTMLInputElement).blur();
                                                }
                                            }}
                                            className="text-2xl font-bold truncate bg-transparent border-b border-transparent focus:border-border focus:outline-none w-full"
                                            aria-label={t('projects.title')}
                                        />
                                        {selectedProject.tagIds && selectedProject.tagIds.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {selectedProject.tagIds.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {projectProgress && projectProgress.total > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                                {t('status.done')}: {projectProgress.doneCount} / {projectProgress.remainingCount} {t('process.remaining')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedProject.status === 'archived' ? (
                                        <button
                                            type="button"
                                            onClick={() => updateProject(selectedProject.id, { status: 'active' })}
                                            className="flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            {t('projects.reactivate')}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                const confirmed = isTauriRuntime()
                                                    ? await import('@tauri-apps/plugin-dialog').then(({ confirm }) =>
                                                        confirm(t('projects.archiveConfirm'), {
                                                            title: t('projects.title'),
                                                            kind: 'warning',
                                                        }),
                                                    )
                                                    : window.confirm(t('projects.archiveConfirm'));
                                                if (confirmed) {
                                                    updateProject(selectedProject.id, { status: 'archived' });
                                                }
                                            }}
                                            className="flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground transition-colors whitespace-nowrap"
                                        >
                                            <ArchiveIcon className="w-4 h-4" />
                                            {t('projects.archive')}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            const confirmed = isTauriRuntime()
                                                ? await import('@tauri-apps/plugin-dialog').then(({ confirm }) =>
                                                    confirm(t('projects.deleteConfirm'), {
                                                        title: t('projects.title'),
                                                        kind: 'warning',
                                                    }),
                                                )
                                                : window.confirm(t('projects.deleteConfirm'));
                                            if (confirmed) {
                                                deleteProject(selectedProject.id);
                                                setSelectedProjectId(null);
                                            }
                                        }}
                                        className="text-destructive hover:bg-destructive/10 h-8 w-8 rounded-md transition-colors flex items-center justify-center"
                                        title={t('common.delete')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                    {/* Sequential Toggle */}
                                    <button
                                        type="button"
                                        onClick={() => updateProject(selectedProject.id, { isSequential: !selectedProject.isSequential })}
                                        className={cn(
                                            "flex items-center gap-2 px-3 h-8 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                                            selectedProject.isSequential
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                        )}
                                        title={selectedProject.isSequential ? t('projects.sequentialTooltip') : t('projects.parallelTooltip')}
                                    >
                                        <ListOrdered className="w-4 h-4" />
                                        {selectedProject.isSequential ? t('projects.sequential') : t('projects.parallel')}
                                    </button>
                                    <div className="flex items-center gap-2 min-w-[180px]">
                                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                            {t('projects.statusLabel')}
                                        </span>
                                        <select
                                            value={selectedProject.status}
                                            onChange={(e) => updateProject(selectedProject.id, { status: e.target.value as Project['status'] })}
                                            className="h-8 text-xs bg-muted/50 border border-border rounded px-2 text-foreground"
                                            disabled={selectedProject.status === 'archived'}
                                        >
                                            <option value="active">{t('status.active')}</option>
                                            <option value="waiting">{t('status.waiting')}</option>
                                            <option value="someday">{t('status.someday')}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </header>

		                        <div className="mb-6 border rounded-lg overflow-hidden bg-card">
		                            <button
		                                onClick={() => {
		                                    setNotesExpanded(!notesExpanded);
		                                    setShowNotesPreview(false);
		                                }}
		                                className="w-full flex items-center gap-2 p-2 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
		                            >
			                                {notesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
			                                {t('project.notes')}
		                            </button>
			                            {notesExpanded && (
			                                <div className="p-3 space-y-3">
			                                    <div className="flex items-center justify-between">
			                                        <button
			                                            type="button"
			                                            onClick={() => setShowNotesPreview((v) => !v)}
			                                            className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
			                                        >
			                                            {showNotesPreview ? t('markdown.edit') : t('markdown.preview')}
			                                        </button>
			                                        <div className="flex items-center gap-2">
			                                            <button
			                                                type="button"
			                                                onClick={addProjectFileAttachment}
			                                                className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors flex items-center gap-1"
			                                            >
			                                                <Paperclip className="w-3 h-3" />
			                                                {t('attachments.addFile')}
			                                            </button>
			                                            <button
			                                                type="button"
			                                                onClick={addProjectLinkAttachment}
			                                                className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors flex items-center gap-1"
			                                            >
			                                                <Link2 className="w-3 h-3" />
			                                                {t('attachments.addLink')}
			                                            </button>
			                                        </div>
			                                    </div>

			                                    {showNotesPreview ? (
			                                        <div className="text-xs bg-muted/30 border border-border rounded px-2 py-2">
			                                            <Markdown markdown={selectedProject.supportNotes || ''} />
			                                        </div>
			                                    ) : (
			                                        <textarea
			                                            className="w-full min-h-[120px] p-3 text-sm bg-transparent border border-border rounded resize-y focus:outline-none focus:bg-accent/5"
			                                            placeholder={t('projects.notesPlaceholder')}
			                                            defaultValue={selectedProject.supportNotes || ''}
			                                            onBlur={(e) => updateProject(selectedProject.id, { supportNotes: e.target.value })}
			                                        />
			                                    )}

                                <div className="pt-2 border-t border-border/50 space-y-1">
                                    <div className="text-xs text-muted-foreground font-medium">{t('attachments.title')}</div>
                                    {attachmentError && (
                                        <div className="text-xs text-red-400">{attachmentError}</div>
                                    )}
                                    {visibleAttachments.length === 0 ? (
			                                            <div className="text-xs text-muted-foreground">{t('common.none')}</div>
			                                        ) : (
			                                            <div className="space-y-1">
			                                                {visibleAttachments.map((attachment) => (
			                                                    <div key={attachment.id} className="flex items-center justify-between gap-2 text-xs">
			                                                        <button
			                                                            type="button"
			                                                            onClick={() => openAttachment(attachment)}
			                                                            className="truncate text-primary hover:underline"
			                                                            title={attachment.title}
			                                                        >
			                                                            {attachment.title}
			                                                        </button>
			                                                        <button
			                                                            type="button"
			                                                            onClick={() => removeProjectAttachment(attachment.id)}
			                                                            className="text-muted-foreground hover:text-foreground"
			                                                        >
			                                                            {t('attachments.remove')}
			                                                        </button>
			                                                    </div>
			                                                ))}
			                                            </div>
			                                        )}
			                                    </div>
			                                </div>
			                            )}
			                        </div>

                        <div className="mb-6 bg-card border border-border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                    {t('projects.areaLabel')}
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (selectedProject) {
                                                setPendingAreaAssignProjectId(selectedProject.id);
                                            }
                                            setShowQuickAreaPrompt(true);
                                        }}
                                        className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        + New
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAreaManager(true)}
                                        className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Manage Areas
                                    </button>
                                </div>
                            </div>
                            <select
                                key={`${selectedProject.id}-area`}
                                value={selectedProject.areaId && areaById.has(selectedProject.areaId) ? selectedProject.areaId : NO_AREA}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    updateProject(selectedProject.id, { areaId: value === NO_AREA ? undefined : value });
                                }}
                                className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1"
                            >
                                <option value={NO_AREA}>{t('projects.noArea')}</option>
                                {sortedAreas.map((area) => (
                                    <option key={area.id} value={area.id}>
                                        {area.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-6 bg-card border border-border rounded-lg p-3 space-y-2">
                            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                {t('taskEdit.tagsLabel')}
                            </label>
                            <input
                                key={`${selectedProject.id}-tags`}
                                type="text"
                                value={tagDraft}
                                onChange={(e) => setTagDraft(e.target.value)}
                                onBlur={() => {
                                    const tags = parseTagInput(tagDraft);
                                    updateProject(selectedProject.id, { tagIds: tags });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const tags = parseTagInput(tagDraft);
                                        updateProject(selectedProject.id, { tagIds: tags });
                                        e.currentTarget.blur();
                                    }
                                }}
                                placeholder="#feature, #client"
                                className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1"
                            />
                        </div>

			                        <div className="mb-6 bg-card border border-border rounded-lg p-3 space-y-2">
			                            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
			                                {t('projects.reviewAt')}
		                            </label>
	                            <input
	                                key={selectedProject.id}
	                                type="datetime-local"
	                                defaultValue={toDateTimeLocalValue(selectedProject.reviewAt)}
	                                onBlur={(e) => updateProject(selectedProject.id, { reviewAt: e.target.value || undefined })}
	                                className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1"
		                            />
		                            <p className="text-xs text-muted-foreground">
		                                {t('projects.reviewAtHint')}
		                            </p>
		                        </div>

	                        <div className="mb-6">
                            <form
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (!projectTaskTitle.trim()) return;
                                    const { title: parsedTitle, props, projectTitle } = parseQuickAdd(projectTaskTitle, projects);
                                    const finalTitle = parsedTitle || projectTaskTitle;
                                    const initialProps: Partial<Task> = { projectId: selectedProject.id, status: 'next', ...props };
                                    if (!props.status) initialProps.status = 'next';
                                    if (!props.projectId) initialProps.projectId = selectedProject.id;
                                    if (!initialProps.projectId && projectTitle) {
                                        const created = await addProject(projectTitle, '#94a3b8');
                                        initialProps.projectId = created.id;
                                    }
                                    await addTask(finalTitle, initialProps);
                                    setProjectTaskTitle('');
                                }}
                                className="flex gap-2"
                            >
                                <TaskInput
                                    value={projectTaskTitle}
                                    projects={projects}
                                    contexts={allContexts}
                                    onCreateProject={async (title) => {
                                        const created = await addProject(title, '#94a3b8');
                                        return created.id;
                                    }}
                                    onChange={(next) => setProjectTaskTitle(next)}
                                    placeholder={t('projects.addTaskPlaceholder')}
                                    className="flex-1 bg-card border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                                <button
                                    type="submit"
                                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                                >
                                    {t('projects.addTask')}
                                </button>
                            </form>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {projectTasks.length > 0 ? (
                                projectTasks.map(task => (
                                    <TaskItem key={task.id} task={task} project={selectedProject} />
                                ))
                            ) : (
                                <div className="text-center text-muted-foreground py-12">
                                    {t('projects.noActiveTasks')}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                            <Folder className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>{t('projects.selectProject')}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
        {showAreaManager && (
            <div
                className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
                role="dialog"
                aria-modal="true"
                onClick={() => setShowAreaManager(false)}
            >
                <div
                    className="w-full max-w-lg bg-popover text-popover-foreground rounded-xl border shadow-2xl overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Manage Areas</h3>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={sortAreasByName}
                                    className="text-xs px-2 py-1 rounded border border-border bg-muted/50 hover:bg-muted"
                                >
                                    {t('projects.sortByName')}
                                </button>
                                <button
                                    type="button"
                                    onClick={sortAreasByColor}
                                    className="text-xs px-2 py-1 rounded border border-border bg-muted/50 hover:bg-muted"
                                >
                                    {t('projects.sortByColor')}
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAreaManager(false)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="space-y-2">
                            {sortedAreas.length === 0 && (
                                <div className="text-sm text-muted-foreground">
                                    {t('projects.noArea')}
                                </div>
                            )}
                            {sortedAreas.length > 0 && (
                                <DndContext sensors={areaSensors} collisionDetection={closestCenter} onDragEnd={handleAreaDragEnd}>
                                    <SortableContext items={sortedAreas.map((area) => area.id)} strategy={verticalListSortingStrategy}>
                                        {sortedAreas.map((area) => (
                                            <SortableAreaRow
                                                key={area.id}
                                                area={area}
                                                onDelete={handleDeleteArea}
                                                onUpdateName={(areaId, name) => updateArea(areaId, { name })}
                                                onUpdateColor={(areaId, color) => updateArea(areaId, { color })}
                                                t={t}
                                            />
                                        ))}
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                        <div className="border-t border-border/50 pt-3 space-y-2">
                            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                New Area
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={newAreaColor}
                                    onChange={(e) => setNewAreaColor(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                />
                                <input
                                    type="text"
                                    value={newAreaName}
                                    onChange={(e) => setNewAreaName(e.target.value)}
                                    placeholder="Area name"
                                    className="flex-1 bg-muted/50 border border-border rounded px-2 py-1 text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const name = newAreaName.trim();
                                        if (!name) return;
                                        addArea(name, { color: newAreaColor });
                                        setNewAreaName('');
                                    }}
                                    className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    {t('projects.create')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
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
                if (!selectedProject) return;
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
                updateProject(selectedProject.id, { attachments: [...(selectedProject.attachments || []), attachment] });
                setShowLinkPrompt(false);
            }}
        />
        <PromptModal
            isOpen={showQuickAreaPrompt}
            title={t('projects.areaLabel')}
            description={t('projects.areaPlaceholder')}
            placeholder={t('projects.areaPlaceholder')}
            defaultValue=""
            confirmLabel={t('projects.create')}
            cancelLabel={t('common.cancel')}
            onCancel={() => {
                setShowQuickAreaPrompt(false);
                setPendingAreaAssignProjectId(null);
            }}
            onConfirm={async (value) => {
                const name = value.trim();
                if (!name) return;
                await addArea(name, { color: newAreaColor });
                const state = useTaskStore.getState();
                const matching = [...state.areas]
                    .filter((area) => area.name.trim().toLowerCase() === name.toLowerCase())
                    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
                const created = matching[0];
                if (created && pendingAreaAssignProjectId) {
                    updateProject(pendingAreaAssignProjectId, { areaId: created.id });
                }
                setShowQuickAreaPrompt(false);
                setPendingAreaAssignProjectId(null);
            }}
        />
        </>
    );
}
