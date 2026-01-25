import { AppData, SqliteAdapter, type SqliteClient, StorageAdapter } from '@mindwtr/core';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { WIDGET_DATA_KEY } from './widget-data';
import { updateAndroidWidgetFromData } from './widget-service';
import { logError, logWarn } from './app-log';

const DATA_KEY = WIDGET_DATA_KEY;
const LEGACY_DATA_KEYS = ['focus-gtd-data', 'gtd-todo-data', 'gtd-data'];
const SQLITE_DB_NAME = 'mindwtr.db';

type SqliteState = {
    adapter: SqliteAdapter;
    client: SqliteClient;
};

let sqliteStatePromise: Promise<SqliteState> | null = null;
let preferJsonBackup = false;
let didWarnPreferJsonBackup = false;

const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));
const buildStorageExtra = (message?: string, error?: unknown): Record<string, string> | undefined => {
    const extra: Record<string, string> = {};
    if (message) extra.message = message;
    if (error) extra.error = formatError(error);
    return Object.keys(extra).length ? extra : undefined;
};

const logStorageWarn = (message: string, error?: unknown) => {
    void logWarn(message, { scope: 'storage', extra: buildStorageExtra(undefined, error) });
};

const logStorageError = (message: string, error?: unknown) => {
    const err = error instanceof Error ? error : new Error(message);
    void logError(err, { scope: 'storage', extra: buildStorageExtra(message, error) });
};

const warnPreferJsonBackup = () => {
    if (didWarnPreferJsonBackup) return;
    logStorageWarn('[Storage] SQLite unavailable; using JSON backup for reads until restart.');
    didWarnPreferJsonBackup = true;
};

const createLegacyClient = (db: any): SqliteClient => {
    const execSql = (sql: string, params: unknown[] = []) =>
        new Promise<any>((resolve, reject) => {
            db.transaction(
                (tx: any) => {
                    tx.executeSql(
                        sql,
                        params,
                        (_: any, result: any) => resolve(result),
                        (_: any, error: any) => {
                            reject(error);
                            return true;
                        }
                    );
                },
                (error: any) => reject(error)
            );
        });

    const exec = async (sql: string) => {
        const statements = sql
            .split(';')
            .map((statement) => statement.trim())
            .filter(Boolean);
        for (const statement of statements) {
            await execSql(statement);
        }
    };

    return {
        run: async (sql: string, params: unknown[] = []) => {
            await execSql(sql, params);
        },
        all: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
            const result = await execSql(sql, params);
            const rows = result?.rows;
            if (!rows) return [] as T[];
            if (Array.isArray(rows._array)) return rows._array as T[];
            const collected: T[] = [];
            for (let i = 0; i < rows.length; i += 1) {
                collected.push(rows.item(i));
            }
            return collected;
        },
        get: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
            const result = await execSql(sql, params);
            const rows = result?.rows;
            if (!rows || rows.length === 0) return undefined;
            if (Array.isArray(rows._array)) return rows._array[0] as T;
            return rows.item(0) as T;
        },
        exec,
    };
};

const createSqliteClient = async (): Promise<SqliteClient> => {
    const SQLite = await import('expo-sqlite');
    const openDatabaseAsync = (SQLite as any).openDatabaseAsync as ((name: string) => Promise<any>) | undefined;
    if (openDatabaseAsync) {
        try {
            const db = await openDatabaseAsync(SQLITE_DB_NAME);
            if (db?.runAsync && db?.getAllAsync && db?.getFirstAsync && db?.execAsync) {
                return {
                    run: async (sql: string, params: unknown[] = []) => {
                        await db.runAsync(sql, params);
                    },
                    all: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
                        db.getAllAsync(sql, params) as Promise<T[]>,
                    get: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
                        (await db.getFirstAsync(sql, params)) as T | undefined,
                    exec: async (sql: string) => {
                        await db.execAsync(sql);
                    },
                };
            }
        } catch (error) {
            if (__DEV__) {
                logStorageWarn('[Storage] Async SQLite open failed, falling back to legacy API', error);
            }
        }
    }

    const legacyDb = (SQLite as any).openDatabase(SQLITE_DB_NAME);
    return createLegacyClient(legacyDb);
};

