import { useState } from 'react';
import { useTaskStore, Task } from '@mindwtr/core';
import { TaskItem } from '../TaskItem';
import { Plus, Folder, Trash2, ListOrdered, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/language-context';
import { confirm } from '@tauri-apps/plugin-dialog';

export function ProjectsView() {
    const { projects, tasks, addProject, updateProject, deleteProject, addTask, toggleProjectFocus } = useTaskStore();
    const { t } = useLanguage();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [newProjectColor, setNewProjectColor] = useState('#3b82f6'); // Default blue
    const [notesExpanded, setNotesExpanded] = useState(false);

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

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (newProjectTitle.trim()) {
            addProject(newProjectTitle, newProjectColor);
            setNewProjectTitle('');
            setIsCreating(false);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectTasks = selectedProjectId
        ? tasks.filter(t => t.projectId === selectedProjectId && t.status !== 'done' && !t.deletedAt)
        : [];

    return (
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
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={newProjectColor}
                                onChange={(e) => setNewProjectColor(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                            />
                            <span className="text-xs text-muted-foreground">{t('projects.color')}</span>
                        </div>
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

                <div className="space-y-1 overflow-y-auto flex-1">
                    {/* Sort: focused projects first, then by title */}
                    {[...projects]
                        .sort((a, b) => {
                            if (a.isFocused && !b.isFocused) return -1;
                            if (!a.isFocused && b.isFocused) return 1;
                            return a.title.localeCompare(b.title);
                        })
                        .map(project => {
                            const projTasks = tasksByProject[project.id] || [];
                            // Optimize: Single pass to find todo (priority) or next (fallback)
                            let nextAction = undefined;
                            let nextCandidate = undefined;
                            for (const t of projTasks) {
                                if (t.status === 'todo') {
                                    nextAction = t;
                                    break;
                                }
                                if (!nextCandidate && t.status === 'next') {
                                    nextCandidate = t;
                                }
                            }
                            nextAction = nextAction || nextCandidate;
                            const focusedCount = projects.filter(p => p.isFocused).length;

                            return (
                                <div
                                    key={project.id}
                                    className={cn(
                                        "rounded-lg cursor-pointer transition-colors text-sm border",
                                        selectedProjectId === project.id
                                            ? "bg-accent text-accent-foreground border-accent"
                                            : project.isFocused
                                                ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                                                : "border-transparent hover:bg-muted/50"
                                    )}
                                >
                                    <div
                                        className="flex items-center gap-2 p-2"
                                        onClick={() => setSelectedProjectId(project.id)}
                                    >
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
                                        <Folder className="w-4 h-4" style={{ color: project.color }} />
                                        <span className="flex-1 truncate">{project.title}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {projTasks.length}
                                        </span>
                                    </div>
                                    {/* Show project's next action */}
                                    <div className="px-2 pb-2 pl-8">
                                        {nextAction ? (
                                            <span className="text-xs text-muted-foreground truncate block">
                                                ↳ {nextAction.title}
                                            </span>
                                        ) : projTasks.length > 0 ? (
                                            <span className="text-xs text-amber-600 dark:text-amber-400">
                                                ⚠️ No next action
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}

                    {projects.length === 0 && !isCreating && (
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
                        <header className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedProject.color }} />
                                <h2 className="text-2xl font-bold">{selectedProject.title}</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* Sequential Toggle */}
                                <button
                                    type="button"
                                    onClick={() => updateProject(selectedProject.id, { isSequential: !selectedProject.isSequential })}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                        selectedProject.isSequential
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                    )}
                                    title={selectedProject.isSequential ? "Sequential: Only first task shows in Next Actions" : "Parallel: All tasks show in Next Actions"}
                                >
                                    <ListOrdered className="w-4 h-4" />
                                    {selectedProject.isSequential ? 'Sequential' : 'Parallel'}
                                </button>
                                <button
                                    type="button"
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        const confirmed = await confirm(t('projects.deleteConfirm'), {
                                            title: t('projects.title'),
                                            kind: 'warning'
                                        });
                                        if (confirmed) {
                                            deleteProject(selectedProject.id);
                                            setSelectedProjectId(null);
                                        }
                                    }}
                                    className="text-destructive hover:bg-destructive/10 p-2 rounded-md transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </header>

                        <div className="mb-6 border rounded-lg overflow-hidden bg-card">
                            <button
                                onClick={() => setNotesExpanded(!notesExpanded)}
                                className="w-full flex items-center gap-2 p-2 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
                            >
                                {notesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                Project Notes
                            </button>
                            {notesExpanded && (
                                <div className="p-0">
                                    <textarea
                                        className="w-full min-h-[120px] p-3 text-sm bg-transparent border-none resize-y focus:outline-none focus:bg-accent/5"
                                        placeholder="Add context, plans, or reference notes for this project..."
                                        defaultValue={selectedProject.supportNotes || ''}
                                        onBlur={(e) => updateProject(selectedProject.id, { supportNotes: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mb-6">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const input = form.elements.namedItem('taskTitle') as HTMLInputElement;
                                    if (input.value.trim()) {
                                        addTask(input.value, { projectId: selectedProject.id, status: 'todo' });
                                        input.value = '';
                                    }
                                }}
                                className="flex gap-2"
                            >
                                <input
                                    name="taskTitle"
                                    type="text"
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
    );
}

