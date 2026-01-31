#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join, resolve } from 'path';
import {
    applyTaskUpdates,
    generateUUID,
    parseQuickAdd,
    searchAll,
    type AppData,
    type Task,
    type TaskStatus,
} from '@mindwtr/core';

type Flags = Record<string, string | boolean>;

type RateLimitState = {
    count: number;
    resetAt: number;
};

type LogLevel = 'info' | 'warn' | 'error';
type LogEntry = {
    ts: string;
    level: LogLevel;
    scope: 'cloud';
    message: string;
    context?: Record<string, unknown>;
};

const writeLog = (entry: LogEntry) => {
    const line = `${JSON.stringify(entry)}\n`;
    if (entry.level === 'error') {
        process.stderr.write(line);
    } else {
        process.stdout.write(line);
    }
};

const logInfo = (message: string, context?: Record<string, unknown>) => {
    writeLog({ ts: new Date().toISOString(), level: 'info', scope: 'cloud', message, context });
};

const logError = (message: string, error?: unknown) => {
    const context: Record<string, unknown> = {};
    if (error instanceof Error) {
        context.error = error.message;
        if (error.stack) context.stack = error.stack;
    } else if (error !== undefined) {
        context.error = String(error);
    }
    writeLog({ ts: new Date().toISOString(), level: 'error', scope: 'cloud', message, context: Object.keys(context).length ? context : undefined });
};

const corsOrigin = process.env.MINDWTR_CLOUD_CORS_ORIGIN || '*';
const shutdown = (signal: string) => {
    logInfo(`received ${signal}, shutting down`);
    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function parseArgs(argv: string[]) {
    const flags: Flags = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg || !arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
            flags[key] = next;
            i += 1;
        } else {
            flags[key] = true;
        }
    }
    return flags;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Access-Control-Allow-Origin', corsOrigin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

function errorResponse(message: string, status = 400) {
    return jsonResponse({ error: message }, { status });
}

