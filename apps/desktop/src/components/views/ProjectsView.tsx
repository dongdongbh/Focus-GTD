import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { shallow, useTaskStore, Attachment, Task, type Project, type Section, generateUUID, parseQuickAdd, validateAttachmentForUpload } from '@mindwtr/core';
import { ChevronDown, ChevronRight, FileText, Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useLanguage } from '../../contexts/language-context';
import { PromptModal } from '../PromptModal';
import { isTauriRuntime } from '../../lib/runtime';
import { normalizeAttachmentInput } from '../../lib/attachment-utils';
import { cn } from '../../lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { size } from '@tauri-apps/plugin-fs';
import { SortableProjectTaskRow } from './projects/SortableRows';
import { ProjectsSidebar } from './projects/ProjectsSidebar';
import { AreaManagerModal } from './projects/AreaManagerModal';
import { ProjectNotesSection } from './projects/ProjectNotesSection';
import { ProjectDetailsHeader } from './projects/ProjectDetailsHeader';
import { ProjectDetailsFields } from './projects/ProjectDetailsFields';
import {
    DEFAULT_AREA_COLOR,
    getProjectColor,
    parseTagInput,
    sortAreasByColor as sortAreasByColorIds,
    sortAreasByName as sortAreasByNameIds,
    toDateTimeLocalValue,
} from './projects/projects-utils';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import { checkBudget } from '../../config/performanceBudgets';
import { useUiStore } from '../../store/ui-store';
import { logWarn } from '../../lib/app-log';
import { AREA_FILTER_ALL, AREA_FILTER_NONE, projectMatchesAreaFilter } from '../../lib/area-filter';
import { useAreaSidebarState } from './projects/useAreaSidebarState';

const SECTION_CONTAINER_PREFIX = 'section:';
const NO_SECTION_CONTAINER = `${SECTION_CONTAINER_PREFIX}none`;
const getSectionContainerId = (sectionId?: string | null) =>
    sectionId ? `${SECTION_CONTAINER_PREFIX}${sectionId}` : NO_SECTION_CONTAINER;
const getSectionIdFromContainer = (containerId: string) =>
    containerId === NO_SECTION_CONTAINER ? null : containerId.replace(SECTION_CONTAINER_PREFIX, '');

type SectionDropZoneProps = {
    id: string;
    className?: string;
    children: ReactNode;
};

const SectionDropZone = ({ id, className, children }: SectionDropZoneProps) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className={cn(className, isOver && 'ring-2 ring-primary/40')}>
            {children}
        </div>
    );
};