const sqliteHasAnyData = async (client: SqliteClient): Promise<boolean> => {
    const count = async (table: string) => {
        const row = await client.get<{ count?: number }>(`SELECT COUNT(*) as count FROM ${table}`);
        return Number(row?.count ?? 0);
    };
    const [tasks, projects, areas, settings] = await Promise.all([
        count('tasks'),
        count('projects'),
        count('areas'),
        count('settings'),
    ]);
    return tasks > 0 || projects > 0 || areas > 0 || settings > 0;
};

const getLegacyJson = async (AsyncStorage: any): Promise<string | null> => {
    let jsonValue = await AsyncStorage.getItem(DATA_KEY);
    if (jsonValue != null) return jsonValue;
    for (const legacyKey of LEGACY_DATA_KEYS) {
        const legacyValue = await AsyncStorage.getItem(legacyKey);
        if (legacyValue != null) {
            await AsyncStorage.setItem(DATA_KEY, legacyValue);
            return legacyValue;
        }
    }
    return null;
};

const initSqliteState = async (): Promise<SqliteState> => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    let client = await createSqliteClient();
    let adapter = new SqliteAdapter(client);
    try {
        await adapter.ensureSchema();
    } catch (error) {
        if (__DEV__) {
            logStorageWarn('[Storage] SQLite schema init failed, retrying with legacy API', error);
        }
        const SQLite = await import('expo-sqlite');
        const legacyDb = (SQLite as any).openDatabase(SQLITE_DB_NAME);
        client = createLegacyClient(legacyDb);
        adapter = new SqliteAdapter(client);
        await adapter.ensureSchema();
    }
    let hasData = false;
    try {
        hasData = await sqliteHasAnyData(client);
    } catch (error) {
        if (__DEV__) {
            logStorageWarn('[Storage] SQLite availability check failed', error);
        }
        hasData = false;
    }
    if (!hasData) {
        const jsonValue = await getLegacyJson(AsyncStorage);
        if (jsonValue != null) {
            try {
                const data = JSON.parse(jsonValue) as AppData;
                data.areas = Array.isArray(data.areas) ? data.areas : [];
                // Ensure JSON backup is updated before SQLite migration so fallback stays consistent.
                await AsyncStorage.setItem(DATA_KEY, JSON.stringify(data));
                await adapter.saveData(data);
            } catch (error) {
                logStorageWarn('[Storage] Failed to migrate JSON data to SQLite', error);
            }
        }
    }
    return { adapter, client };
};

const getSqliteState = async (): Promise<SqliteState> => {
    if (!sqliteStatePromise) {
        sqliteStatePromise = initSqliteState();
    }
    try {
        return await sqliteStatePromise;
    } catch (error) {
        sqliteStatePromise = null;
        // Retry once on init failure to avoid a poisoned cache.
        sqliteStatePromise = initSqliteState();
        return await sqliteStatePromise;
    }
};

