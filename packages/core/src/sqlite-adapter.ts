import type { AppData, Area, Project, Task } from './types';
import type { TaskQueryOptions, SearchResults } from './storage';
import { SQLITE_SCHEMA } from './sqlite-schema';

export interface SqliteClient {
    run(sql: string, params?: unknown[]): Promise<void>;
    all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
    exec?(sql: string): Promise<void>;
}

const toJson = (value: unknown) => (value === undefined ? null : JSON.stringify(value));
const fromJson = <T>(value: unknown, fallback: T): T => {
    if (value === null || value === undefined || value === '') return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
};

const toBool = (value?: boolean) => (value ? 1 : 0);
const fromBool = (value: unknown) => Boolean(value);

export class SqliteAdapter {
    private client: SqliteClient;

    constructor(client: SqliteClient) {
        this.client = client;
    }

    async ensureSchema() {
        if (this.client.exec) {
            await this.client.exec(SQLITE_SCHEMA);
        } else {
            await this.client.run(SQLITE_SCHEMA);
        }
        await this.ensureProjectOrderColumn();
        await this.ensureFtsPopulated();
    }

    private async ensureProjectOrderColumn() {
        const columns = await this.client.all<{ name?: string }>('PRAGMA table_info(projects)');
        const hasOrder = columns.some((col) => col.name === 'orderNum');
        if (!hasOrder) {
            await this.client.run('ALTER TABLE projects ADD COLUMN orderNum INTEGER');
        }
    }

    private async ensureFtsPopulated() {
        const taskCountRow = await this.client.get<{ count?: number }>('SELECT COUNT(*) as count FROM tasks_fts');
        const taskCount = Number(taskCountRow?.count ?? 0);
        if (taskCount === 0) {
            await this.client.run(
                `INSERT INTO tasks_fts (id, title, description, tags, contexts)
                 SELECT id, title, coalesce(description, ''), coalesce(tags, ''), coalesce(contexts, '') FROM tasks`
            );
        }

        const projectCountRow = await this.client.get<{ count?: number }>('SELECT COUNT(*) as count FROM projects_fts');
        const projectCount = Number(projectCountRow?.count ?? 0);
        if (projectCount === 0) {
            await this.client.run(
                `INSERT INTO projects_fts (id, title, supportNotes, tagIds, areaTitle)
                 SELECT id, title, coalesce(supportNotes, ''), coalesce(tagIds, ''), coalesce(areaTitle, '') FROM projects`
            );
        }
    }

    private mapTaskRow(row: Record<string, unknown>): Task {
        return {
            id: String(row.id),
            title: String(row.title ?? ''),
            status: row.status as Task['status'],
            priority: row.priority as Task['priority'] | undefined,
            taskMode: row.taskMode as Task['taskMode'] | undefined,
            startTime: row.startTime as string | undefined,
            dueDate: row.dueDate as string | undefined,
            recurrence: fromJson<Task['recurrence']>(row.recurrence, undefined),
            pushCount: row.pushCount === null || row.pushCount === undefined ? undefined : Number(row.pushCount),
            tags: fromJson<string[]>(row.tags, []),
            contexts: fromJson<string[]>(row.contexts, []),
            checklist: fromJson<Task['checklist']>(row.checklist, undefined),
            description: row.description as string | undefined,
            attachments: fromJson<Task['attachments']>(row.attachments, undefined),
            location: row.location as string | undefined,
            projectId: row.projectId as string | undefined,
            isFocusedToday: fromBool(row.isFocusedToday),
            timeEstimate: row.timeEstimate as Task['timeEstimate'] | undefined,
            reviewAt: row.reviewAt as string | undefined,
            completedAt: row.completedAt as string | undefined,
            createdAt: String(row.createdAt ?? ''),
            updatedAt: String(row.updatedAt ?? ''),
            deletedAt: row.deletedAt as string | undefined,
        };
    }

    private mapProjectRow(row: Record<string, unknown>): Project {
        return {
            id: String(row.id),
            title: String(row.title ?? ''),
            status: row.status as Project['status'],
            color: String(row.color ?? '#6B7280'),
            order: row.orderNum === null || row.orderNum === undefined ? NaN : Number(row.orderNum),
            tagIds: fromJson<string[]>(row.tagIds, []),
            isSequential: fromBool(row.isSequential),
            isFocused: fromBool(row.isFocused),
            supportNotes: row.supportNotes as string | undefined,
            attachments: fromJson<Project['attachments']>(row.attachments, undefined),
            reviewAt: row.reviewAt as string | undefined,
            areaId: row.areaId as string | undefined,
            areaTitle: row.areaTitle as string | undefined,
            createdAt: String(row.createdAt ?? ''),
            updatedAt: String(row.updatedAt ?? ''),
            deletedAt: row.deletedAt as string | undefined,
        };
    }

