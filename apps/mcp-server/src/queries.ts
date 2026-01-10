import type { DbClient } from './db.js';
import { parseJson } from './db.js';

export type TaskStatus = 'inbox' | 'next' | 'waiting' | 'someday' | 'done' | 'archived';
export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: string;
  taskMode?: string;
  startTime?: string;
  dueDate?: string;
  recurrence?: unknown;
  pushCount?: number;
  tags?: string[];
  contexts?: string[];
  checklist?: unknown[];
  description?: string;
  attachments?: unknown[];
  location?: string;
  projectId?: string;
  orderNum?: number;
  isFocusedToday?: boolean;
  timeEstimate?: string;
  reviewAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  purgedAt?: string;
};

export type Project = {
  id: string;
  title: string;
  status?: string;
  color?: string;
  areaId?: string;
  areaTitle?: string;
  isSequential?: boolean;
  isFocused?: boolean;
  reviewAt?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

const STATUS_TOKENS: Record<string, TaskStatus> = {
  inbox: 'inbox',
  next: 'next',
  waiting: 'waiting',
  someday: 'someday',
  done: 'done',
  archived: 'archived',
};

const normalizeTaskStatus = (value: string): TaskStatus => {
  const key = value.toLowerCase();
  return STATUS_TOKENS[key] ?? 'inbox';
};

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mcp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

const parseQuickAdd = (input: string, projects: Project[]): { title: string; props: Partial<Task> } => {
  let working = input.trim();
  const props: Partial<Task> = {};
  const contexts = new Set<string>();
  const tags = new Set<string>();

  const contextMatches = working.match(/@[\w-]+/g) || [];
  contextMatches.forEach((ctx) => contexts.add(ctx));
  contextMatches.forEach((ctx) => { working = working.replace(ctx, '').trim(); });

  const tagMatches = working.match(/#[\w-]+/g) || [];
  tagMatches.forEach((tag) => tags.add(tag));
  tagMatches.forEach((tag) => { working = working.replace(tag, '').trim(); });

  const noteMatch = working.match(/\/note:([^/]+?)(?=\s\/|$)/i);
  if (noteMatch) {
    props.description = noteMatch[1].trim();
    working = working.replace(noteMatch[0], '').trim();
  }

  const dueMatch = working.match(/\/due:([^/]+?)(?=\s\/|$)/i);
  if (dueMatch) {
    const parsed = new Date(dueMatch[1].trim());
    if (!Number.isNaN(parsed.getTime())) {
      props.dueDate = parsed.toISOString();
    }
    working = working.replace(dueMatch[0], '').trim();
  }

  const statusMatch = working.match(/\/(inbox|next|waiting|someday|done|archived)\b/i);
  if (statusMatch) {
    props.status = normalizeTaskStatus(statusMatch[1]);
    working = working.replace(statusMatch[0], '').trim();
  }

  const projectIdMatch = working.match(/\/project:([^\s/]+)/i);
  if (projectIdMatch) {
    props.projectId = projectIdMatch[1];
    working = working.replace(projectIdMatch[0], '').trim();
  } else {
    const plusMatch = working.match(/(?:^|\s)\+([^\s/]+(?:\s+(?![@#+/])[^/\s]+)*)/);
    if (plusMatch) {
      const title = plusMatch[1].replace(/\s+/g, ' ').trim();
      const project = projects.find((p) => p.title.toLowerCase() === title.toLowerCase());
      if (project) props.projectId = project.id;
      working = working.replace(plusMatch[0], '').trim();
    }
  }

  if (contexts.size) props.contexts = Array.from(contexts);
  if (tags.size) props.tags = Array.from(tags);

  return { title: working.trim(), props };
};

export type ListTasksInput = {
  status?: TaskStatus | 'all';
  projectId?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
};

export type AddTaskInput = {
  title?: string;
  quickAdd?: string;
  status?: TaskStatus;
  projectId?: string;
  dueDate?: string;
  startTime?: string;
  contexts?: string[];
  tags?: string[];
  description?: string;
  priority?: string;
  timeEstimate?: string;
};

export type CompleteTaskInput = { id: string };

export type TaskRow = Task & {
  contexts?: string[];
  tags?: string[];
  checklist?: Task['checklist'];
  attachments?: Task['attachments'];
};

const taskSelectColumns = `
  id,
  title,
  status,
  priority,
  taskMode,
  startTime,
  dueDate,
  recurrence,
  pushCount,
  tags,
  contexts,
  checklist,
  description,
  attachments,
  location,
  projectId,
  orderNum,
  isFocusedToday,
  timeEstimate,
  reviewAt,
  completedAt,
  createdAt,
  updatedAt,
  deletedAt,
  purgedAt
`;

function mapTaskRow(row: any): TaskRow {
  return {
    id: row.id as string,
    title: row.title as string,
    status: normalizeTaskStatus(row.status as string),
    priority: row.priority ?? undefined,
    taskMode: row.taskMode ?? undefined,
    startTime: row.startTime ?? undefined,
    dueDate: row.dueDate ?? undefined,
    recurrence: parseJson(row.recurrence, undefined),
    pushCount: row.pushCount ?? undefined,
    tags: parseJson(row.tags, []),
    contexts: parseJson(row.contexts, []),
    checklist: parseJson(row.checklist, []),
    description: row.description ?? undefined,
    attachments: parseJson(row.attachments, []),
    location: row.location ?? undefined,
    projectId: row.projectId ?? undefined,
    orderNum: row.orderNum ?? undefined,
    isFocusedToday: row.isFocusedToday === 1,
    timeEstimate: row.timeEstimate ?? undefined,
    reviewAt: row.reviewAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    deletedAt: row.deletedAt ?? undefined,
    purgedAt: row.purgedAt ?? undefined,
  };
}

export function listTasks(db: DbClient, input: ListTasksInput): TaskRow[] {
  const where: string[] = [];
  const params: any[] = [];

  if (!input.includeDeleted) {
    where.push('deletedAt IS NULL');
  }
  if (input.status && input.status !== 'all') {
    where.push('status = ?');
    params.push(input.status);
  }
  if (input.projectId) {
    where.push('projectId = ?');
    params.push(input.projectId);
  }
  if (input.search) {
    where.push('(title LIKE ? OR description LIKE ?)');
    const pattern = `%${input.search}%`;
    params.push(pattern, pattern);
  }

  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(500, input.limit as number)) : 200;
  const offset = Number.isFinite(input.offset) ? Math.max(0, input.offset as number) : 0;

  const sql = `SELECT ${taskSelectColumns} FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updatedAt DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, limit, offset);
  return rows.map(mapTaskRow);
}

export function listProjects(db: DbClient): Project[] {
  const rows = db.prepare('SELECT id, title, status, areaId, areaTitle, color, orderNum, tagIds, isSequential, isFocused, supportNotes, attachments, reviewAt, createdAt, updatedAt, deletedAt FROM projects WHERE deletedAt IS NULL').all();
  return rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    color: row.color ?? '#94a3b8',
    orderNum: row.orderNum ?? undefined,
    tagIds: parseJson(row.tagIds, []),
    isSequential: row.isSequential === 1,
    isFocused: row.isFocused === 1,
    supportNotes: row.supportNotes ?? undefined,
    attachments: parseJson(row.attachments, []),
    reviewAt: row.reviewAt ?? undefined,
    areaId: row.areaId ?? undefined,
    areaTitle: row.areaTitle ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  }));
}

export function addTask(db: DbClient, input: AddTaskInput): TaskRow {
  const now = new Date().toISOString();
  let title = (input.title || '').trim();
  let props: Partial<Task> = {};

  if (input.quickAdd) {
    const projects = listProjects(db);
    const quick = parseQuickAdd(input.quickAdd, projects);
    title = quick.title || title || input.quickAdd;
    props = quick.props;
  }

  if (!title) {
    throw new Error('Task title is required.');
  }

  const status = input.status ?? (props.status as TaskStatus) ?? 'inbox';
  const task: Task = {
    id: generateUUID(),
    title,
    status,
    priority: (input.priority ?? props.priority) as Task['priority'],
    taskMode: props.taskMode,
    startTime: input.startTime ?? props.startTime,
    dueDate: input.dueDate ?? props.dueDate,
    recurrence: props.recurrence,
    pushCount: props.pushCount,
    tags: input.tags ?? (props.tags as string[] | undefined) ?? [],
    contexts: input.contexts ?? (props.contexts as string[] | undefined) ?? [],
    checklist: props.checklist,
    description: input.description ?? props.description,
    attachments: props.attachments,
    location: props.location,
    projectId: input.projectId ?? props.projectId,
    orderNum: props.orderNum ?? undefined,
    isFocusedToday: props.isFocusedToday ?? false,
    timeEstimate: input.timeEstimate ?? props.timeEstimate,
    reviewAt: props.reviewAt,
    completedAt: props.completedAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    purgedAt: undefined,
  };

  const insert = db.prepare(`
    INSERT INTO tasks (
      id, title, status, priority, taskMode, startTime, dueDate, recurrence, pushCount, tags, contexts, checklist, description,
      attachments, location, projectId, orderNum, isFocusedToday, timeEstimate, reviewAt, completedAt, createdAt, updatedAt, deletedAt, purgedAt
    ) VALUES (
      @id, @title, @status, @priority, @taskMode, @startTime, @dueDate, @recurrence, @pushCount, @tags, @contexts, @checklist, @description,
      @attachments, @location, @projectId, @orderNum, @isFocusedToday, @timeEstimate, @reviewAt, @completedAt, @createdAt, @updatedAt, @deletedAt, @purgedAt
    )
  `);

  insert.run({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority ?? null,
    taskMode: task.taskMode ?? null,
    startTime: task.startTime ?? null,
    dueDate: task.dueDate ?? null,
    recurrence: task.recurrence ? JSON.stringify(task.recurrence) : null,
    pushCount: task.pushCount ?? null,
    tags: JSON.stringify(task.tags ?? []),
    contexts: JSON.stringify(task.contexts ?? []),
    checklist: task.checklist ? JSON.stringify(task.checklist) : null,
    description: task.description ?? null,
    attachments: task.attachments ? JSON.stringify(task.attachments) : null,
    location: task.location ?? null,
    projectId: task.projectId ?? null,
    orderNum: task.orderNum ?? null,
    isFocusedToday: task.isFocusedToday ? 1 : 0,
    timeEstimate: task.timeEstimate ?? null,
    reviewAt: task.reviewAt ?? null,
    completedAt: task.completedAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt ?? null,
    purgedAt: task.purgedAt ?? null,
  });

  return task as TaskRow;
}

export function completeTask(db: DbClient, input: CompleteTaskInput): TaskRow {
  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE tasks
    SET status = 'done', completedAt = ?, updatedAt = ?
    WHERE id = ?
  `);
  const info = update.run(now, now, input.id);
  if (info.changes === 0) {
    throw new Error('Task not found.');
  }

  const row = db.prepare(`SELECT ${taskSelectColumns} FROM tasks WHERE id = ?`).get(input.id);
  return mapTaskRow(row);
}

export type UpdateTaskInput = {
  id: string;
  title?: string;
  status?: TaskStatus;
  projectId?: string | null;
  dueDate?: string | null;
  startTime?: string | null;
  contexts?: string[] | null;
  tags?: string[] | null;
  description?: string | null;
  priority?: string | null;
  timeEstimate?: string | null;
  reviewAt?: string | null;
  isFocusedToday?: boolean;
};

export function updateTask(db: DbClient, input: UpdateTaskInput): TaskRow {
  const existing = db.prepare(`SELECT ${taskSelectColumns} FROM tasks WHERE id = ?`).get(input.id);
  if (!existing) {
    throw new Error('Task not found.');
  }
  const current = mapTaskRow(existing);
  const now = new Date().toISOString();

  const updated: TaskRow = {
    ...current,
    title: input.title ?? current.title,
    status: input.status ?? current.status,
    projectId: input.projectId === null ? undefined : input.projectId ?? current.projectId,
    dueDate: input.dueDate === null ? undefined : input.dueDate ?? current.dueDate,
    startTime: input.startTime === null ? undefined : input.startTime ?? current.startTime,
    contexts: input.contexts === null ? [] : input.contexts ?? current.contexts ?? [],
    tags: input.tags === null ? [] : input.tags ?? current.tags ?? [],
    description: input.description === null ? undefined : input.description ?? current.description,
    priority: input.priority === null ? undefined : input.priority ?? current.priority,
    timeEstimate: input.timeEstimate === null ? undefined : input.timeEstimate ?? current.timeEstimate,
    reviewAt: input.reviewAt === null ? undefined : input.reviewAt ?? current.reviewAt,
    isFocusedToday: input.isFocusedToday ?? current.isFocusedToday,
    updatedAt: now,
  };

  const update = db.prepare(`
    UPDATE tasks
    SET title = @title,
        status = @status,
        projectId = @projectId,
        dueDate = @dueDate,
        startTime = @startTime,
        contexts = @contexts,
        tags = @tags,
        description = @description,
        priority = @priority,
        timeEstimate = @timeEstimate,
        reviewAt = @reviewAt,
        isFocusedToday = @isFocusedToday,
        updatedAt = @updatedAt
    WHERE id = @id
  `);

  update.run({
    id: updated.id,
    title: updated.title,
    status: updated.status,
    projectId: updated.projectId ?? null,
    dueDate: updated.dueDate ?? null,
    startTime: updated.startTime ?? null,
    contexts: JSON.stringify(updated.contexts ?? []),
    tags: JSON.stringify(updated.tags ?? []),
    description: updated.description ?? null,
    priority: updated.priority ?? null,
    timeEstimate: updated.timeEstimate ?? null,
    reviewAt: updated.reviewAt ?? null,
    isFocusedToday: updated.isFocusedToday ? 1 : 0,
    updatedAt: updated.updatedAt,
  });

  const row = db.prepare(`SELECT ${taskSelectColumns} FROM tasks WHERE id = ?`).get(input.id);
  return mapTaskRow(row);
}

export type DeleteTaskInput = { id: string };

export function deleteTask(db: DbClient, input: DeleteTaskInput): TaskRow {
  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE tasks
    SET deletedAt = ?, updatedAt = ?
    WHERE id = ?
  `);
  const info = update.run(now, now, input.id);
  if (info.changes === 0) {
    throw new Error('Task not found.');
  }
  const row = db.prepare(`SELECT ${taskSelectColumns} FROM tasks WHERE id = ?`).get(input.id);
  return mapTaskRow(row);
}
