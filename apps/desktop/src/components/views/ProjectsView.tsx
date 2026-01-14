import { useState, useMemo, useEffect } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { useTaskStore, Attachment, Task, type Project, generateUUID, safeFormatDate, safeParseDate, parseQuickAdd, PRESET_CONTEXTS, validateAttachmentForUpload } from '@mindwtr/core';
import { TaskInput } from '../Task/TaskInput';
import { Folder } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useLanguage } from '../../contexts/language-context';
import { PromptModal } from '../PromptModal';
import { isTauriRuntime } from '../../lib/runtime';
import { normalizeAttachmentInput } from '../../lib/attachment-utils';
import { invoke } from '@tauri-apps/api/core';
import { size } from '@tauri-apps/plugin-fs';
import { SortableProjectTaskRow } from './projects/SortableRows';
import { ProjectsSidebar } from './projects/ProjectsSidebar';
import { AreaManagerModal } from './projects/AreaManagerModal';
import { ProjectNotesSection } from './projects/ProjectNotesSection';
import { ProjectDetailsHeader } from './projects/ProjectDetailsHeader';

function toDateTimeLocalValue(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const parsed = safeParseDate(dateStr);
    if (!parsed) return dateStr;
    return safeFormatDate(parsed, "yyyy-MM-dd'T'HH:mm", dateStr);
}