// Platform-specific storage implementation
const createStorage = (): StorageAdapter => {
    // Web platform - use localStorage
    if (Platform.OS === 'web') {
        return {
            getData: async (): Promise<AppData> => {
                if (typeof window === 'undefined') {
                    return { tasks: [], projects: [], sections: [], areas: [], settings: {} };
                }
                let jsonValue = localStorage.getItem(DATA_KEY);
                if (jsonValue == null) {
                    for (const legacyKey of LEGACY_DATA_KEYS) {
                        const legacyValue = localStorage.getItem(legacyKey);
                        if (legacyValue != null) {
                            localStorage.setItem(DATA_KEY, legacyValue);
                            jsonValue = legacyValue;
                            break;
                        }
                    }
                }
                if (jsonValue == null) {
                    return { tasks: [], projects: [], sections: [], areas: [], settings: {} };
                }
                try {
                    const data = JSON.parse(jsonValue) as AppData;
                    data.areas = Array.isArray(data.areas) ? data.areas : [];
                    data.sections = Array.isArray(data.sections) ? data.sections : [];
                    return data;
                } catch (e) {
                    // JSON parse error - data corrupted, throw so user is notified
                    logStorageError('Failed to parse stored data - may be corrupted', e);
                    throw new Error('Data appears corrupted. Please restore from backup.');
                }
            },
            saveData: async (data: AppData): Promise<void> => {
                try {
                    if (typeof window !== 'undefined') {
                        const jsonValue = JSON.stringify(data);
                        localStorage.setItem(DATA_KEY, jsonValue);
                    }
                } catch (e) {
                    logStorageError('Failed to save data', e);
                    throw new Error('Failed to save data: ' + (e as Error).message);
                }
            },
        };
    }

    // Native platforms - use SQLite with AsyncStorage backup for widgets/rollback.
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const shouldUseSqlite = Constants.appOwnership !== 'expo';

    return {
        getData: async (): Promise<AppData> => {
            const loadJsonBackup = async () => {
                const jsonValue = await getLegacyJson(AsyncStorage);
                if (jsonValue != null) {
                    try {
                        const data = JSON.parse(jsonValue) as AppData;
                        data.areas = Array.isArray(data.areas) ? data.areas : [];
                        updateAndroidWidgetFromData(data).catch((error) => {
                            logStorageWarn('[Widgets] Failed to update Android widget from backup', error);
                        });
                        return data;
                    } catch (parseError) {
                        logStorageError('Failed to parse stored data - may be corrupted', parseError);
                    }
                }
                throw new Error('Data appears corrupted. Please restore from backup.');
            };

            if (preferJsonBackup && !shouldUseSqlite) {
                warnPreferJsonBackup();
                return loadJsonBackup();
            }
            if (preferJsonBackup) {
                warnPreferJsonBackup();
            }
            try {
                if (!shouldUseSqlite) {
                    throw new Error('SQLite disabled in Expo Go');
                }
                const { adapter } = await getSqliteState();
                const data = await adapter.getData();
                data.areas = Array.isArray(data.areas) ? data.areas : [];
                updateAndroidWidgetFromData(data).catch((error) => {
                    logStorageWarn('[Widgets] Failed to update Android widget from storage load', error);
                });
                preferJsonBackup = false;
                didWarnPreferJsonBackup = false;
                return data;
            } catch (e) {
                if (__DEV__ && !shouldUseSqlite && String(e).includes('Expo Go')) {
                    logStorageWarn('[Storage] SQLite disabled in Expo Go, falling back to JSON backup');
                } else {
                    logStorageWarn('[Storage] SQLite load failed, falling back to JSON backup', e);
                }
                return loadJsonBackup();
            }
        },
        saveData: async (data: AppData): Promise<void> => {
            try {
                if (!shouldUseSqlite) {
                    throw new Error('SQLite disabled in Expo Go');
                }
                const { adapter } = await getSqliteState();
                await adapter.saveData(data);
                preferJsonBackup = false;
                didWarnPreferJsonBackup = false;
            } catch (error) {
                preferJsonBackup = true;
                warnPreferJsonBackup();
                if (__DEV__ && !shouldUseSqlite && String(error).includes('Expo Go')) {
                    logStorageWarn('[Storage] SQLite disabled in Expo Go, keeping JSON backup');
                } else {
                    logStorageWarn('[Storage] SQLite save failed, keeping JSON backup', error);
                }
            }
            try {
                const jsonValue = JSON.stringify(data);
                await AsyncStorage.setItem(DATA_KEY, jsonValue);
                await updateAndroidWidgetFromData(data);
            } catch (e) {
                logStorageError('Failed to save data', e);
                throw new Error('Failed to save data: ' + (e as Error).message);
            }
        },
        queryTasks: async (options) => {
            try {
                const { adapter } = await getSqliteState();
                if (typeof (adapter as any).queryTasks === 'function') {
                    return (adapter as any).queryTasks(options);
                }
            } catch (error) {
                logStorageWarn('[Storage] SQLite query failed, falling back to in-memory filter', error);
            }
            const data = await mobileStorage.getData();
            const statusFilter = options.status;
            const excludeStatuses = options.excludeStatuses ?? [];
            const includeArchived = options.includeArchived === true;
            const includeDeleted = options.includeDeleted === true;
            return data.tasks.filter((task) => {
                if (!includeDeleted && task.deletedAt) return false;
                if (!includeArchived && task.status === 'archived') return false;
                if (statusFilter && statusFilter !== 'all' && task.status !== statusFilter) return false;
                if (excludeStatuses.length > 0 && excludeStatuses.includes(task.status)) return false;
                if (options.projectId && task.projectId !== options.projectId) return false;
                return true;
            });
        },
        searchAll: async (query: string) => {
            try {
                const { adapter } = await getSqliteState();
                if (typeof (adapter as any).searchAll === 'function') {
                    return (adapter as any).searchAll(query);
                }
            } catch (error) {
                logStorageWarn('[Storage] SQLite search failed, falling back to in-memory search', error);
            }
            const data = await mobileStorage.getData();
            const { searchAll } = await import('@mindwtr/core');
            return searchAll(data.tasks, data.projects, query);
        },
    };
};

export const mobileStorage = createStorage();