    async getData(): Promise<AppData> {
        await this.ensureSchema();
        const tasksRows = await this.client.all<Record<string, unknown>>('SELECT * FROM tasks');
        const projectsRows = await this.client.all<Record<string, unknown>>('SELECT * FROM projects');
        const areasRows = await this.client.all<Record<string, unknown>>('SELECT * FROM areas');
        const settingsRow = await this.client.get<Record<string, unknown>>('SELECT data FROM settings WHERE id = 1');

        const tasks: Task[] = tasksRows.map((row) => this.mapTaskRow(row));
        const projects: Project[] = projectsRows.map((row) => this.mapProjectRow(row));

        const areas: Area[] = areasRows.map((row) => ({
            id: String(row.id),
            name: String(row.name ?? ''),
            color: row.color as string | undefined,
            icon: row.icon as string | undefined,
            order: Number(row.orderNum ?? 0),
            createdAt: row.createdAt as string | undefined,
            updatedAt: row.updatedAt as string | undefined,
        }));

        const settings = settingsRow?.data ? fromJson<AppData['settings']>(settingsRow.data, {}) : {};

        return { tasks, projects, areas, settings };
    }

    async queryTasks(options: TaskQueryOptions): Promise<Task[]> {
        await this.ensureSchema();
        const where: string[] = [];
        const params: unknown[] = [];
        const includeDeleted = options.includeDeleted === true;
        const includeArchived = options.includeArchived === true;

        if (!includeDeleted) {
            where.push('deletedAt IS NULL');
        }
        if (!includeArchived) {
            where.push("status != 'archived'");
        }
        if (options.status && options.status !== 'all') {
            where.push('status = ?');
            params.push(options.status);
        }
        if (options.excludeStatuses && options.excludeStatuses.length > 0) {
            where.push(`status NOT IN (${options.excludeStatuses.map(() => '?').join(', ')})`);
            params.push(...options.excludeStatuses);
        }
        if (options.projectId) {
            where.push('projectId = ?');
            params.push(options.projectId);
        }

        const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
        const rows = await this.client.all<Record<string, unknown>>(sql, params);
        return rows.map((row) => this.mapTaskRow(row));
    }

