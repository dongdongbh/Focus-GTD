import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, AppData, Project } from '../types';
import { api } from '../lib/api';

interface TaskStore {
    tasks: Task[];
    projects: Project[];
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchData: () => Promise<void>;
    addTask: (title: string, initialProps?: Partial<Task>) => Promise<void>;
    updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
    moveTask: (id: string, newStatus: TaskStatus) => Promise<void>;

    // Project Actions
    addProject: (title: string, color: string) => Promise<void>;
    updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
}

// Debounce save helper
let saveTimeout: NodeJS.Timeout;
const debouncedSave = (data: AppData) => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        api.saveData(data).catch(console.error);
    }, 1000);
};

export const useTaskStore = create<TaskStore>((set, get) => ({
    tasks: [],
    projects: [],
    isLoading: false,
    error: null,

    fetchData: async () => {
        set({ isLoading: true, error: null });
        try {
            const data = await api.getData();
            set({ tasks: data.tasks, projects: data.projects || [], isLoading: false });
        } catch (err) {
            set({ error: 'Failed to fetch data', isLoading: false });
        }
    },

    addTask: async (title: string, initialProps?: Partial<Task>) => {
        const newTask: Task = {
            id: uuidv4(),
            title,
            status: 'inbox',
            tags: [],
            contexts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...initialProps,
        };

        const newTasks = [...get().tasks, newTask];
        set({ tasks: newTasks });
        debouncedSave({ tasks: newTasks, projects: get().projects, settings: {} });
    },

    updateTask: async (id: string, updates: Partial<Task>) => {
        const newTasks = get().tasks.map((task) =>
            task.id === id
                ? { ...task, ...updates, updatedAt: new Date().toISOString() }
                : task
        );
        set({ tasks: newTasks });
        debouncedSave({ tasks: newTasks, projects: get().projects, settings: {} });
    },

    deleteTask: async (id: string) => {
        const newTasks = get().tasks.filter((task) => task.id !== id);
        set({ tasks: newTasks });
        debouncedSave({ tasks: newTasks, projects: get().projects, settings: {} });
    },

    moveTask: async (id: string, newStatus: TaskStatus) => {
        const newTasks = get().tasks.map((task) =>
            task.id === id
                ? { ...task, status: newStatus, updatedAt: new Date().toISOString() }
                : task
        );
        set({ tasks: newTasks });
        debouncedSave({ tasks: newTasks, projects: get().projects, settings: {} });
    },

    addProject: async (title: string, color: string) => {
        const newProject: Project = {
            id: uuidv4(),
            title,
            color,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const newProjects = [...get().projects, newProject];
        set({ projects: newProjects });
        debouncedSave({ tasks: get().tasks, projects: newProjects, settings: {} });
    },

    updateProject: async (id: string, updates: Partial<Project>) => {
        const newProjects = get().projects.map((project) =>
            project.id === id ? { ...project, ...updates, updatedAt: new Date().toISOString() } : project
        );
        set({ projects: newProjects });
        debouncedSave({ tasks: get().tasks, projects: newProjects, settings: {} });
    },

    deleteProject: async (id: string) => {
        const newProjects = get().projects.filter((project) => project.id !== id);
        // Optional: Remove projectId from tasks that belonged to this project
        const newTasks = get().tasks.map(task =>
            task.projectId === id ? { ...task, projectId: undefined } : task
        );
        set({ projects: newProjects, tasks: newTasks });
        debouncedSave({ tasks: newTasks, projects: newProjects, settings: {} });
    },
}));

