import { existsSync } from 'fs';

import type { Task } from './queries.js';
import type { DbOptions } from './db.js';
import { resolveMindwtrDbPath } from './paths.js';

type CoreStore = {
  getState: () => {
    _allTasks: Task[];
    _allProjects: Array<{ id: string; title: string }>;
    fetchData: () => Promise<void>;
    addTask: (title: string, initialProps?: Partial<Task>) => Promise<void>;
    updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
    restoreTask: (id: string) => Promise<void>;
  };
};

type CoreModule = {
  setStorageAdapter: (adapter: unknown) => void;
  flushPendingSave: () => Promise<void>;
  useTaskStore: CoreStore;
};

type CoreAdapterModule = {
  SqliteAdapter: new (client: unknown) => { ensureSchema: () => Promise<void> };
};

type CoreService = {
  addTask: (input: { title: string; props?: Partial<Task> }) => Promise<Task>;
  updateTask: (input: { id: string; updates: Partial<Task> }) => Promise<Task>;
  completeTask: (id: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<Task>;
  restoreTask: (id: string) => Promise<Task>;
};

let coreService: CoreService | null = null;
let coreDbPath: string | undefined;
let coreReadonly = false;
let coreReady: Promise<void> | null = null;
let coreQueue: Promise<void> = Promise.resolve();

const isBun = () => typeof (globalThis as any).Bun !== 'undefined';

const createSqliteClient = async (dbPath: string, readonly: boolean) => {
  if (isBun()) {
    const mod = await import('bun:sqlite');
    const db = readonly ? new mod.Database(dbPath, { readonly: true }) : new mod.Database(dbPath);
    const run = async (sql: string, params: unknown[] = []) => {
      db.prepare(sql).run(params);
    };
    const all = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(params) as T[];
    const get = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(params) as T | undefined;
    const exec = async (sql: string) => {
      db.exec(sql);
    };
    await exec('PRAGMA journal_mode = WAL;');
    await exec('PRAGMA foreign_keys = ON;');
    await exec('PRAGMA busy_timeout = 5000;');
    return { client: { run, all, get, exec }, close: () => db.close() };
  }

  const mod = await import('better-sqlite3');
  const Database = mod.default;
  const db = new Database(dbPath, { readonly, fileMustExist: true });
  const run = async (sql: string, params: unknown[] = []) => {
    db.prepare(sql).run(params);
  };
  const all = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(params) as T[];
  const get = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    db.prepare(sql).get(params) as T | undefined;
  const exec = async (sql: string) => {
    db.exec(sql);
  };
  await exec('PRAGMA journal_mode = WAL;');
  await exec('PRAGMA foreign_keys = ON;');
  await exec('PRAGMA busy_timeout = 5000;');
  return { client: { run, all, get, exec }, close: () => db.close() };
};

const loadCoreModules = async (): Promise<{ core: CoreModule; adapter: CoreAdapterModule }> => {
  const storeUrl = new URL('../../../packages/core/src/store.ts', import.meta.url).href;
  const adapterUrl = new URL('../../../packages/core/src/sqlite-adapter.ts', import.meta.url).href;
  const [core, adapter] = await Promise.all([import(storeUrl), import(adapterUrl)]);
  return { core: core as CoreModule, adapter: adapter as CoreAdapterModule };
};

const runSerialized = async <T>(fn: () => Promise<T>): Promise<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const result = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  coreQueue = coreQueue
    .then(async () => {
      try {
        resolve(await fn());
      } catch (error) {
        reject(error);
      }
    })
    .catch(() => {
      // swallow to keep queue alive
    });
  return result;
};

const ensureCoreReady = async (options: DbOptions) => {
  if (!isBun()) {
    throw new Error('Core adapter requires Bun runtime.');
  }
  if (coreReady && coreDbPath === options.dbPath && coreReadonly === Boolean(options.readonly)) {
    return coreReady;
  }

  coreDbPath = resolveMindwtrDbPath(options.dbPath);
  coreReadonly = Boolean(options.readonly);
  if (!existsSync(coreDbPath)) {
    throw new Error(`Mindwtr database not found at: ${coreDbPath}`);
  }
  coreReady = (async () => {
    const { core, adapter } = await loadCoreModules();
    const { client } = await createSqliteClient(coreDbPath!, coreReadonly);
    const sqliteAdapter = new adapter.SqliteAdapter(client);
    await sqliteAdapter.ensureSchema();
    core.setStorageAdapter(sqliteAdapter);
    await core.useTaskStore.getState().fetchData();

    coreService = {
      addTask: async ({ title, props }) => {
        const state = core.useTaskStore.getState();
        await state.fetchData();
        const before = new Set(state._allTasks.map((t) => t.id));
        await state.addTask(title, props);
        await core.flushPendingSave();
        const after = core.useTaskStore.getState()._allTasks;
        const created = after.find((t) => !before.has(t.id));
        if (!created) throw new Error('Failed to locate newly created task.');
        return created as Task;
      },
      updateTask: async ({ id, updates }) => {
        const state = core.useTaskStore.getState();
        await state.fetchData();
        await state.updateTask(id, updates);
        await core.flushPendingSave();
        const updated = core.useTaskStore.getState()._allTasks.find((t) => t.id === id);
        if (!updated) throw new Error(`Task not found after update: ${id}`);
        return updated as Task;
      },
      completeTask: async (id) => {
        const state = core.useTaskStore.getState();
        await state.fetchData();
        await state.updateTask(id, { status: 'done' } as Partial<Task>);
        await core.flushPendingSave();
        const updated = core.useTaskStore.getState()._allTasks.find((t) => t.id === id);
        if (!updated) throw new Error(`Task not found after complete: ${id}`);
        return updated as Task;
      },
      deleteTask: async (id) => {
        const state = core.useTaskStore.getState();
        await state.fetchData();
        await state.deleteTask(id);
        await core.flushPendingSave();
        const updated = core.useTaskStore.getState()._allTasks.find((t) => t.id === id);
        if (!updated) throw new Error(`Task not found after delete: ${id}`);
        return updated as Task;
      },
      restoreTask: async (id) => {
        const state = core.useTaskStore.getState();
        await state.fetchData();
        await state.restoreTask(id);
        await core.flushPendingSave();
        const updated = core.useTaskStore.getState()._allTasks.find((t) => t.id === id);
        if (!updated) throw new Error(`Task not found after restore: ${id}`);
        return updated as Task;
      },
    };
  })();

  return coreReady;
};

export const getCoreService = async (options: DbOptions): Promise<CoreService | null> => {
  if (!isBun()) return null;
  await ensureCoreReady(options);
  return coreService;
};

export const runCoreService = async <T>(options: DbOptions, fn: (service: CoreService) => Promise<T>): Promise<T> => {
  const service = await getCoreService(options);
  if (!service) {
    throw new Error('Core adapter is not available in this runtime.');
  }
  return runSerialized(() => fn(service));
};