    async searchAll(query: string): Promise<SearchResults> {
        await this.ensureSchema();
        const cleaned = query
            .replace(/[^\p{L}\p{N}#@]+/gu, ' ')
            .trim();
        if (!cleaned) {
            return { tasks: [], projects: [] };
        }
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        const ftsQuery = tokens.map((token) => `${token}*`).join(' ');

        try {
            const taskRows = await this.client.all<Record<string, unknown>>(
                `SELECT t.* FROM tasks_fts f JOIN tasks t ON f.id = t.id WHERE tasks_fts MATCH ? AND t.deletedAt IS NULL`,
                [ftsQuery]
            );
            const projectRows = await this.client.all<Record<string, unknown>>(
                `SELECT p.* FROM projects_fts f JOIN projects p ON f.id = p.id WHERE projects_fts MATCH ? AND p.deletedAt IS NULL`,
                [ftsQuery]
            );
            return {
                tasks: taskRows.map((row) => this.mapTaskRow(row)),
                projects: projectRows.map((row) => this.mapProjectRow(row)),
            };
        } catch {
            return { tasks: [], projects: [] };
        }
    }

    async saveData(data: AppData): Promise<void> {
        await this.ensureSchema();
        await this.client.run('BEGIN IMMEDIATE');
        try {
            const syncIds = async (table: 'tasks' | 'projects' | 'areas', ids: string[]) => {
                const tempTable = `temp_${table}_ids`;
                await this.client.run(`CREATE TEMP TABLE IF NOT EXISTS ${tempTable} (id TEXT PRIMARY KEY)`);
                await this.client.run(`DELETE FROM ${tempTable}`);
                for (const id of ids) {
                    await this.client.run(`INSERT OR IGNORE INTO ${tempTable} (id) VALUES (?)`, [id]);
                }
                await this.client.run(`DELETE FROM ${table} WHERE id NOT IN (SELECT id FROM ${tempTable})`);
            };

            await syncIds('tasks', data.tasks.map((task) => task.id));
            await syncIds('projects', data.projects.map((project) => project.id));
            await syncIds('areas', data.areas.map((area) => area.id));

            for (const task of data.tasks) {
                await this.client.run(
                    `INSERT INTO tasks (
                        id, title, status, priority, taskMode, startTime, dueDate, recurrence, pushCount,
                        tags, contexts, checklist, description, attachments, location, projectId,
                        isFocusedToday, timeEstimate, reviewAt, completedAt, createdAt, updatedAt, deletedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title=excluded.title,
                        status=excluded.status,
                        priority=excluded.priority,
                        taskMode=excluded.taskMode,
                        startTime=excluded.startTime,
                        dueDate=excluded.dueDate,
                        recurrence=excluded.recurrence,
                        pushCount=excluded.pushCount,
                        tags=excluded.tags,
                        contexts=excluded.contexts,
                        checklist=excluded.checklist,
                        description=excluded.description,
                        attachments=excluded.attachments,
                        location=excluded.location,
                        projectId=excluded.projectId,
                        isFocusedToday=excluded.isFocusedToday,
                        timeEstimate=excluded.timeEstimate,
                        reviewAt=excluded.reviewAt,
                        completedAt=excluded.completedAt,
                        createdAt=excluded.createdAt,
                        updatedAt=excluded.updatedAt,
                        deletedAt=excluded.deletedAt`,
                    [
                        task.id,
                        task.title,
                        task.status,
                        task.priority ?? null,
                        task.taskMode ?? null,
                        task.startTime ?? null,
                        task.dueDate ?? null,
                        toJson(task.recurrence),
                        task.pushCount ?? null,
                        toJson(task.tags ?? []),
                        toJson(task.contexts ?? []),
                        toJson(task.checklist),
                        task.description ?? null,
                        toJson(task.attachments),
                        task.location ?? null,
                        task.projectId ?? null,
                        toBool(task.isFocusedToday),
                        task.timeEstimate ?? null,
                        task.reviewAt ?? null,
                        task.completedAt ?? null,
                        task.createdAt,
                        task.updatedAt,
                        task.deletedAt ?? null,
                    ]
                );
            }

            for (const project of data.projects) {
                await this.client.run(
                    `INSERT INTO projects (
                        id, title, status, color, orderNum, tagIds, isSequential, isFocused, supportNotes, attachments,
                        reviewAt, areaId, areaTitle, createdAt, updatedAt, deletedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title=excluded.title,
                        status=excluded.status,
                        color=excluded.color,
                        orderNum=excluded.orderNum,
                        tagIds=excluded.tagIds,
                        isSequential=excluded.isSequential,
                        isFocused=excluded.isFocused,
                        supportNotes=excluded.supportNotes,
                        attachments=excluded.attachments,
                        reviewAt=excluded.reviewAt,
                        areaId=excluded.areaId,
                        areaTitle=excluded.areaTitle,
                        createdAt=excluded.createdAt,
                        updatedAt=excluded.updatedAt,
                        deletedAt=excluded.deletedAt`,
                    [
                        project.id,
                        project.title,
                        project.status,
                        project.color,
                        Number.isFinite(project.order) ? project.order : 0,
                        toJson(project.tagIds ?? []),
                        toBool(project.isSequential),
                        toBool(project.isFocused),
                        project.supportNotes ?? null,
                        toJson(project.attachments),
                        project.reviewAt ?? null,
                        project.areaId ?? null,
                        project.areaTitle ?? null,
                        project.createdAt,
                        project.updatedAt,
                        project.deletedAt ?? null,
                    ]
                );
            }

            for (const area of data.areas) {
                await this.client.run(
                    `INSERT INTO areas (
                        id, name, color, icon, orderNum, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        color=excluded.color,
                        icon=excluded.icon,
                        orderNum=excluded.orderNum,
                        createdAt=excluded.createdAt,
                        updatedAt=excluded.updatedAt`,
                    [
                        area.id,
                        area.name,
                        area.color ?? null,
                        area.icon ?? null,
                        area.order,
                        area.createdAt ?? null,
                        area.updatedAt ?? null,
                    ]
                );
            }

            await this.client.run(
                'INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
                [toJson(data.settings ?? {})]
            );

            await this.client.run('COMMIT');
        } catch (error) {
            await this.client.run('ROLLBACK');
            throw error;
        }
    }
}
