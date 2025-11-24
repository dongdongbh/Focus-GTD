import React, { useState } from 'react';
import { useTaskStore } from '../../store/store';
import { TaskItem } from '../TaskItem';
import { Plus, Folder, Trash2, Edit2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ProjectsView() {
    const { projects, tasks, addProject, updateProject, deleteProject } = useTaskStore();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');
    const [newProjectColor, setNewProjectColor] = useState('#3b82f6'); // Default blue

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
        ? tasks.filter(t => t.projectId === selectedProjectId && t.status !== 'done')
        : [];

    return (
        <div className="flex h-full gap-6">
            {/* Sidebar List of Projects */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-4 border-r border-border pr-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight">Projects</h2>
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
                            placeholder="Project Name"
                            className="w-full bg-transparent border-b border-primary/50 p-1 text-sm focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={newProjectColor}
                                onChange={(e) => setNewProjectColor(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                            />
                            <span className="text-xs text-muted-foreground">Color</span>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="text-xs px-2 py-1 hover:bg-muted rounded"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                            >
                                Create
                            </button>
                        </div>
                    </form>
                )}

                <div className="space-y-1 overflow-y-auto flex-1">
                    {projects.map(project => (
                        <div
                            key={project.id}
                            onClick={() => setSelectedProjectId(project.id)}
                            className={cn(
                                "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm",
                                selectedProjectId === project.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                            )}
                        >
                            <Folder className="w-4 h-4" style={{ color: project.color }} />
                            <span className="flex-1 truncate">{project.title}</span>
                            <span className="text-xs text-muted-foreground">
                                {tasks.filter(t => t.projectId === project.id && t.status !== 'done').length}
                            </span>
                        </div>
                    ))}

                    {projects.length === 0 && !isCreating && (
                        <div className="text-sm text-muted-foreground text-center py-8">
                            No projects yet.
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
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to delete this project?')) {
                                        deleteProject(selectedProject.id);
                                        setSelectedProjectId(null);
                                    }
                                }}
                                className="text-destructive hover:bg-destructive/10 p-2 rounded-md transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {projectTasks.length > 0 ? (
                                projectTasks.map(task => (
                                    <TaskItem key={task.id} task={task} />
                                ))
                            ) : (
                                <div className="text-center text-muted-foreground py-12">
                                    No active tasks in this project.
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                            <Folder className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>Select a project to view tasks</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