function getToken(req: Request): string | null {
    const auth = req.headers.get('authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

function tokenToKey(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAppData(value: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
    if (!isRecord(value)) return { ok: false, error: 'Invalid data: expected an object' };
    const tasks = value.tasks;
    const projects = value.projects;
    const settings = value.settings;
    const areas = value.areas;

    if (!Array.isArray(tasks)) return { ok: false, error: 'Invalid data: tasks must be an array' };
    if (!Array.isArray(projects)) return { ok: false, error: 'Invalid data: projects must be an array' };
    if (areas !== undefined && !Array.isArray(areas)) return { ok: false, error: 'Invalid data: areas must be an array' };
    if (settings !== undefined && !isRecord(settings)) return { ok: false, error: 'Invalid data: settings must be an object' };

    for (const task of tasks) {
        if (!isRecord(task) || typeof task.id !== 'string' || typeof task.title !== 'string') {
            return { ok: false, error: 'Invalid data: each task must be an object with string id and title' };
        }
    }

    for (const project of projects) {
        if (!isRecord(project) || typeof project.id !== 'string' || typeof project.title !== 'string') {
            return { ok: false, error: 'Invalid data: each project must be an object with string id and title' };
        }
    }

    return { ok: true, data: value };
}

const DEFAULT_DATA: AppData = { tasks: [], projects: [], sections: [], areas: [], settings: {} };

function loadAppData(filePath: string): AppData {
    const raw = readData(filePath);
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_DATA };
    const record = raw as Record<string, unknown>;
    return {
        tasks: Array.isArray(record.tasks) ? (record.tasks as Task[]) : [],
        projects: Array.isArray(record.projects) ? (record.projects as any) : [],
        sections: Array.isArray(record.sections) ? (record.sections as any) : [],
        areas: Array.isArray(record.areas) ? (record.areas as any) : [],
        settings: typeof record.settings === 'object' && record.settings ? (record.settings as any) : {},
    };
}

function asStatus(value: unknown): TaskStatus | null {
    if (typeof value !== 'string') return null;
    const allowed: TaskStatus[] = ['inbox', 'todo', 'next', 'in-progress', 'waiting', 'someday', 'done', 'archived'];
    return allowed.includes(value as TaskStatus) ? (value as TaskStatus) : null;
}

function pickTaskList(
    data: AppData,
    opts: { includeDeleted: boolean; includeCompleted: boolean; status?: TaskStatus | null; query?: string }
): Task[] {
    let tasks = data.tasks;
    if (!opts.includeDeleted) tasks = tasks.filter((t) => !t.deletedAt);
    if (!opts.includeCompleted) tasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'archived');
    if (opts.status) tasks = tasks.filter((t) => t.status === opts.status);
    if (opts.query && opts.query.trim()) {
        tasks = searchAll(tasks, data.projects.filter((p) => !p.deletedAt), opts.query).tasks;
    }
    return tasks;
}

function readData(filePath: string): any | null {
    try {
        const raw = readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeData(filePath: string, data: unknown) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function readJsonBody(req: Request, maxBodyBytes: number, encoder: TextEncoder): Promise<any> {
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength && contentLength > maxBodyBytes) {
        return { __mindwtrError: { message: 'Payload too large', status: 413 } };
    }
    const text = await req.text();
    if (!text.trim()) return null;
    if (encoder.encode(text).length > maxBodyBytes) {
        return { __mindwtrError: { message: 'Payload too large', status: 413 } };
    }
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function main() {
    const flags = parseArgs(process.argv.slice(2));
    const port = Number(flags.port || process.env.PORT || 8787);
    const host = String(flags.host || process.env.HOST || '0.0.0.0');
    const dataDir = String(process.env.MINDWTR_CLOUD_DATA_DIR || join(process.cwd(), 'data'));

    const rateLimits = new Map<string, RateLimitState>();
    const windowMs = Number(process.env.MINDWTR_CLOUD_RATE_WINDOW_MS || 60_000);
    const maxPerWindow = Number(process.env.MINDWTR_CLOUD_RATE_MAX || 120);
    const maxBodyBytes = Number(process.env.MINDWTR_CLOUD_MAX_BODY_BYTES || 2_000_000);
    const maxAttachmentBytes = Number(process.env.MINDWTR_CLOUD_MAX_ATTACHMENT_BYTES || 50_000_000);
    const encoder = new TextEncoder();
    const writeLocks = new Map<string, Promise<void>>();
    const withWriteLock = async <T>(key: string, fn: () => Promise<T>) => {
        const current = writeLocks.get(key) ?? Promise.resolve();
        const run = current.then(fn, fn);
        writeLocks.set(key, run.then(() => undefined, () => undefined));
        return run;
    };
    const rateLimitCleanupMs = Number(process.env.MINDWTR_CLOUD_RATE_CLEANUP_MS || 60_000);
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, state] of rateLimits.entries()) {
            if (now > state.resetAt) {
                rateLimits.delete(key);
            }
        }
    }, rateLimitCleanupMs);
    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }

    logInfo(`dataDir: ${dataDir}`);
    logInfo(`listening on http://${host}:${port}`);

    Bun.serve({
        hostname: host,
        port,
        async fetch(req) {
            if (req.method === 'OPTIONS') return jsonResponse({ ok: true });

            const url = new URL(req.url);
            const pathname = url.pathname.replace(/\/+$/, '') || '/';

            if (req.method === 'GET' && pathname === '/health') {
                return jsonResponse({ ok: true });
            }

            if (
                pathname === '/v1/tasks' ||
                pathname === '/v1/projects' ||
                pathname === '/v1/search' ||
                pathname.startsWith('/v1/tasks/')
            ) {
                const token = getToken(req);
                if (!token) return errorResponse('Unauthorized', 401);
                const key = tokenToKey(token);
                const now = Date.now();
                const state = rateLimits.get(key);
                if (state && now < state.resetAt) {
                    state.count += 1;
                    if (state.count > maxPerWindow) {
                        const retryAfter = Math.ceil((state.resetAt - now) / 1000);
                        return jsonResponse(
                            { error: 'Rate limit exceeded', retryAfterSeconds: retryAfter },
                            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
                        );
                    }
                } else {
                    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
                }
                const filePath = join(dataDir, `${key}.json`);

                if (req.method === 'GET' && pathname === '/v1/tasks') {
                    const query = url.searchParams.get('query') || '';
                    const includeAll = url.searchParams.get('all') === '1';
                    const includeDeleted = url.searchParams.get('deleted') === '1';
                    const status = asStatus(url.searchParams.get('status'));
                    const data = loadAppData(filePath);
                    const tasks = pickTaskList(data, {
                        includeDeleted,
                        includeCompleted: includeAll,
                        status,
                        query,
                    });
                    return jsonResponse({ tasks });
                }

                if (req.method === 'POST' && pathname === '/v1/tasks') {
                    const body = await readJsonBody(req, maxBodyBytes, encoder);
                    if (body && typeof body === 'object' && '__mindwtrError' in body) {
                        const err = (body as any).__mindwtrError;
                        return errorResponse(String(err?.message || 'Payload too large'), Number(err?.status) || 413);
                    }
                    if (!body || typeof body !== 'object') return errorResponse('Invalid JSON body');

                    return await withWriteLock(key, async () => {
                        const data = loadAppData(filePath);
                        const nowIso = new Date().toISOString();

                        const input = typeof (body as any).input === 'string' ? String((body as any).input) : '';
                        const rawTitle = typeof (body as any).title === 'string' ? String((body as any).title) : '';
                        const initialProps = typeof (body as any).props === 'object' && (body as any).props ? (body as any).props : {};

                        const parsed = input ? parseQuickAdd(input, data.projects, new Date(nowIso), data.areas) : { title: rawTitle, props: {} };
                        const title = (parsed.title || rawTitle || input).trim();
                        if (!title) return errorResponse('Missing task title');

                        const props: Partial<Task> = {
                            ...parsed.props,
                            ...initialProps,
                        };

                        const status = asStatus((props as any).status) || 'inbox';
                        const tags = Array.isArray((props as any).tags) ? (props as any).tags : [];
                        const contexts = Array.isArray((props as any).contexts) ? (props as any).contexts : [];
                        const {
                            id: _id,
                            title: _title,
                            createdAt: _createdAt,
                            updatedAt: _updatedAt,
                            status: _status,
                            tags: _tags,
                            contexts: _contexts,
                            ...restProps
                        } = props as any;
                        const task: Task = {
                            id: generateUUID(),
                            title,
                            ...restProps,
                            status,
                            tags,
                            contexts,
                            createdAt: nowIso,
                            updatedAt: nowIso,
                        } as Task;

                        data.tasks.push(task);
                        writeData(filePath, data);
                        return jsonResponse({ task }, { status: 201 });
                    });
                }

                const actionMatch = pathname.match(/^\/v1\/tasks\/([^/]+)\/(complete|archive)$/);
                if (actionMatch && req.method === 'POST') {
                    const taskId = decodeURIComponent(actionMatch[1]);
                    const action = actionMatch[2];
                    const status: TaskStatus = action === 'archive' ? 'archived' : 'done';

                    return await withWriteLock(key, async () => {
                        const data = loadAppData(filePath);
                        const idx = data.tasks.findIndex((t) => t.id === taskId);
                        if (idx < 0) return errorResponse('Task not found', 404);

                        const nowIso = new Date().toISOString();
                        const existing = data.tasks[idx];
                        const { updatedTask, nextRecurringTask } = applyTaskUpdates(existing, { status }, nowIso);
                        data.tasks[idx] = updatedTask;
                        if (nextRecurringTask) data.tasks.push(nextRecurringTask);
                        writeData(filePath, data);
                        return jsonResponse({ task: updatedTask });
                    });
                }

                const taskMatch = pathname.match(/^\/v1\/tasks\/([^/]+)$/);
                if (taskMatch) {
                    const taskId = decodeURIComponent(taskMatch[1]);

                    if (req.method === 'GET') {
                        const data = loadAppData(filePath);
                        const task = data.tasks.find((t) => t.id === taskId);
                        if (!task) return errorResponse('Task not found', 404);
                        return jsonResponse({ task });
                    }

                    if (req.method === 'PATCH') {
                        const body = await readJsonBody(req, maxBodyBytes, encoder);
                        if (body && typeof body === 'object' && '__mindwtrError' in body) {
                            const err = (body as any).__mindwtrError;
                            return errorResponse(String(err?.message || 'Payload too large'), Number(err?.status) || 413);
                        }
                        if (!body || typeof body !== 'object') return errorResponse('Invalid JSON body');

                        return await withWriteLock(key, async () => {
                            const data = loadAppData(filePath);
                            const idx = data.tasks.findIndex((t) => t.id === taskId);
                            if (idx < 0) return errorResponse('Task not found', 404);

                            const nowIso = new Date().toISOString();
                            const existing = data.tasks[idx];
                            const updates = body as Partial<Task>;
                            const { updatedTask, nextRecurringTask } = applyTaskUpdates(existing, updates, nowIso);

                            data.tasks[idx] = updatedTask;
                            if (nextRecurringTask) data.tasks.push(nextRecurringTask);
                            writeData(filePath, data);
                            return jsonResponse({ task: updatedTask });
                        });
                    }

                    if (req.method === 'DELETE') {
                        return await withWriteLock(key, async () => {
                            const data = loadAppData(filePath);
                            const idx = data.tasks.findIndex((t) => t.id === taskId);
                            if (idx < 0) return errorResponse('Task not found', 404);

                            const nowIso = new Date().toISOString();
                            const existing = data.tasks[idx];
                            data.tasks[idx] = { ...existing, deletedAt: nowIso, updatedAt: nowIso };
                            writeData(filePath, data);
                            return jsonResponse({ ok: true });
                        });
                    }
                }

                if (req.method === 'GET' && pathname === '/v1/projects') {
                    const data = loadAppData(filePath);
                    const projects = data.projects.filter((p: any) => !p.deletedAt);
                    return jsonResponse({ projects });
                }

                if (req.method === 'GET' && pathname === '/v1/search') {
                    const query = url.searchParams.get('query') || '';
                    const data = loadAppData(filePath);
                    const tasks = data.tasks.filter((t) => !t.deletedAt);
                    const projects = data.projects.filter((p: any) => !p.deletedAt);
                    const results = searchAll(tasks, projects, query);
                    return jsonResponse(results);
                }

                if (pathname.startsWith('/v1/tasks') || pathname === '/v1/projects' || pathname === '/v1/search') {
                    return errorResponse('Method not allowed', 405);
                }
            }

            if (pathname === '/v1/data') {
                const token = getToken(req);
                if (!token) return errorResponse('Unauthorized', 401);
                const key = tokenToKey(token);
                const now = Date.now();
                const state = rateLimits.get(key);
                if (state && now < state.resetAt) {
                    state.count += 1;
                    if (state.count > maxPerWindow) {
                        const retryAfter = Math.ceil((state.resetAt - now) / 1000);
                        return jsonResponse(
                            { error: 'Rate limit exceeded', retryAfterSeconds: retryAfter },
                            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
                        );
                    }
                } else {
                    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
                }
                const filePath = join(dataDir, `${key}.json`);

                if (req.method === 'GET') {
                    if (!existsSync(filePath)) {
                        const emptyData: AppData = { tasks: [], projects: [], sections: [], areas: [], settings: {} };
                        await withWriteLock(key, async () => {
                            if (!existsSync(filePath)) writeData(filePath, emptyData);
                        });
                        return jsonResponse(emptyData);
                    }
                    const data = readData(filePath);
                    if (!data) return errorResponse('Failed to read data', 500);
                    const validated = validateAppData(data);
                    if (!validated.ok) return errorResponse(validated.error, 500);
                    return jsonResponse(validated.data);
                }

                if (req.method === 'PUT') {
                    const body = await readJsonBody(req, maxBodyBytes, encoder);
                    if (body && typeof body === 'object' && '__mindwtrError' in body) {
                        const err = (body as any).__mindwtrError;
                        return errorResponse(String(err?.message || 'Payload too large'), Number(err?.status) || 413);
                    }
                    if (!body) return errorResponse('Missing body');
                    if (typeof body !== 'object') return errorResponse('Invalid JSON body');
                    const validated = validateAppData(body);
                    if (!validated.ok) return errorResponse(validated.error, 400);
                    return await withWriteLock(key, async () => {
                        writeData(filePath, validated.data);
                        return jsonResponse({ ok: true });
                    });
                }
            }

            if (pathname.startsWith('/v1/attachments/')) {
                const token = getToken(req);
                if (!token) return errorResponse('Unauthorized', 401);
                const key = tokenToKey(token);
                const now = Date.now();
                const state = rateLimits.get(key);
                if (state && now < state.resetAt) {
                    state.count += 1;
                    if (state.count > maxPerWindow) {
                        const retryAfter = Math.ceil((state.resetAt - now) / 1000);
                        return jsonResponse(
                            { error: 'Rate limit exceeded', retryAfterSeconds: retryAfter },
                            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
                        );
                    }
                } else {
                    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
                }

                const relative = decodeURIComponent(pathname.slice('/v1/attachments/'.length));
                if (!relative || relative.includes('..') || relative.includes('\\')) {
                    return errorResponse('Invalid attachment path', 400);
                }
                const rootDir = resolve(join(dataDir, key, 'attachments'));
                const filePath = resolve(join(rootDir, relative));
                if (!filePath.startsWith(rootDir)) {
                    return errorResponse('Invalid attachment path', 400);
                }

                if (req.method === 'GET') {
                    if (!existsSync(filePath)) return errorResponse('Not found', 404);
                    try {
                        const file = readFileSync(filePath);
                        const headers = new Headers();
                        headers.set('Access-Control-Allow-Origin', corsOrigin);
                        headers.set('Content-Type', 'application/octet-stream');
                        return new Response(file, { status: 200, headers });
                    } catch {
                        return errorResponse('Failed to read attachment', 500);
                    }
                }

                if (req.method === 'PUT') {
                    const contentLength = Number(req.headers.get('content-length') || '0');
                    if (contentLength && contentLength > maxAttachmentBytes) {
                        return errorResponse('Payload too large', 413);
                    }
                    const body = new Uint8Array(await req.arrayBuffer());
                    if (body.length > maxAttachmentBytes) {
                        return errorResponse('Payload too large', 413);
                    }
                    mkdirSync(dirname(filePath), { recursive: true });
                    writeFileSync(filePath, body);
                    return jsonResponse({ ok: true });
                }

                if (req.method === 'DELETE') {
                    if (!existsSync(filePath)) {
                        return jsonResponse({ ok: true });
                    }
                    try {
                        unlinkSync(filePath);
                        return jsonResponse({ ok: true });
                    } catch {
                        return errorResponse('Failed to delete attachment', 500);
                    }
                }

                return errorResponse('Method not allowed', 405);
            }

            return errorResponse('Not found', 404);
        },
    });
}

main().catch((err) => {
    logError('Failed to start server', err);
    process.exit(1);
});