export function ProjectsView() {
    const perf = usePerformanceMonitor('ProjectsView');
    const {
        projects,
        tasks,
        sections,
        areas,
        addArea,
        updateArea,
        deleteArea,
        reorderAreas,
        reorderProjects,
        reorderProjectTasks,
        addProject,
        updateProject,
        deleteProject,
        duplicateProject,
        updateTask,
        addSection,
        updateSection,
        deleteSection,
        addTask,
        toggleProjectFocus,
        _allTasks,
        highlightTaskId,
        setHighlightTask,
        settings,
    } = useTaskStore(
        (state) => ({
            projects: state.projects,
            tasks: state.tasks,
            sections: state.sections,
            areas: state.areas,
            addArea: state.addArea,
            updateArea: state.updateArea,
            deleteArea: state.deleteArea,
            reorderAreas: state.reorderAreas,
            reorderProjects: state.reorderProjects,
            reorderProjectTasks: state.reorderProjectTasks,
            addProject: state.addProject,
            updateProject: state.updateProject,
            deleteProject: state.deleteProject,
            duplicateProject: state.duplicateProject,
            updateTask: state.updateTask,
            addSection: state.addSection,
            updateSection: state.updateSection,
            deleteSection: state.deleteSection,
            addTask: state.addTask,
            toggleProjectFocus: state.toggleProjectFocus,
            _allTasks: state._allTasks,
            highlightTaskId: state.highlightTaskId,
            setHighlightTask: state.setHighlightTask,
            settings: state.settings,
        }),
        shallow
    );
    const getDerivedState = useTaskStore((state) => state.getDerivedState);
    const { allContexts } = getDerivedState();
    const { t } = useLanguage();
    const { selectedProjectId, setSelectedProjectId } = useUiStore(
        (state) => ({
            selectedProjectId: state.projectView.selectedProjectId,
            setSelectedProjectId: (value: string | null) => state.setProjectView({ selectedProjectId: value }),
        }),
        shallow
    );
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [showNotesPreview, setShowNotesPreview] = useState(true);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [showLinkPrompt, setShowLinkPrompt] = useState(false);
    const [showDeferredProjects, setShowDeferredProjects] = useState(false);
    const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});
    const [showAreaManager, setShowAreaManager] = useState(false);
    const [newAreaName, setNewAreaName] = useState('');
    const [newAreaColor, setNewAreaColor] = useState('#94a3b8');
    const [showQuickAreaPrompt, setShowQuickAreaPrompt] = useState(false);
    const [pendingAreaAssignProjectId, setPendingAreaAssignProjectId] = useState<string | null>(null);
    const [showSectionPrompt, setShowSectionPrompt] = useState(false);
    const [sectionDraft, setSectionDraft] = useState('');
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [sectionNotesOpen, setSectionNotesOpen] = useState<Record<string, boolean>>({});
    const [showSectionTaskPrompt, setShowSectionTaskPrompt] = useState(false);
    const [sectionTaskDraft, setSectionTaskDraft] = useState('');
    const [sectionTaskTargetId, setSectionTaskTargetId] = useState<string | null>(null);
    const [tagDraft, setTagDraft] = useState('');
    const [editProjectTitle, setEditProjectTitle] = useState('');
    const [projectTaskTitle, setProjectTaskTitle] = useState('');
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [isProjectAttachmentBusy, setIsProjectAttachmentBusy] = useState(false);
    const [isProjectDeleting, setIsProjectDeleting] = useState(false);
    const ALL_AREAS = AREA_FILTER_ALL;
    const NO_AREA = AREA_FILTER_NONE;
    const ALL_TAGS = '__all__';
    const NO_TAGS = '__none__';
    const [selectedTag, setSelectedTag] = useState(ALL_TAGS);

    const handleDuplicateProject = useCallback(async (projectId: string) => {
        const created = await duplicateProject(projectId);
        if (created) {
            setSelectedProjectId(created.id);
        }
    }, [duplicateProject, setSelectedProjectId]);

    useEffect(() => {
        if (!perf.enabled) return;
        const timer = window.setTimeout(() => {
            checkBudget('ProjectsView', perf.metrics, 'complex');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [perf.enabled]);

    useEffect(() => {
        setAttachmentError(null);
    }, [selectedProjectId]);

    const {
        selectedArea,
        sortedAreas,
        areaById,
        areaFilterLabel,
        areaSensors,
        toggleAreaCollapse,
        handleAreaDragEnd,
        handleDeleteArea,
    } = useAreaSidebarState({
        areas,
        settings,
        t,
        reorderAreas,
        deleteArea,
        setCollapsedAreas,
    });

    const taskSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        }),
    );

    const getProjectColorForTask = (project: Project) => getProjectColor(project, areaById, DEFAULT_AREA_COLOR);

    const handleAddSection = () => {
        if (!selectedProject) return;
        setEditingSectionId(null);
        setSectionDraft('');
        setShowSectionPrompt(true);
    };

    const handleRenameSection = (section: Section) => {
        setEditingSectionId(section.id);
        setSectionDraft(section.title);
        setShowSectionPrompt(true);
    };

    const handleDeleteSection = async (section: Section) => {
        const confirmed = isTauriRuntime()
            ? await import('@tauri-apps/plugin-dialog').then(({ confirm }) =>
                confirm(t('projects.deleteSectionConfirm'), {
                    title: t('projects.sectionsLabel'),
                    kind: 'warning',
                }),
            )
            : window.confirm(t('projects.deleteSectionConfirm'));
        if (confirmed) {
            deleteSection(section.id);
        }
    };

    const handleToggleSection = (section: Section) => {
        updateSection(section.id, { isCollapsed: !section.isCollapsed });
    };

    const handleToggleSectionNotes = (sectionId: string) => {
        setSectionNotesOpen((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

    const handleOpenSectionTaskPrompt = (sectionId: string) => {
        setSectionTaskTargetId(sectionId);
        setSectionTaskDraft('');
        setShowSectionTaskPrompt(true);
    };

    const sortAreasByName = () => reorderAreas(sortAreasByNameIds(sortedAreas));
    const sortAreasByColor = () => reorderAreas(sortAreasByColorIds(sortedAreas));

    // Group tasks by project to avoid O(N*M) filtering
    const { tasksByProject } = useMemo(() => {
        const map = projects.reduce((acc, project) => {
            acc[project.id] = [];
            return acc;
        }, {} as Record<string, Task[]>);
        tasks.forEach(task => {
            if (task.projectId && !task.deletedAt && task.status !== 'done' && task.status !== 'reference') {
                if (map[task.projectId]) {
                    map[task.projectId].push(task);
                }
            }
        });
        return {
            tasksByProject: map,
        };
    }, [projects, tasks]);

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

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectTitle.trim() || isCreatingProject) return;
        setIsCreatingProject(true);
        try {
            const resolvedAreaId =
                selectedArea !== ALL_AREAS && selectedArea !== NO_AREA ? selectedArea : undefined;
            const areaColor = resolvedAreaId ? areaById.get(resolvedAreaId)?.color : undefined;
            await addProject(
                newProjectTitle,
                areaColor || '#94a3b8',
                resolvedAreaId ? { areaId: resolvedAreaId } : undefined
            );
            setNewProjectTitle('');
            setIsCreating(false);
        } finally {
            setIsCreatingProject(false);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    useEffect(() => {
        if (!selectedProjectId || !selectedProject) return;
        if (!projectMatchesAreaFilter(selectedProject, selectedArea, areaById)) {
            setSelectedProjectId(null);
        }
    }, [areaById, selectedArea, selectedProject, selectedProjectId, setSelectedProjectId]);

    useEffect(() => {
        setEditProjectTitle(selectedProject?.title ?? '');
    }, [selectedProject?.id, selectedProject?.title]);
    const projectAllTasks = useMemo(() => {
        if (!selectedProjectId) return [];
        return _allTasks.filter((task) => !task.deletedAt && task.projectId === selectedProjectId);
    }, [selectedProjectId, _allTasks]);
    const projectTasks = useMemo(() => (
        projectAllTasks.filter((task) => task.status !== 'done' && task.status !== 'reference' && task.status !== 'archived')
    ), [projectAllTasks]);

    const sortProjectTasks = useCallback((items: Task[]) => {
        const sorted = [...items];
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
    }, []);

    const orderedProjectTasks = useMemo(() => {
        if (!selectedProject) return projectTasks;
        return sortProjectTasks(projectTasks);
    }, [projectTasks, selectedProject, sortProjectTasks]);

    const projectSections = useMemo(() => {
        if (!selectedProjectId) return [];
        return sections
            .filter((section) => section.projectId === selectedProjectId && !section.deletedAt)
            .sort((a, b) => {
                const aOrder = Number.isFinite(a.order) ? a.order : 0;
                const bOrder = Number.isFinite(b.order) ? b.order : 0;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.title.localeCompare(b.title);
            });
    }, [sections, selectedProjectId]);

    const sectionTaskGroups = useMemo(() => {
        if (!selectedProjectId || projectSections.length === 0) {
            return { sections: [] as Array<{ section: Section; tasks: Task[] }>, unsectioned: orderedProjectTasks };
        }
        const sectionIds = new Set(projectSections.map((section) => section.id));
        const tasksBySection = new Map<string, Task[]>();
        const unsectioned: Task[] = [];
        projectTasks.forEach((task) => {
            const sectionId = task.sectionId && sectionIds.has(task.sectionId) ? task.sectionId : null;
            if (sectionId) {
                const list = tasksBySection.get(sectionId) ?? [];
                list.push(task);
                tasksBySection.set(sectionId, list);
            } else {
                unsectioned.push(task);
            }
        });
        const sectionsWithTasks = projectSections.map((section) => ({
            section,
            tasks: sortProjectTasks(tasksBySection.get(section.id) ?? []),
        }));
        return { sections: sectionsWithTasks, unsectioned: sortProjectTasks(unsectioned) };
    }, [orderedProjectTasks, projectSections, projectTasks, selectedProjectId, sortProjectTasks]);

    const orderedProjectTaskList = useMemo(() => {
        if (projectSections.length === 0) return orderedProjectTasks;
        const combined: Task[] = [];
        sectionTaskGroups.sections.forEach((group) => {
            combined.push(...group.tasks);
        });
        if (sectionTaskGroups.unsectioned.length > 0) {
            combined.push(...sectionTaskGroups.unsectioned);
        }
        return combined;
    }, [orderedProjectTasks, projectSections.length, sectionTaskGroups.sections, sectionTaskGroups.unsectioned]);

    useEffect(() => {
        if (!highlightTaskId) return;
        const exists = orderedProjectTaskList.some((task) => task.id === highlightTaskId);
        if (!exists) return;
        const el = document.querySelector(`[data-task-id="${highlightTaskId}"]`) as HTMLElement | null;
        if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        const timer = window.setTimeout(() => setHighlightTask(null), 4000);
        return () => window.clearTimeout(timer);
    }, [highlightTaskId, orderedProjectTaskList, setHighlightTask]);

    const { taskIdsByContainer, taskIdToContainer } = useMemo(() => {
        const idsByContainer = new Map<string, string[]>();
        const idToContainer = new Map<string, string>();
        sectionTaskGroups.sections.forEach((group) => {
            const containerId = getSectionContainerId(group.section.id);
            const ids = group.tasks.map((task) => task.id);
            idsByContainer.set(containerId, ids);
            ids.forEach((id) => idToContainer.set(id, containerId));
        });
        const unsectionedIds = sectionTaskGroups.unsectioned.map((task) => task.id);
        idsByContainer.set(NO_SECTION_CONTAINER, unsectionedIds);
        unsectionedIds.forEach((id) => idToContainer.set(id, NO_SECTION_CONTAINER));
        return { taskIdsByContainer: idsByContainer, taskIdToContainer: idToContainer };
    }, [sectionTaskGroups]);

    const handleTaskDragEnd = useCallback((event: DragEndEvent) => {
        if (!selectedProject) return;
        const { active, over } = event;
        if (!over) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        const sourceContainer = taskIdToContainer.get(activeId);
        const destinationContainer =
            taskIdToContainer.get(overId) ||
            (taskIdsByContainer.has(overId) ? overId : undefined);
        if (!sourceContainer || !destinationContainer) return;

        const sourceItems = taskIdsByContainer.get(sourceContainer) ?? [];
        const destinationItems = taskIdsByContainer.get(destinationContainer) ?? [];

        if (sourceContainer === destinationContainer) {
            const oldIndex = sourceItems.indexOf(activeId);
            if (oldIndex === -1) return;
            const newIndex = taskIdToContainer.has(overId)
                ? sourceItems.indexOf(overId)
                : sourceItems.length - 1;
            if (newIndex === -1 || oldIndex === newIndex) return;
            const reordered = arrayMove(sourceItems, oldIndex, newIndex);
            reorderProjectTasks(selectedProject.id, reordered, getSectionIdFromContainer(sourceContainer));
            return;
        }

        const sourceIndex = sourceItems.indexOf(activeId);
        if (sourceIndex === -1) return;
        const nextSourceItems = [...sourceItems];
        nextSourceItems.splice(sourceIndex, 1);

        const nextDestinationItems = [...destinationItems];
        const overIndex = taskIdToContainer.has(overId) ? nextDestinationItems.indexOf(overId) : -1;
        const insertIndex = overIndex === -1 ? nextDestinationItems.length : overIndex;
        nextDestinationItems.splice(insertIndex, 0, activeId);

        const nextSectionId = getSectionIdFromContainer(destinationContainer) ?? undefined;
        updateTask(activeId, { sectionId: nextSectionId });
        if (nextSourceItems.length > 0) {
            reorderProjectTasks(selectedProject.id, nextSourceItems, getSectionIdFromContainer(sourceContainer));
        }
        reorderProjectTasks(selectedProject.id, nextDestinationItems, getSectionIdFromContainer(destinationContainer));
    }, [reorderProjectTasks, selectedProject, taskIdToContainer, taskIdsByContainer, updateTask]);

    const renderSortableTasks = (list: Task[]) => (
        <SortableContext items={list.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
                {list.map((task) => (
                    <SortableProjectTaskRow key={task.id} task={task} project={selectedProject!} />
                ))}
            </div>
        </SortableContext>
    );
    const renderProjectSections = (renderTasks: (list: Task[]) => ReactNode) => {
        if (projectSections.length === 0) {
            return (
                <SectionDropZone id={NO_SECTION_CONTAINER} className="min-h-[120px]">
                    {orderedProjectTasks.length > 0 ? (
                        renderTasks(orderedProjectTasks)
                    ) : (
                        <div className="text-center text-muted-foreground py-12">
                            {t('projects.noActiveTasks')}
                        </div>
                    )}
                </SectionDropZone>
            );
        }
        return (
            <div className="space-y-4">
                {sectionTaskGroups.sections.map((group) => {
                    const isCollapsed = group.section.isCollapsed;
                    const taskCount = group.tasks.length;
                    const hasNotes = Boolean(group.section.description?.trim());
                    const notesOpen = sectionNotesOpen[group.section.id] ?? false;
                    return (
                        <SectionDropZone
                            key={group.section.id}
                            id={getSectionContainerId(group.section.id)}
                            className="border border-border rounded-lg bg-card/40"
                        >
                            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                                <button
                                    type="button"
                                    onClick={() => handleToggleSection(group.section)}
                                    className="flex items-center gap-2 text-sm font-semibold"
                                >
                                    {isCollapsed ? (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span>{group.section.title}</span>
                                    <span className="text-xs text-muted-foreground">{taskCount}</span>
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenSectionTaskPrompt(group.section.id)}
                                        className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                        aria-label={t('projects.addTask')}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleSectionNotes(group.section.id)}
                                        className={cn(
                                            'p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground',
                                            (hasNotes || notesOpen) && 'text-primary'
                                        )}
                                        aria-label={t('projects.sectionNotes')}
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRenameSection(group.section)}
                                        className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                        aria-label={t('common.edit')}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteSection(group.section)}
                                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                        aria-label={t('common.delete')}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                            {notesOpen && (
                                <div className="px-3 py-2 border-b border-border/60">
                                    <textarea
                                        className="w-full min-h-[90px] p-2 text-xs bg-transparent border border-border rounded resize-y focus:outline-none focus:bg-accent/5"
                                        placeholder={t('projects.sectionNotesPlaceholder')}
                                        defaultValue={group.section.description || ''}
                                        onBlur={(event) => {
                                            const nextValue = event.target.value.trimEnd();
                                            updateSection(group.section.id, { description: nextValue || undefined });
                                        }}
                                    />
                                </div>
                            )}
                            {!isCollapsed && (
                                <div className="p-3">
                                    {taskCount > 0 ? (
                                        renderTasks(group.tasks)
                                    ) : (
                                        <div className="text-xs text-muted-foreground py-2">
                                            {t('projects.noActiveTasks')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </SectionDropZone>
                    );
                })}
                <SectionDropZone
                    id={NO_SECTION_CONTAINER}
                    className="border border-dashed border-border rounded-lg bg-card/20"
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <span>{t('projects.noSection')}</span>
                            <span className="text-xs text-muted-foreground">
                                {sectionTaskGroups.unsectioned.length}
                            </span>
                        </div>
                    </div>
                    <div className="p-3">
                        {sectionTaskGroups.unsectioned.length > 0 ? (
                            renderTasks(sectionTaskGroups.unsectioned)
                        ) : (
                            <div className="text-xs text-muted-foreground py-2">
                                {t('projects.noActiveTasks')}
                            </div>
                        )}
                    </div>
                </SectionDropZone>
                {sectionTaskGroups.sections.length === 0 && sectionTaskGroups.unsectioned.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">
                        {t('projects.noActiveTasks')}
                    </div>
                )}
            </div>
        );
    };
    const tasksContent = (
        <DndContext
            sensors={taskSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTaskDragEnd}
        >
            {renderProjectSections(renderSortableTasks)}
        </DndContext>
    );

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
            setIsProjectDeleting(true);
            try {
                await Promise.resolve(deleteProject(selectedProject.id));
                setSelectedProjectId(null);
            } finally {
                setIsProjectDeleting(false);
            }
        }
    };
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

    useEffect(() => {
        setSectionNotesOpen({});
        setShowSectionTaskPrompt(false);
        setSectionTaskTargetId(null);
    }, [selectedProjectId]);

    const handleAddTaskForProject = useCallback(
        async (value: string, sectionId?: string | null) => {
            if (!selectedProject) return;
            const { title: parsedTitle, props, projectTitle } = parseQuickAdd(value, projects, new Date(), areas);
            const finalTitle = (parsedTitle || value).trim();
            if (!finalTitle) return;
            const initialProps: Partial<Task> = { projectId: selectedProject.id, status: 'next', ...props };
            if (!props.status) initialProps.status = 'next';
            if (!props.projectId) initialProps.projectId = selectedProject.id;
            if (!initialProps.projectId && projectTitle) {
                const created = await addProject(projectTitle, '#94a3b8');
                if (!created) return;
                initialProps.projectId = created.id;
            }
            if (sectionId && initialProps.projectId === selectedProject.id) {
                initialProps.sectionId = sectionId;
            } else {
                initialProps.sectionId = undefined;
            }
            await addTask(finalTitle, initialProps);
        },
        [addProject, addTask, projects, selectedProject]
    );

    const openAttachment = async (attachment: Attachment) => {
        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(attachment.uri);
        const normalized = hasScheme ? attachment.uri : `file://${attachment.uri}`;
        if (isTauriRuntime()) {
            try {
                await invoke('open_path', { path: attachment.uri });
                return;
            } catch (error) {
                void logWarn('Failed to open attachment', {
                    scope: 'attachment',
                    extra: { error: error instanceof Error ? error.message : String(error) },
                });
            }
        }
        window.open(normalized, '_blank');
    };

    const addProjectFileAttachment = async () => {
        if (!selectedProject) return;
        if (isProjectAttachmentBusy) return;
        if (!isTauriRuntime()) {
            setAttachmentError(t('attachments.fileNotSupported'));
            return;
        }
        setIsProjectAttachmentBusy(true);
        setAttachmentError(null);
        try {
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
                void logWarn('Failed to validate attachment size', {
                    scope: 'attachment',
                    extra: { error: error instanceof Error ? error.message : String(error) },
                });
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
        } finally {
            setIsProjectAttachmentBusy(false);
        }
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
            <div className="h-full">
                <div className="flex h-full gap-6">
                    <ProjectsSidebar
                        t={t}
                        areaFilterLabel={areaFilterLabel ?? undefined}
                        selectedTag={selectedTag}
                        noAreaId={NO_AREA}
                        allTagsId={ALL_TAGS}
                        noTagsId={NO_TAGS}
                        tagOptions={tagOptions}
                        isCreating={isCreating}
                        isCreatingProject={isCreatingProject}
                        newProjectTitle={newProjectTitle}
                        onStartCreate={() => setIsCreating(true)}
                        onCancelCreate={() => setIsCreating(false)}
                        onCreateProject={handleCreateProject}
                        onChangeNewProjectTitle={setNewProjectTitle}
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
                        getProjectColor={getProjectColorForTask}
                        tasksByProject={tasksByProject}
                        projects={projects}
                        toggleProjectFocus={toggleProjectFocus}
                        reorderProjects={reorderProjects}
                        onDuplicateProject={handleDuplicateProject}
                    />

                    {/* Project Details & Tasks */}
                    <div className="flex-1 flex flex-col h-full min-h-0">
                        {selectedProject ? (
                            <>
                                <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4">
                                    <ProjectDetailsHeader
                                        project={selectedProject}
                                        projectColor={getProjectColorForTask(selectedProject)}
                                        editTitle={editProjectTitle}
                                        onEditTitleChange={setEditProjectTitle}
                                        onCommitTitle={handleCommitProjectTitle}
                                        onResetTitle={handleResetProjectTitle}
                                        onToggleSequential={() => updateProject(selectedProject.id, { isSequential: !selectedProject.isSequential })}
                                        onChangeStatus={(status) => updateProject(selectedProject.id, { status })}
                                        onDuplicate={() => handleDuplicateProject(selectedProject.id)}
                                        onArchive={handleArchiveProject}
                                        onReactivate={() => updateProject(selectedProject.id, { status: 'active' })}
                                        onDelete={handleDeleteProject}
                                        isDeleting={isProjectDeleting}
                                        projectProgress={projectProgress}
                                        t={t}
                                    />

                                    <ProjectNotesSection
                                        project={selectedProject}
                                        notesExpanded={notesExpanded}
                                    onToggleNotes={() => {
                                        setNotesExpanded((prev) => {
                                            const next = !prev;
                                            if (next) setShowNotesPreview(true);
                                            return next;
                                        });
                                    }}
                                        showNotesPreview={showNotesPreview}
                                        onTogglePreview={() => setShowNotesPreview((value) => !value)}
                                        onAddFile={addProjectFileAttachment}
                                        onAddLink={addProjectLinkAttachment}
                                        attachmentsBusy={isProjectAttachmentBusy}
                                        visibleAttachments={visibleAttachments}
                                        attachmentError={attachmentError}
                                        onOpenAttachment={openAttachment}
                                        onRemoveAttachment={removeProjectAttachment}
                                        onUpdateNotes={(value) => updateProject(selectedProject.id, { supportNotes: value })}
                                        t={t}
                                    />

                                    <ProjectDetailsFields
                                        project={selectedProject}
                                        selectedAreaId={
                                            selectedProject.areaId && areaById.has(selectedProject.areaId)
                                                ? selectedProject.areaId
                                                : NO_AREA
                                        }
                                        sortedAreas={sortedAreas}
                                        noAreaId={NO_AREA}
                                        t={t}
                                        tagDraft={tagDraft}
                                        onTagDraftChange={setTagDraft}
                                        onCommitTags={() => {
                                            const tags = parseTagInput(tagDraft);
                                            updateProject(selectedProject.id, { tagIds: tags });
                                        }}
                                        onNewArea={() => {
                                            setPendingAreaAssignProjectId(selectedProject.id);
                                            setShowQuickAreaPrompt(true);
                                        }}
                                        onManageAreas={() => setShowAreaManager(true)}
                                        onAreaChange={(value) => {
                                            updateProject(selectedProject.id, { areaId: value === NO_AREA ? undefined : value });
                                        }}
                                        reviewAtValue={toDateTimeLocalValue(selectedProject.reviewAt)}
                                        onReviewAtChange={(value) => updateProject(selectedProject.id, { reviewAt: value || undefined })}
                                        projectTaskTitle={projectTaskTitle}
                                        onProjectTaskTitleChange={setProjectTaskTitle}
                                        onSubmitProjectTask={async (value) => {
                                            await handleAddTaskForProject(value);
                                            setProjectTaskTitle('');
                                        }}
                                        projects={projects}
                                        contexts={allContexts}
                                        onCreateProject={async (title) => {
                                            const created = await addProject(title, '#94a3b8');
                                            return created?.id ?? null;
                                        }}
                                    />

                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                                {t('projects.sectionsLabel')}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAddSection}
                                                className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded border border-border bg-muted/40 hover:bg-muted transition-colors"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                {t('projects.addSection')}
                                            </button>
                                        </div>
                                        {tasksContent}
                                </div>
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
                    isOpen={showSectionPrompt}
                    title={editingSectionId ? t('projects.sectionsLabel') : t('projects.addSection')}
                    description={t('projects.sectionPlaceholder')}
                    placeholder={t('projects.sectionPlaceholder')}
                    defaultValue={sectionDraft}
                    confirmLabel={editingSectionId ? t('common.save') : t('projects.create')}
                    cancelLabel={t('common.cancel')}
                    onCancel={() => {
                        setShowSectionPrompt(false);
                        setEditingSectionId(null);
                        setSectionDraft('');
                    }}
                    onConfirm={(value) => {
                        if (!selectedProject) return;
                        const trimmed = value.trim();
                        if (!trimmed) return;
                        if (editingSectionId) {
                            updateSection(editingSectionId, { title: trimmed });
                        } else {
                            addSection(selectedProject.id, trimmed);
                        }
                        setShowSectionPrompt(false);
                        setEditingSectionId(null);
                        setSectionDraft('');
                    }}
                />

                <PromptModal
                    isOpen={showSectionTaskPrompt}
                    title={t('projects.addTask')}
                    description={t('projects.addTaskPlaceholder')}
                    placeholder={t('projects.addTaskPlaceholder')}
                    defaultValue={sectionTaskDraft}
                    confirmLabel={t('projects.addTask')}
                    cancelLabel={t('common.cancel')}
                    onCancel={() => {
                        setShowSectionTaskPrompt(false);
                        setSectionTaskTargetId(null);
                        setSectionTaskDraft('');
                    }}
                    onConfirm={async (value) => {
                        if (!sectionTaskTargetId) return;
                        await handleAddTaskForProject(value, sectionTaskTargetId);
                        setShowSectionTaskPrompt(false);
                        setSectionTaskTargetId(null);
                        setSectionTaskDraft('');
                    }}
                />

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
            </div>
        </ErrorBoundary>
    );
}