export function ProjectsView() {
    const { projects, tasks, areas, addArea, updateArea, deleteArea, reorderAreas, reorderProjects, reorderProjectTasks, addProject, updateProject, deleteProject, addTask, toggleProjectFocus, queryTasks, lastDataChangeAt } = useTaskStore();
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

    const taskSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
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

    const orderedProjectTasks = useMemo(() => {
        if (!selectedProject) return projectTasks;
        const sorted = [...projectTasks];
        const hasOrder = sorted.some((task) => Number.isFinite(task.orderNum));
        sorted.sort((a, b) => {
            if (hasOrder) {
                const aOrder = Number.isFinite(a.orderNum) ? (a.orderNum as number) : Number.POSITIVE_INFINITY;
                const bOrder = Number.isFinite(b.orderNum) ? (b.orderNum as number) : Number.POSITIVE_INFINITY;
                if (aOrder !== bOrder) return aOrder - bOrder;
            }
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        return sorted;
    }, [projectTasks, selectedProject]);

    const handleTaskDragEnd = (event: DragEndEvent) => {
        if (!selectedProject) return;
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = orderedProjectTasks.findIndex((task) => task.id === active.id);
        const newIndex = orderedProjectTasks.findIndex((task) => task.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(orderedProjectTasks, oldIndex, newIndex).map((task) => task.id);
        reorderProjectTasks(selectedProject.id, reordered);
    };
    const visibleAttachments = (selectedProject?.attachments || []).filter((a) => !a.deletedAt);
    const projectProgress = useMemo(() => {
        if (!selectedProjectId) return null;
        const doneCount = projectAllTasks.filter((task) => task.status === 'done').length;
        const remainingCount = projectAllTasks.length - doneCount;
        return { doneCount, remainingCount, total: projectAllTasks.length };
    }, [projectAllTasks, selectedProjectId]);

    const handleCommitProjectTitle = () => {
        if (!selectedProject) return;
        const nextTitle = editProjectTitle.trim();
        if (!nextTitle) {
            setEditProjectTitle(selectedProject.title);
            return;
        }
        if (nextTitle !== selectedProject.title) {
            updateProject(selectedProject.id, { title: nextTitle });
        }
    };

    const handleResetProjectTitle = () => {
        if (!selectedProject) return;
        setEditProjectTitle(selectedProject.title);
    };

    const handleArchiveProject = async () => {
        if (!selectedProject) return;
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
    };

    const handleDeleteProject = async () => {
        if (!selectedProject) return;
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
    };
    const allContexts = useMemo(() => {
        const taskContexts = tasks.flatMap((task) => task.contexts || []);
        return Array.from(new Set([...PRESET_CONTEXTS, ...taskContexts])).sort();
    }, [tasks]);
    const resolveValidationMessage = (error?: string) => {
        if (error === 'file_too_large') return t('attachments.fileTooLarge');
        if (error === 'mime_type_blocked' || error === 'mime_type_not_allowed') return t('attachments.invalidFileType');
        return t('attachments.fileNotSupported');
    };

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

    const openAttachment = async (attachment: Attachment) => {
        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(attachment.uri);
        const normalized = hasScheme ? attachment.uri : `file://${attachment.uri}`;
        if (isTauriRuntime()) {
            try {
                await invoke('open_path', { path: attachment.uri });
                return;
            } catch (error) {
                console.warn('Failed to open attachment', error);
            }
        }
        window.open(normalized, '_blank');
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
        <ErrorBoundary>
            <>
                <div className="flex h-full gap-6">
            <ProjectsSidebar
                t={t}
                selectedArea={selectedArea}
                selectedTag={selectedTag}
                allAreasId={ALL_AREAS}
                noAreaId={NO_AREA}
                allTagsId={ALL_TAGS}
                noTagsId={NO_TAGS}
                areaOptions={areaOptions}
                tagOptions={tagOptions}
                isCreating={isCreating}
                newProjectTitle={newProjectTitle}
                onStartCreate={() => setIsCreating(true)}
                onCancelCreate={() => setIsCreating(false)}
                onCreateProject={handleCreateProject}
                onChangeNewProjectTitle={setNewProjectTitle}
                onSelectArea={setSelectedArea}
                onSelectTag={setSelectedTag}
                groupedActiveProjects={groupedActiveProjects}
                groupedDeferredProjects={groupedDeferredProjects}
                areaById={areaById}
                collapsedAreas={collapsedAreas}
                onToggleAreaCollapse={toggleAreaCollapse}
                showDeferredProjects={showDeferredProjects}
                onToggleDeferredProjects={() => setShowDeferredProjects((prev) => !prev)}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                getProjectColor={getProjectColor}
                tasksByProject={tasksByProject}
                projects={projects}
                toggleProjectFocus={toggleProjectFocus}
                reorderProjects={reorderProjects}
            />

            {/* Project Details & Tasks */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {selectedProject ? (
                    <>
                        <ProjectDetailsHeader
                            project={selectedProject}
                            projectColor={getProjectColor(selectedProject)}
                            editTitle={editProjectTitle}
                            onEditTitleChange={setEditProjectTitle}
                            onCommitTitle={handleCommitProjectTitle}
                            onResetTitle={handleResetProjectTitle}
                            onToggleSequential={() => updateProject(selectedProject.id, { isSequential: !selectedProject.isSequential })}
                            onChangeStatus={(status) => updateProject(selectedProject.id, { status })}
                            onArchive={handleArchiveProject}
                            onReactivate={() => updateProject(selectedProject.id, { status: 'active' })}
                            onDelete={handleDeleteProject}
                            projectProgress={projectProgress}
                            t={t}
                        />

                        <ProjectNotesSection
                            project={selectedProject}
                            notesExpanded={notesExpanded}
                            onToggleNotes={() => {
                                setNotesExpanded(!notesExpanded);
                                setShowNotesPreview(false);
                            }}
                            showNotesPreview={showNotesPreview}
                            onTogglePreview={() => setShowNotesPreview((value) => !value)}
                            onAddFile={addProjectFileAttachment}
                            onAddLink={addProjectLinkAttachment}
                            visibleAttachments={visibleAttachments}
                            attachmentError={attachmentError}
                            onOpenAttachment={openAttachment}
                            onRemoveAttachment={removeProjectAttachment}
                            onUpdateNotes={(value) => updateProject(selectedProject.id, { supportNotes: value })}
                            t={t}
                        />

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

                        <div className="flex-1 overflow-y-auto pr-2">
                            {orderedProjectTasks.length > 0 ? (
                                <DndContext
                                    sensors={taskSensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleTaskDragEnd}
                                >
                                    <SortableContext
                                        items={orderedProjectTasks.map((task) => task.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-2">
                                            {orderedProjectTasks.map((task) => (
                                                <SortableProjectTaskRow
                                                    key={task.id}
                                                    task={task}
                                                    project={selectedProject}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
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
            <AreaManagerModal
                sortedAreas={sortedAreas}
                areaSensors={areaSensors}
                onDragEnd={handleAreaDragEnd}
                onDeleteArea={handleDeleteArea}
                onUpdateArea={updateArea}
                newAreaColor={newAreaColor}
                onChangeNewAreaColor={(event) => setNewAreaColor(event.target.value)}
                newAreaName={newAreaName}
                onChangeNewAreaName={(event) => setNewAreaName(event.target.value)}
                onCreateArea={() => {
                    const name = newAreaName.trim();
                    if (!name) return;
                    addArea(name, { color: newAreaColor });
                    setNewAreaName('');
                }}
                onSortByName={sortAreasByName}
                onSortByColor={sortAreasByColor}
                onClose={() => setShowAreaManager(false)}
                t={t}
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
        </ErrorBoundary>
    );
}
