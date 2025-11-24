export type TaskStatus = 'inbox' | 'next' | 'waiting' | 'someday' | 'done';

export interface Project {
    id: string;
    title: string;
    status: 'active' | 'completed' | 'archived';
    color: string;
    createdAt: string;
    updatedAt: string;
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    startTime?: string; // ISO date string
    dueDate?: string; // ISO date string
    recurrence?: string; // e.g., 'daily', 'weekly', 'monthly'
    tags: string[];
    contexts: string[]; // e.g., '@home', '@work'
    projectId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AppData {
    tasks: Task[];
    projects: Project[];
    settings: {
        theme?: 'light' | 'dark';
    };
}
