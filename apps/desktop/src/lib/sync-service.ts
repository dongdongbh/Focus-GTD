
import {
    AppData,
    Attachment,
    useTaskStore,
    MergeStats,
    computeSha256Hex,
    globalProgressTracker,
    findDeletedAttachmentsForFileCleanup,
    findOrphanedAttachments,
    removeOrphanedAttachmentsFromData,
    validateAttachmentForUpload,
    webdavGetJson,
    webdavPutJson,
    webdavGetFile,
    webdavPutFile,
    webdavFileExists,
    webdavMakeDirectory,
    webdavDeleteFile,
    cloudGetFile,
    cloudPutFile,
    cloudGetJson,
    cloudPutJson,
    cloudDeleteFile,
    flushPendingSave,
    performSyncCycle,
    normalizeAppData,
    normalizeWebdavUrl,
    normalizeCloudUrl,
    sanitizeAppDataForRemote,
    injectExternalCalendars as injectExternalCalendarsForSync,
    persistExternalCalendars as persistExternalCalendarsForSync,
    withRetry,
    CLOCK_SKEW_THRESHOLD_MS,
    appendSyncHistory,
} from '@mindwtr/core';
import { isTauriRuntime } from './runtime';
import { reportError } from './report-error';
import { logInfo, logSyncError, logWarn, sanitizeLogMessage } from './app-log';
import { ExternalCalendarService } from './external-calendar-service';
import { webStorage } from './storage-adapter-web';
import {
    ATTACHMENTS_DIR_NAME,
    buildCloudKey,
    cloneAppData,
    extractExtension,
    getFileSyncDir,
    getErrorStatus,
    hashString,
    isSyncFilePath,
    isTempAttachmentFile,
    isWebdavRateLimitedError,
    normalizeSyncBackend,
    sleep,
    stripFileScheme,
    toStableJson,
    writeAttachmentFileSafely,
    writeFileSafelyAbsolute,
} from './sync-service-utils';
import type { SyncBackend } from './sync-service-utils';

const SYNC_BACKEND_KEY = 'mindwtr-sync-backend';
const WEBDAV_URL_KEY = 'mindwtr-webdav-url';
const WEBDAV_USERNAME_KEY = 'mindwtr-webdav-username';
const WEBDAV_PASSWORD_KEY = 'mindwtr-webdav-password';
const CLOUD_URL_KEY = 'mindwtr-cloud-url';
const CLOUD_TOKEN_KEY = 'mindwtr-cloud-token';
const SYNC_FILE_NAME = 'data.json';
const LEGACY_SYNC_FILE_NAME = 'mindwtr-sync.json';
const WEBDAV_ATTACHMENT_RETRY_OPTIONS = { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 60_000 };
const CLOUD_ATTACHMENT_RETRY_OPTIONS = { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 60_000 };
const WEBDAV_ATTACHMENT_MIN_INTERVAL_MS = 400;
const WEBDAV_ATTACHMENT_COOLDOWN_MS = 60_000;
const WEBDAV_ATTACHMENT_MAX_DOWNLOADS_PER_SYNC = 10;
const WEBDAV_ATTACHMENT_MAX_UPLOADS_PER_SYNC = 10;
const WEBDAV_ATTACHMENT_MISSING_BACKOFF_MS = 15 * 60_000;
const WEBDAV_ATTACHMENT_ERROR_BACKOFF_MS = 2 * 60_000;
const webdavAttachmentDownloadBackoff = new Map<string, number>();

const logSyncWarning = (message: string, error?: unknown) => {
    const extra = error
        ? { error: sanitizeLogMessage(error instanceof Error ? error.message : String(error)) }
        : undefined;
    void logWarn(message, { scope: 'sync', extra });
};

const logSyncInfo = (message: string, extra?: Record<string, string>) => {
    void logInfo(message, { scope: 'sync', extra });
};

const getWebdavDownloadBackoff = (attachmentId: string): number | null => {
    const blockedUntil = webdavAttachmentDownloadBackoff.get(attachmentId);
    if (!blockedUntil) return null;
    if (Date.now() >= blockedUntil) {
        webdavAttachmentDownloadBackoff.delete(attachmentId);
        return null;
    }
    return blockedUntil;
};

const setWebdavDownloadBackoff = (attachmentId: string, error: unknown): void => {
    const status = getErrorStatus(error);
    if (status === 404) {
        webdavAttachmentDownloadBackoff.set(attachmentId, Date.now() + WEBDAV_ATTACHMENT_MISSING_BACKOFF_MS);
        return;
    }
    webdavAttachmentDownloadBackoff.set(attachmentId, Date.now() + WEBDAV_ATTACHMENT_ERROR_BACKOFF_MS);
};

const pruneWebdavDownloadBackoff = (): void => {
    const now = Date.now();
    for (const [id, blockedUntil] of webdavAttachmentDownloadBackoff) {
        if (blockedUntil <= now) {
            webdavAttachmentDownloadBackoff.delete(id);
        }
    }
};

const externalCalendarProvider = {
    load: () => ExternalCalendarService.getCalendars(),
    save: (calendars: AppData['settings']['externalCalendars'] | undefined) =>
        ExternalCalendarService.setCalendars(calendars ?? []),
    onWarn: (message: string, error?: unknown) => logSyncWarning(message, error),
};

const injectExternalCalendars = async (data: AppData): Promise<AppData> =>
    injectExternalCalendarsForSync(data, externalCalendarProvider);

const persistExternalCalendars = async (data: AppData): Promise<void> =>
    persistExternalCalendarsForSync(data, externalCalendarProvider);

class LocalSyncAbort extends Error {
    constructor() {
        super('Local changes detected during sync');
        this.name = 'LocalSyncAbort';
    }
}

// Sync should start from persisted data so startup sync cannot overwrite settings with an unhydrated store snapshot.
const readLocalDataForSync = async (): Promise<AppData> => {
    if (isTauriRuntime()) {
        try {
            const persisted = await tauriInvoke<AppData>('get_data');
            return normalizeAppData(persisted);
        } catch (error) {
            logSyncWarning('Failed to read persisted local data for sync; using in-memory snapshot', error);
        }
    } else {
        const persisted = await webStorage.getData();
        return normalizeAppData(persisted);
    }

    const state = useTaskStore.getState();
    return normalizeAppData({
        tasks: [...state._allTasks],
        projects: [...state._allProjects],
        sections: [...state._allSections],
        areas: [...state._allAreas],
        settings: state.settings ?? {},
    });
};

const LOCAL_ATTACHMENTS_DIR = `mindwtr/${ATTACHMENTS_DIR_NAME}`;
const FILE_BACKEND_VALIDATION_CONFIG = {
    maxFileSizeBytes: Number.POSITIVE_INFINITY,
    blockedMimeTypes: [],
};
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 120_000;

const cleanupAttachmentTempFiles = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    try {
        const { BaseDirectory, readDir, remove } = await import('@tauri-apps/plugin-fs');
        const entries = await readDir(LOCAL_ATTACHMENTS_DIR, { baseDir: BaseDirectory.Data });
        for (const entry of entries) {
            if (!entry.isFile) continue;
            const name = entry.name;
            if (!isTempAttachmentFile(name)) continue;
            try {
                await remove(`${LOCAL_ATTACHMENTS_DIR}/${name}`, { baseDir: BaseDirectory.Data });
            } catch (error) {
                logSyncWarning('Failed to remove temp attachment file', error);
            }
        }
    } catch (error) {
        logSyncWarning('Failed to scan temp attachment files', error);
    }
};

const validateAttachmentHash = async (attachment: Attachment, bytes: Uint8Array): Promise<void> => {
    const expected = attachment.fileHash;
    if (!expected || expected.length !== 64) return;
    const computed = await computeSha256Hex(bytes);
    if (!computed) return;
    if (computed.toLowerCase() !== expected.toLowerCase()) {
        throw new Error('Integrity validation failed');
    }
};

const reportProgress = (
    attachmentId: string,
    operation: 'upload' | 'download',
    loaded: number,
    total: number,
    status: 'active' | 'completed' | 'failed',
    error?: string,
) => {
    const percentage = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    globalProgressTracker.updateProgress(attachmentId, {
        operation,
        bytesTransferred: loaded,
        totalBytes: total,
        percentage,
        status,
        error,
    });
};

const shouldRunAttachmentCleanup = (lastCleanupAt?: string): boolean => {
    if (!lastCleanupAt) return true;
    const parsed = Date.parse(lastCleanupAt);
    if (Number.isNaN(parsed)) return true;
    return Date.now() - parsed >= CLEANUP_INTERVAL_MS;
};

const deleteAttachmentFile = async (attachment: Attachment): Promise<void> => {
    if (!attachment.uri) return;
    const rawUri = stripFileScheme(attachment.uri);
    if (/^https?:\/\//i.test(rawUri) || rawUri.startsWith('content://')) return;
    try {
        const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        const { dataDir } = await import('@tauri-apps/api/path');
        const baseDataDir = await dataDir();
        if (rawUri.startsWith(baseDataDir)) {
            const relative = rawUri.slice(baseDataDir.length).replace(/^[\\/]/, '');
            await remove(relative, { baseDir: BaseDirectory.Data });
        } else {
            await remove(rawUri);
        }
    } catch (error) {
        logSyncWarning(`Failed to delete attachment file ${attachment.title}`, error);
    }
};

const cleanupOrphanedAttachments = async (appData: AppData, backend: SyncBackend): Promise<AppData> => {
    const orphaned = findOrphanedAttachments(appData);
    const deletedAttachments = findDeletedAttachmentsForFileCleanup(appData);
    const cleanupTargets = new Map<string, Attachment>();
    for (const attachment of orphaned) cleanupTargets.set(attachment.id, attachment);
    for (const attachment of deletedAttachments) cleanupTargets.set(attachment.id, attachment);
    const lastCleanupAt = new Date().toISOString();

    if (cleanupTargets.size === 0) {
        await cleanupAttachmentTempFiles();
        return {
            ...appData,
            settings: {
                ...appData.settings,
                attachments: {
                    ...appData.settings.attachments,
                    lastCleanupAt,
                },
            },
        };
    }

    let webdavConfig: WebDavConfig | null = null;
    let cloudConfig: CloudConfig | null = null;
    let fileBaseDir: string | null = null;

    if (backend === 'webdav') {
        webdavConfig = await SyncService.getWebDavConfig();
    } else if (backend === 'cloud') {
        cloudConfig = await SyncService.getCloudConfig();
    } else if (backend === 'file') {
        const syncPath = await SyncService.getSyncPath();
        const baseDir = getFileSyncDir(syncPath, SYNC_FILE_NAME, LEGACY_SYNC_FILE_NAME);
        fileBaseDir = baseDir || null;
    }

    const fetcher = await getTauriFetch();
    const webdavPassword = webdavConfig ? await resolveWebdavPassword(webdavConfig) : '';

    for (const attachment of cleanupTargets.values()) {
        await deleteAttachmentFile(attachment);
        if (attachment.cloudKey) {
            try {
                if (backend === 'webdav' && webdavConfig?.url) {
                    const baseUrl = getBaseSyncUrl(webdavConfig.url);
                    await webdavDeleteFile(`${baseUrl}/${attachment.cloudKey}`, {
                        username: webdavConfig.username,
                        password: webdavPassword,
                        fetcher,
                    });
                } else if (backend === 'cloud' && cloudConfig?.url) {
                    const baseUrl = getCloudBaseUrl(cloudConfig.url);
                    await cloudDeleteFile(`${baseUrl}/${attachment.cloudKey}`, {
                        token: cloudConfig.token,
                        fetcher,
                    });
                } else if (backend === 'file' && fileBaseDir) {
                    const { remove } = await import('@tauri-apps/plugin-fs');
                    const { join } = await import('@tauri-apps/api/path');
                    const targetPath = await join(fileBaseDir, attachment.cloudKey);
                    await remove(targetPath);
                }
            } catch (error) {
                logSyncWarning(`Failed to delete remote attachment ${attachment.title}`, error);
            }
        }
    }

    await cleanupAttachmentTempFiles();

    const cleaned = orphaned.length > 0 ? removeOrphanedAttachmentsFromData(appData) : appData;
    return {
        ...cleaned,
        settings: {
            ...cleaned.settings,
            attachments: {
                ...cleaned.settings.attachments,
                lastCleanupAt,
            },
        },
    };
};

const getBaseSyncUrl = (fullUrl: string): string => {
    const trimmed = fullUrl.replace(/\/+$/, '');
    if (trimmed.toLowerCase().endsWith('.json')) {
        const lastSlash = trimmed.lastIndexOf('/');
        return lastSlash >= 0 ? trimmed.slice(0, lastSlash) : trimmed;
    }
    return trimmed;
};

const getCloudBaseUrl = (fullUrl: string): string => {
    const trimmed = fullUrl.replace(/\/+$/, '');
    if (trimmed.toLowerCase().endsWith('/data')) {
        return trimmed.slice(0, -'/data'.length);
    }
    return trimmed;
};

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke<T>(command as any, args as any);
}

type WebDavConfig = { url: string; username: string; password?: string; hasPassword?: boolean };
type CloudConfig = { url: string; token: string };

async function getTauriFetch(): Promise<typeof fetch | undefined> {
    if (!isTauriRuntime()) return undefined;
    try {
        const mod = await import('@tauri-apps/plugin-http');
        return mod.fetch;
    } catch (error) {
        logSyncWarning('Failed to load tauri http fetch', error);
        return undefined;
    }
}

async function resolveWebdavPassword(config: WebDavConfig): Promise<string> {
    if (typeof config.password === 'string') return config.password;
    if (config.hasPassword === false) return '';
    if (!isTauriRuntime()) return '';
    try {
        return await tauriInvoke<string>('get_webdav_password');
    } catch (error) {
        logSyncWarning('Failed to load WebDAV password', error);
        return '';
    }
}

async function syncAttachments(
    appData: AppData,
    webDavConfig: WebDavConfig,
    baseSyncUrl: string
): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    if (!webDavConfig.url) return false;

    const fetcher = await getTauriFetch();
    const { BaseDirectory, exists, mkdir, readFile, writeFile, rename, remove } = await import('@tauri-apps/plugin-fs');
    const { dataDir, join } = await import('@tauri-apps/api/path');
    const password = await resolveWebdavPassword(webDavConfig);

    const attachmentsDirUrl = `${baseSyncUrl}/${ATTACHMENTS_DIR_NAME}`;
    try {
        await webdavMakeDirectory(attachmentsDirUrl, {
            username: webDavConfig.username,
            password,
            fetcher,
        });
    } catch (error) {
        logSyncWarning('Failed to ensure WebDAV attachments directory', error);
    }

    try {
        await mkdir(LOCAL_ATTACHMENTS_DIR, { baseDir: BaseDirectory.Data, recursive: true });
    } catch (error) {
        logSyncWarning('Failed to ensure local attachments directory', error);
    }

    const baseDataDir = await dataDir();
    const workingData = cloneAppData(appData);

    const attachmentsById = new Map<string, Attachment>();
    for (const task of workingData.tasks) {
        for (const attachment of task.attachments || []) {
            attachmentsById.set(attachment.id, attachment);
        }
    }
    for (const project of workingData.projects) {
        for (const attachment of project.attachments || []) {
            attachmentsById.set(attachment.id, attachment);
        }
    }

    pruneWebdavDownloadBackoff();

    logSyncInfo('WebDAV attachment sync start', { count: String(attachmentsById.size) });

    let lastRequestAt = 0;
    let blockedUntil = 0;
    const waitForSlot = async (): Promise<void> => {
        const now = Date.now();
        if (blockedUntil && now < blockedUntil) {
            throw new Error(`WebDAV rate limited for ${blockedUntil - now}ms`);
        }
        const elapsed = now - lastRequestAt;
        if (elapsed < WEBDAV_ATTACHMENT_MIN_INTERVAL_MS) {
            await sleep(WEBDAV_ATTACHMENT_MIN_INTERVAL_MS - elapsed);
        }
        lastRequestAt = Date.now();
    };
    const handleRateLimit = (error: unknown): boolean => {
        if (!isWebdavRateLimitedError(error)) return false;
        blockedUntil = Date.now() + WEBDAV_ATTACHMENT_COOLDOWN_MS;
        logSyncWarning('WebDAV rate limited; pausing attachment sync', error);
        return true;
    };

    const readLocalFile = async (path: string): Promise<Uint8Array> => {
        if (path.startsWith(baseDataDir)) {
            const relative = path.slice(baseDataDir.length).replace(/^[\\/]/, '');
            return await readFile(relative, { baseDir: BaseDirectory.Data });
        }
        return await readFile(path);
    };

    const localFileExists = async (path: string): Promise<boolean> => {
        try {
            if (path.startsWith(baseDataDir)) {
                const relative = path.slice(baseDataDir.length).replace(/^[\\/]/, '');
                return await exists(relative, { baseDir: BaseDirectory.Data });
            }
            return await exists(path);
        } catch (error) {
            logSyncWarning('Failed to check attachment file', error);
            return false;
        }
    };

    let didMutate = false;
    const downloadQueue: Attachment[] = [];
    let abortedByRateLimit = false;
    let uploadCount = 0;
    let uploadLimitLogged = false;

    for (const attachment of attachmentsById.values()) {
        if (attachment.kind !== 'file') continue;
        if (attachment.deletedAt) continue;
        if (abortedByRateLimit) break;

        const rawUri = attachment.uri ? stripFileScheme(attachment.uri) : '';
        const isHttp = /^https?:\/\//i.test(rawUri);
        const localPath = isHttp ? '' : rawUri;
        const hasLocalPath = Boolean(localPath);
        const existsLocally = hasLocalPath ? await localFileExists(localPath) : false;
        logSyncInfo('WebDAV attachment check', {
            id: attachment.id,
            title: attachment.title || 'attachment',
            uri: localPath ? localPath : rawUri,
            cloud: attachment.cloudKey ? 'set' : 'missing',
            local: hasLocalPath ? 'true' : 'false',
            exists: existsLocally ? 'true' : 'false',
        });

        const nextStatus: Attachment['localStatus'] = existsLocally ? 'available' : 'missing';
        if (attachment.localStatus !== nextStatus) {
            attachment.localStatus = nextStatus;
            didMutate = true;
        }
        if (existsLocally) {
            webdavAttachmentDownloadBackoff.delete(attachment.id);
        }

        if (attachment.cloudKey && existsLocally) {
            try {
                const remoteExists = await withRetry(
                    async () => {
                        await waitForSlot();
                        return await webdavFileExists(`${baseSyncUrl}/${attachment.cloudKey}`, {
                            username: webDavConfig.username,
                            password,
                            fetcher,
                        });
                    },
                    WEBDAV_ATTACHMENT_RETRY_OPTIONS
                );
                logSyncInfo('WebDAV attachment remote exists', {
                    id: attachment.id,
                    exists: remoteExists ? 'true' : 'false',
                });
                if (!remoteExists) {
                    attachment.cloudKey = undefined;
                    didMutate = true;
                }
            } catch (error) {
                if (handleRateLimit(error)) {
                    abortedByRateLimit = true;
                    break;
                }
                logSyncWarning('Failed to check WebDAV attachment remote status', error);
            }
        }

        if (!attachment.cloudKey && existsLocally) {
            if (uploadCount >= WEBDAV_ATTACHMENT_MAX_UPLOADS_PER_SYNC) {
                if (!uploadLimitLogged) {
                    logSyncInfo('WebDAV attachment upload limit reached', {
                        limit: String(WEBDAV_ATTACHMENT_MAX_UPLOADS_PER_SYNC),
                    });
                    uploadLimitLogged = true;
                }
                continue;
            }
            uploadCount += 1;
            const cloudKey = buildCloudKey(attachment);
            try {
                const fileData = await readLocalFile(localPath);
                const validation = await validateAttachmentForUpload(attachment, fileData.length);
                if (!validation.valid) {
                    logSyncWarning(`Attachment validation failed (${validation.error}) for ${attachment.title}`);
                    continue;
                }
                reportProgress(attachment.id, 'upload', 0, fileData.length, 'active');
                logSyncInfo('WebDAV attachment upload start', {
                    id: attachment.id,
                    bytes: String(fileData.length),
                    cloudKey,
                });
                await withRetry(
                    async () => {
                        await waitForSlot();
                        return await webdavPutFile(
                            `${baseSyncUrl}/${cloudKey}`,
                            fileData,
                            attachment.mimeType || 'application/octet-stream',
                            {
                                headers: { 'Content-Length': String(fileData.length) },
                                username: webDavConfig.username,
                                password,
                                fetcher,
                                timeoutMs: UPLOAD_TIMEOUT_MS,
                            }
                        );
                    },
                    {
                        ...WEBDAV_ATTACHMENT_RETRY_OPTIONS,
                        onRetry: (error, attempt, delayMs) => {
                            logSyncInfo('Retrying WebDAV attachment upload', {
                                id: attachment.id,
                                attempt: String(attempt + 1),
                                delayMs: String(delayMs),
                                error: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
                            });
                        },
                    }
                );
                attachment.cloudKey = cloudKey;
                attachment.localStatus = 'available';
                didMutate = true;
                reportProgress(attachment.id, 'upload', fileData.length, fileData.length, 'completed');
                logSyncInfo('WebDAV attachment upload done', {
                    id: attachment.id,
                    bytes: String(fileData.length),
                });
            } catch (error) {
                if (handleRateLimit(error)) {
                    abortedByRateLimit = true;
                    break;
                }
                reportProgress(
                    attachment.id,
                    'upload',
                    0,
                    attachment.size ?? 0,
                    'failed',
                    error instanceof Error ? error.message : String(error)
                );
                logSyncWarning(`Failed to upload attachment ${attachment.title}`, error);
            }
            continue;
        }

        if (attachment.cloudKey && !existsLocally) {
            downloadQueue.push(attachment);
        }
    }

    let downloadCount = 0;
    for (const attachment of downloadQueue) {
        if (attachment.kind !== 'file') continue;
        if (attachment.deletedAt) continue;
        if (abortedByRateLimit) break;
        if (!attachment.cloudKey) continue;
        if (getWebdavDownloadBackoff(attachment.id)) continue;
        if (downloadCount >= WEBDAV_ATTACHMENT_MAX_DOWNLOADS_PER_SYNC) {
            logSyncInfo('WebDAV attachment download limit reached', {
                limit: String(WEBDAV_ATTACHMENT_MAX_DOWNLOADS_PER_SYNC),
            });
            break;
        }
        downloadCount += 1;

        const cloudKey = attachment.cloudKey;
        try {
            const downloadUrl = `${baseSyncUrl}/${cloudKey}`;
            const fileData = await withRetry(
                async () => {
                    await waitForSlot();
                    return await webdavGetFile(downloadUrl, {
                        username: webDavConfig.username,
                        password,
                        fetcher,
                        onProgress: (loaded, total) => reportProgress(attachment.id, 'download', loaded, total, 'active'),
                    });
                },
                WEBDAV_ATTACHMENT_RETRY_OPTIONS
            );
            const bytes = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : new Uint8Array(fileData as ArrayBuffer);
            await validateAttachmentHash(attachment, bytes);
            const filename = cloudKey.split('/').pop() || `${attachment.id}${extractExtension(attachment.uri)}`;
            const relativePath = `${LOCAL_ATTACHMENTS_DIR}/${filename}`;
            await writeAttachmentFileSafely(relativePath, bytes, {
                baseDir: BaseDirectory.Data,
                writeFile,
                rename,
                remove,
            });
            const absolutePath = await join(baseDataDir, relativePath);
            attachment.uri = absolutePath;
            if (attachment.localStatus !== 'available') {
                attachment.localStatus = 'available';
                didMutate = true;
            }
            webdavAttachmentDownloadBackoff.delete(attachment.id);
            reportProgress(attachment.id, 'download', bytes.length, bytes.length, 'completed');
        } catch (error) {
            if (handleRateLimit(error)) {
                abortedByRateLimit = true;
                break;
            }
            setWebdavDownloadBackoff(attachment.id, error);
            if (attachment.localStatus !== 'missing') {
                attachment.localStatus = 'missing';
                didMutate = true;
            }
            reportProgress(
                attachment.id,
                'download',
                0,
                attachment.size ?? 0,
                'failed',
                error instanceof Error ? error.message : String(error)
            );
            logSyncWarning(`Failed to download attachment ${attachment.title}`, error);
        }
    }

    if (abortedByRateLimit) {
        logSyncWarning('WebDAV attachment sync aborted due to rate limiting');
    }
    if (didMutate) {
        appData.tasks = workingData.tasks;
        appData.projects = workingData.projects;
        appData.sections = workingData.sections;
        appData.areas = workingData.areas;
        appData.settings = workingData.settings;
    }
    logSyncInfo('WebDAV attachment sync done', { mutated: didMutate ? 'true' : 'false' });
    return didMutate;
}

async function syncCloudAttachments(
    appData: AppData,
    cloudConfig: CloudConfig,
    baseSyncUrl: string
): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    if (!cloudConfig.url) return false;

    const fetcher = await getTauriFetch();
    const { BaseDirectory, exists, mkdir, readFile, writeFile, rename, remove } = await import('@tauri-apps/plugin-fs');
    const { dataDir, join } = await import('@tauri-apps/api/path');

    try {
        await mkdir(LOCAL_ATTACHMENTS_DIR, { baseDir: BaseDirectory.Data, recursive: true });
    } catch (error) {
        logSyncWarning('Failed to ensure local attachments directory', error);
    }

    const baseDataDir = await dataDir();

    const attachmentsById = new Map<string, Attachment>();
    for (const task of appData.tasks) {
        for (const attachment of task.attachments || []) {
            attachmentsById.set(attachment.id, attachment);
        }
    }
    for (const project of appData.projects) {
        for (const attachment of project.attachments || []) {
            attachmentsById.set(attachment.id, attachment);
        }
    }

    const readLocalFile = async (path: string): Promise<Uint8Array> => {
        if (path.startsWith(baseDataDir)) {
            const relative = path.slice(baseDataDir.length).replace(/^[\\/]/, '');
            return await readFile(relative, { baseDir: BaseDirectory.Data });
        }
        return await readFile(path);
    };

    const localFileExists = async (path: string): Promise<boolean> => {
        try {
            if (path.startsWith(baseDataDir)) {
                const relative = path.slice(baseDataDir.length).replace(/^[\\/]/, '');
                return await exists(relative, { baseDir: BaseDirectory.Data });
            }
            return await exists(path);
        } catch (error) {
            logSyncWarning('Failed to check attachment file', error);
            return false;
        }
    };

    let didMutate = false;

    for (const attachment of attachmentsById.values()) {
        if (attachment.kind !== 'file') continue;
        if (attachment.deletedAt) continue;

        const rawUri = attachment.uri ? stripFileScheme(attachment.uri) : '';
        const isHttp = /^https?:\/\//i.test(rawUri);
        const localPath = isHttp ? '' : rawUri;
        const hasLocalPath = Boolean(localPath);
        const existsLocally = hasLocalPath ? await localFileExists(localPath) : false;

        const nextStatus: Attachment['localStatus'] = existsLocally ? 'available' : 'missing';
        if (attachment.localStatus !== nextStatus) {
            attachment.localStatus = nextStatus;
            didMutate = true;
        }

        if (!attachment.cloudKey && existsLocally) {
            const cloudKey = buildCloudKey(attachment);
            try {
                const fileData = await readLocalFile(localPath);
                const validation = await validateAttachmentForUpload(attachment, fileData.length);
                if (!validation.valid) {
                    logSyncWarning(`Attachment validation failed (${validation.error}) for ${attachment.title}`);
                    continue;
                }
                reportProgress(attachment.id, 'upload', 0, fileData.length, 'active');
                await withRetry(
                    () => cloudPutFile(
                        `${baseSyncUrl}/${cloudKey}`,
                        fileData,
                        attachment.mimeType || 'application/octet-stream',
                        {
                            token: cloudConfig.token,
                            fetcher,
                            timeoutMs: UPLOAD_TIMEOUT_MS,
                            onProgress: (loaded, total) => reportProgress(attachment.id, 'upload', loaded, total, 'active'),
                        }
                    ),
                    {
                        ...CLOUD_ATTACHMENT_RETRY_OPTIONS,
                        onRetry: (error, attempt, delayMs) => {
                            logSyncInfo('Retrying cloud attachment upload', {
                                id: attachment.id,
                                attempt: String(attempt + 1),
                                delayMs: String(delayMs),
                                error: sanitizeLogMessage(error instanceof Error ? error.message : String(error)),
                            });
                        },
                    }
                );
                attachment.cloudKey = cloudKey;
                attachment.localStatus = 'available';
                didMutate = true;
                reportProgress(attachment.id, 'upload', fileData.length, fileData.length, 'completed');
            } catch (error) {
                reportProgress(
                    attachment.id,
                    'upload',
                    0,
                    attachment.size ?? 0,
                    'failed',
                    error instanceof Error ? error.message : String(error)
                );
                logSyncWarning(`Failed to upload attachment ${attachment.title}`, error);
            }
        }

        if (attachment.cloudKey && !existsLocally) {
            try {
                const downloadUrl = `${baseSyncUrl}/${attachment.cloudKey}`;
                const fileData = await withRetry(() =>
                    cloudGetFile(downloadUrl, {
                        token: cloudConfig.token,
                        fetcher,
                        onProgress: (loaded, total) => reportProgress(attachment.id, 'download', loaded, total, 'active'),
                    })
                );
                const bytes = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : new Uint8Array(fileData as ArrayBuffer);
                await validateAttachmentHash(attachment, bytes);
                const filename = attachment.cloudKey.split('/').pop() || `${attachment.id}${extractExtension(attachment.uri)}`;
                const relativePath = `${LOCAL_ATTACHMENTS_DIR}/${filename}`;
                await writeAttachmentFileSafely(relativePath, bytes, {
                    baseDir: BaseDirectory.Data,
                    writeFile,
                    rename,
                    remove,
                });
                const absolutePath = await join(baseDataDir, relativePath);
                attachment.uri = absolutePath;
                if (attachment.localStatus !== 'available') {
                    attachment.localStatus = 'available';
                    didMutate = true;
                }
                reportProgress(attachment.id, 'download', bytes.length, bytes.length, 'completed');
            } catch (error) {
                if (attachment.localStatus !== 'missing') {
                    attachment.localStatus = 'missing';
                    didMutate = true;
                }
                reportProgress(
                    attachment.id,
                    'download',
                    0,
                    attachment.size ?? 0,
                    'failed',
                    error instanceof Error ? error.message : String(error)
                );
                logSyncWarning(`Failed to download attachment ${attachment.title}`, error);
            }
        }
    }

    return didMutate;
}

async function syncFileAttachments(
    appData: AppData,
    baseSyncDir: string
): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    if (!baseSyncDir) return false;

    const { BaseDirectory, exists, mkdir, readFile, writeFile, rename, remove } = await import('@tauri-apps/plugin-fs');
    const { dataDir, join } = await import('@tauri-apps/api/path');

    const attachmentsDir = await join(baseSyncDir, ATTACHMENTS_DIR_NAME);
    try {
        await mkdir(attachmentsDir, { recursive: true });
    } catch (error) {
        logSyncWarning('Failed to ensure sync attachments directory', error);
    }

    try {
        await mkdir(LOCAL_ATTACHMENTS_DIR, { baseDir: BaseDirectory.Data, recursive: true });
    } catch (error) {
        logSyncWarning('Failed to ensure local attachments directory', error);
    }

    const baseDataDir = await dataDir();

    const attachmentsById = new Map<string, Attachment>();
    for (const task of appData.tasks) {
        for (const attachment of task.attachments || []) {
            attachmentsById.set(attachment.id, attachment);
        }
    }
    for (const project of appData.projects) {
        for (const attachment of project.attachments || []) {
            attachmentsById.set(attachment.id, attachment);
        }
    }

    const readLocalFile = async (path: string): Promise<Uint8Array> => {
        if (path.startsWith(baseDataDir)) {
            const relative = path.slice(baseDataDir.length).replace(/^[\\/]/, '');
            return await readFile(relative, { baseDir: BaseDirectory.Data });
        }
        return await readFile(path);
    };

    const localFileExists = async (path: string): Promise<boolean> => {
        try {
            if (path.startsWith(baseDataDir)) {
                const relative = path.slice(baseDataDir.length).replace(/^[\\/]/, '');
                return await exists(relative, { baseDir: BaseDirectory.Data });
            }
            return await exists(path);
        } catch (error) {
            logSyncWarning('Failed to check attachment file', error);
            return false;
        }
    };

    let didMutate = false;

    for (const attachment of attachmentsById.values()) {
        if (attachment.kind !== 'file') continue;
        if (attachment.deletedAt) continue;

        const rawUri = attachment.uri ? stripFileScheme(attachment.uri) : '';
        const isHttp = /^https?:\/\//i.test(rawUri);
        const localPath = isHttp ? '' : rawUri;
        const hasLocalPath = Boolean(localPath);
        const existsLocally = hasLocalPath ? await localFileExists(localPath) : false;

        const nextStatus: Attachment['localStatus'] = existsLocally ? 'available' : 'missing';
        if (attachment.localStatus !== nextStatus) {
            attachment.localStatus = nextStatus;
            didMutate = true;
        }

        if (!attachment.cloudKey && existsLocally) {
            const cloudKey = buildCloudKey(attachment);
            try {
                const fileData = await readLocalFile(localPath);
                const validation = await validateAttachmentForUpload(attachment, fileData.length, FILE_BACKEND_VALIDATION_CONFIG);
                if (!validation.valid) {
                    logSyncWarning(`Attachment validation failed (${validation.error}) for ${attachment.title}`);
                    continue;
                }
                const targetPath = await join(baseSyncDir, cloudKey);
                await writeFileSafelyAbsolute(targetPath, fileData, {
                    writeFile,
                    rename,
                    remove,
                });
                attachment.cloudKey = cloudKey;
                attachment.localStatus = 'available';
                didMutate = true;
            } catch (error) {
                logSyncWarning(`Failed to copy attachment ${attachment.title} to sync folder`, error);
            }
        }

        if (attachment.cloudKey && !existsLocally) {
            try {
                const sourcePath = await join(baseSyncDir, attachment.cloudKey);
                const hasRemote = await exists(sourcePath);
                if (!hasRemote) continue;
                const fileData = await readFile(sourcePath);
                await validateAttachmentHash(attachment, fileData);
                const filename = attachment.cloudKey.split('/').pop() || `${attachment.id}${extractExtension(attachment.uri)}`;
                const relativePath = `${LOCAL_ATTACHMENTS_DIR}/${filename}`;
                await writeAttachmentFileSafely(relativePath, fileData, {
                    baseDir: BaseDirectory.Data,
                    writeFile,
                    rename,
                    remove,
                });
                const absolutePath = await join(baseDataDir, relativePath);
                attachment.uri = absolutePath;
                if (attachment.localStatus !== 'available') {
                    attachment.localStatus = 'available';
                    didMutate = true;
                }
            } catch (error) {
                if (attachment.localStatus !== 'missing') {
                    attachment.localStatus = 'missing';
                    didMutate = true;
                }
                logSyncWarning(`Failed to copy attachment ${attachment.title} from sync folder`, error);
            }
        }
    }

    return didMutate;
}

export class SyncService {
    private static didMigrate = false;
    private static syncInFlight: Promise<{ success: boolean; stats?: MergeStats; error?: string }> | null = null;
    private static syncQueued = false;
    private static syncStatus: {
        inFlight: boolean;
        queued: boolean;
        step: string | null;
        lastResult: 'success' | 'error' | null;
        lastResultAt: string | null;
    } = {
        inFlight: false,
        queued: false,
        step: null,
        lastResult: null,
        lastResultAt: null,
    };
    private static syncListeners = new Set<(status: typeof SyncService.syncStatus) => void>();
    private static fileWatcherStop: (() => void) | null = null;
    private static fileWatcherPath: string | null = null;
    private static fileWatcherBackend: SyncBackend | null = null;
    private static lastWrittenHash: string | null = null;
    private static lastObservedHash: string | null = null;
    private static ignoreFileEventsUntil = 0;
    private static externalSyncTimer: ReturnType<typeof setTimeout> | null = null;

    static getSyncStatus() {
        return SyncService.syncStatus;
    }

    static subscribeSyncStatus(listener: (status: typeof SyncService.syncStatus) => void): () => void {
        SyncService.syncListeners.add(listener);
        listener(SyncService.syncStatus);
        return () => SyncService.syncListeners.delete(listener);
    }

    private static updateSyncStatus(partial: Partial<typeof SyncService.syncStatus>) {
        SyncService.syncStatus = { ...SyncService.syncStatus, ...partial };
        SyncService.syncListeners.forEach((listener) => listener(SyncService.syncStatus));
    }

    private static getSyncBackendLocal(): SyncBackend {
        return normalizeSyncBackend(localStorage.getItem(SYNC_BACKEND_KEY));
    }

    private static setSyncBackendLocal(backend: SyncBackend) {
        localStorage.setItem(SYNC_BACKEND_KEY, backend);
    }

    private static getWebDavConfigLocal(): WebDavConfig {
        return {
            url: localStorage.getItem(WEBDAV_URL_KEY) || '',
            username: localStorage.getItem(WEBDAV_USERNAME_KEY) || '',
            password: '',
            hasPassword: false,
        };
    }

    private static setWebDavConfigLocal(config: { url: string; username?: string; password?: string }) {
        localStorage.setItem(WEBDAV_URL_KEY, config.url);
        localStorage.setItem(WEBDAV_USERNAME_KEY, config.username || '');
    }

    private static getCloudConfigLocal(): CloudConfig {
        const sessionToken = sessionStorage.getItem(CLOUD_TOKEN_KEY) || '';
        const legacyLocalToken = localStorage.getItem(CLOUD_TOKEN_KEY) || '';
        const token = sessionToken || legacyLocalToken;
        if (!sessionToken && legacyLocalToken) {
            sessionStorage.setItem(CLOUD_TOKEN_KEY, legacyLocalToken);
            localStorage.removeItem(CLOUD_TOKEN_KEY);
        }
        return {
            url: localStorage.getItem(CLOUD_URL_KEY) || '',
            token,
        };
    }

    private static setCloudConfigLocal(config: { url: string; token?: string }) {
        localStorage.setItem(CLOUD_URL_KEY, config.url);
        if (config.token) {
            sessionStorage.setItem(CLOUD_TOKEN_KEY, config.token);
        } else {
            sessionStorage.removeItem(CLOUD_TOKEN_KEY);
        }
        localStorage.removeItem(CLOUD_TOKEN_KEY);
    }

    private static async maybeMigrateLegacyLocalStorageToConfig() {
        if (!isTauriRuntime() || SyncService.didMigrate) return;
        SyncService.didMigrate = true;

        const legacyBackend = localStorage.getItem(SYNC_BACKEND_KEY);
        const legacyWebdav = SyncService.getWebDavConfigLocal();
        const legacyCloud = SyncService.getCloudConfigLocal();
        const hasLegacyBackend = legacyBackend === 'webdav' || legacyBackend === 'cloud';
        const hasLegacyWebdav = Boolean(legacyWebdav.url);
        const hasLegacyCloud = Boolean(legacyCloud.url || legacyCloud.token);
        if (!hasLegacyBackend && !hasLegacyWebdav && !hasLegacyCloud) return;

        try {
            const [currentBackend, currentWebdav, currentCloud] = await Promise.all([
                tauriInvoke<string>('get_sync_backend'),
                tauriInvoke<WebDavConfig>('get_webdav_config'),
                tauriInvoke<CloudConfig>('get_cloud_config'),
            ]);

            let migrated = false;
            if (hasLegacyBackend && normalizeSyncBackend(currentBackend) === 'file') {
                await tauriInvoke('set_sync_backend', { backend: legacyBackend });
                migrated = true;
            }

            if (hasLegacyWebdav && !currentWebdav.url) {
                await tauriInvoke('set_webdav_config', legacyWebdav);
                migrated = true;
            }

            if (hasLegacyCloud && !currentCloud.url && !currentCloud.token) {
                await tauriInvoke('set_cloud_config', { url: legacyCloud.url, token: legacyCloud.token });
                migrated = true;
            }

            if (migrated) {
                localStorage.removeItem(SYNC_BACKEND_KEY);
                localStorage.removeItem(WEBDAV_URL_KEY);
                localStorage.removeItem(WEBDAV_USERNAME_KEY);
                localStorage.removeItem(WEBDAV_PASSWORD_KEY);
                localStorage.removeItem(CLOUD_URL_KEY);
                localStorage.removeItem(CLOUD_TOKEN_KEY);
                sessionStorage.removeItem(WEBDAV_PASSWORD_KEY);
                sessionStorage.removeItem(CLOUD_TOKEN_KEY);
            }
        } catch (error) {
            reportError('Failed to migrate legacy sync config', error);
        }
    }

    static async getSyncBackend(): Promise<SyncBackend> {
        if (!isTauriRuntime()) return SyncService.getSyncBackendLocal();
        await SyncService.maybeMigrateLegacyLocalStorageToConfig();
        try {
            const backend = await tauriInvoke<string>('get_sync_backend');
            return normalizeSyncBackend(backend);
        } catch (error) {
            reportError('Failed to get sync backend', error);
            return 'off';
        }
    }

    static async setSyncBackend(backend: SyncBackend): Promise<void> {
        if (!isTauriRuntime()) {
            SyncService.setSyncBackendLocal(backend);
            return;
        }
        try {
            await tauriInvoke('set_sync_backend', { backend });
            await SyncService.startFileWatcher();
        } catch (error) {
            reportError('Failed to set sync backend', error);
        }
    }

    static async getWebDavConfig(options?: { silent?: boolean }): Promise<WebDavConfig> {
        if (!isTauriRuntime()) return SyncService.getWebDavConfigLocal();
        await SyncService.maybeMigrateLegacyLocalStorageToConfig();
        try {
            return await tauriInvoke<WebDavConfig>('get_webdav_config');
        } catch (error) {
            if (!options?.silent) {
                reportError('Failed to get WebDAV config', error);
            }
            return { url: '', username: '', hasPassword: false };
        }
    }

    static async setWebDavConfig(config: { url: string; username?: string; password?: string }): Promise<void> {
        if (!isTauriRuntime()) {
            SyncService.setWebDavConfigLocal(config);
            return;
        }
        try {
            await tauriInvoke('set_webdav_config', {
                url: config.url,
                username: config.username || '',
                password: config.password || '',
            });
        } catch (error) {
            reportError('Failed to set WebDAV config', error);
        }
    }

    static async getCloudConfig(options?: { silent?: boolean }): Promise<CloudConfig> {
        if (!isTauriRuntime()) return SyncService.getCloudConfigLocal();
        await SyncService.maybeMigrateLegacyLocalStorageToConfig();
        try {
            return await tauriInvoke<CloudConfig>('get_cloud_config');
        } catch (error) {
            if (!options?.silent) {
                reportError('Failed to get Self-Hosted config', error);
            }
            return { url: '', token: '' };
        }
    }

    static async setCloudConfig(config: { url: string; token?: string }): Promise<void> {
        if (!isTauriRuntime()) {
            SyncService.setCloudConfigLocal(config);
            return;
        }
        try {
            await tauriInvoke('set_cloud_config', {
                url: config.url,
                token: config.token || '',
            });
        } catch (error) {
            reportError('Failed to set Self-Hosted config', error);
        }
    }

    /**
     * Get the currently configured sync path from the backend
     */
    static async getSyncPath(): Promise<string> {
        if (!isTauriRuntime()) return '';
        try {
            return await tauriInvoke<string>('get_sync_path');
        } catch (error) {
            reportError('Failed to get sync path', error);
            return '';
        }
    }

    /**
     * Set the sync path in the backend
     */
    static async setSyncPath(path: string): Promise<{ success: boolean; path: string }> {
        if (!isTauriRuntime()) return { success: false, path: '' };
        try {
            const result = await tauriInvoke<{ success: boolean; path: string }>('set_sync_path', { syncPath: path });
            if (result?.success) {
                await SyncService.startFileWatcher();
            }
            return result;
        } catch (error) {
            reportError('Failed to set sync path', error);
            return { success: false, path: '' };
        }
    }

    private static async markSyncWrite(data: AppData) {
        const hash = await hashString(toStableJson(data));
        SyncService.lastWrittenHash = hash;
        SyncService.ignoreFileEventsUntil = Date.now() + 2000;
    }

    private static async handleFileChange(paths: string[]) {
        if (!isTauriRuntime()) return;
        if (Date.now() < SyncService.ignoreFileEventsUntil) return;

        const hasSyncFile = paths.some((path) => isSyncFilePath(path, SYNC_FILE_NAME, LEGACY_SYNC_FILE_NAME));
        if (!hasSyncFile) return;

        try {
            const syncData = await tauriInvoke<AppData>('read_sync_file');
            const normalized = normalizeAppData(syncData);
            const hash = await hashString(toStableJson(normalized));
            if (hash === SyncService.lastWrittenHash) {
                return;
            }
            if (hash === SyncService.lastObservedHash) {
                return;
            }
            SyncService.lastObservedHash = hash;

            if (SyncService.externalSyncTimer) {
                clearTimeout(SyncService.externalSyncTimer);
            }
            SyncService.externalSyncTimer = setTimeout(() => {
                SyncService.performSync().catch((error) => reportError('Sync failed', error));
            }, 750);
        } catch (error) {
            logSyncWarning('Failed to process external sync change', error);
        }
    }

    private static resolveUnwatch(unwatch: unknown): (() => void) | null {
        if (typeof unwatch === 'function') return unwatch as () => void;
        if (unwatch && typeof (unwatch as any).stop === 'function') {
            return () => (unwatch as any).stop();
        }
        if (unwatch && typeof (unwatch as any).unwatch === 'function') {
            return () => (unwatch as any).unwatch();
        }
        return null;
    }

    static async startFileWatcher(): Promise<void> {
        if (!isTauriRuntime()) return;
        const backend = await SyncService.getSyncBackend();
        if (backend !== 'file') {
            await SyncService.stopFileWatcher();
            return;
        }
        const syncPath = await SyncService.getSyncPath();
        if (!syncPath) {
            await SyncService.stopFileWatcher();
            return;
        }
        const watchPath = syncPath;
        if (SyncService.fileWatcherStop && SyncService.fileWatcherPath === watchPath && SyncService.fileWatcherBackend === backend) {
            return;
        }

        await SyncService.stopFileWatcher();

        try {
            const { watch } = await import('@tauri-apps/plugin-fs');
            const unwatch = await watch(watchPath, (event: any) => {
                const paths = Array.isArray(event?.paths)
                    ? event.paths
                    : event?.path
                        ? [event.path]
                        : [];
                if (paths.length === 0) return;
                void SyncService.handleFileChange(paths);
            });
            SyncService.fileWatcherStop = SyncService.resolveUnwatch(unwatch);
            SyncService.fileWatcherPath = watchPath;
            SyncService.fileWatcherBackend = backend;
        } catch (error) {
            logSyncWarning('Failed to start sync file watcher', error);
        }
    }

    static async stopFileWatcher(): Promise<void> {
        if (SyncService.fileWatcherStop) {
            try {
                SyncService.fileWatcherStop();
            } catch (error) {
                logSyncWarning('Failed to stop sync watcher', error);
            }
        }
        if (SyncService.externalSyncTimer) {
            clearTimeout(SyncService.externalSyncTimer);
            SyncService.externalSyncTimer = null;
        }
        SyncService.fileWatcherStop = null;
        SyncService.fileWatcherPath = null;
        SyncService.fileWatcherBackend = null;
    }

    static async cleanupAttachmentsNow(): Promise<void> {
        if (!isTauriRuntime()) return;
        const backend = await SyncService.getSyncBackend();
        const data = await tauriInvoke<AppData>('get_data');
        const cleaned = await cleanupOrphanedAttachments(data, backend);
        await tauriInvoke('save_data', { data: cleaned });
        await useTaskStore.getState().fetchData({ silent: true });
    }

    /**
     * Perform a full sync cycle:
     * 1. Read Local & Remote Data
     * 2. Merge (Last-Write-Wins)
     * 3. Write merged data back to both Local & Remote
     * 4. Refresh Core Store
     */
    static async performSync(): Promise<{ success: boolean; stats?: MergeStats; error?: string }> {
        if (SyncService.syncInFlight) {
            SyncService.syncQueued = true;
            SyncService.updateSyncStatus({ queued: true });
            return SyncService.syncInFlight;
        }

        let step = 'init';
        let backend: SyncBackend = 'off';
        let syncUrl: string | undefined;
        let localSnapshotChangeAt = 0;

        SyncService.updateSyncStatus({
            inFlight: true,
            queued: false,
            step,
            lastResult: SyncService.syncStatus.lastResult,
            lastResultAt: SyncService.syncStatus.lastResultAt,
        });

        const setStep = (next: string) => {
            step = next;
            SyncService.updateSyncStatus({ step: next });
        };

        const runSync = async (): Promise<{ success: boolean; stats?: MergeStats; error?: string }> => {
            // 1. Flush pending writes so disk reflects the latest state
            setStep('flush');
            await flushPendingSave();
            localSnapshotChangeAt = useTaskStore.getState().lastDataChangeAt;

            // 2. Read/merge/write via shared core orchestration.
            backend = await SyncService.getSyncBackend();
            if (backend === 'off') {
                return { success: true };
            }
            const webdavConfig = backend === 'webdav' ? await SyncService.getWebDavConfig() : null;
            const cloudConfig = backend === 'cloud' ? await SyncService.getCloudConfig() : null;
            const syncPath = backend === 'file' ? await SyncService.getSyncPath() : '';
            const fileBaseDir = backend === 'file' ? getFileSyncDir(syncPath, SYNC_FILE_NAME, LEGACY_SYNC_FILE_NAME) : '';
            const ensureLocalSnapshotFresh = () => {
                if (useTaskStore.getState().lastDataChangeAt > localSnapshotChangeAt) {
                    SyncService.syncQueued = true;
                    SyncService.updateSyncStatus({ queued: true });
                    throw new LocalSyncAbort();
                }
            };

            // Pre-sync local attachments so cloudKeys exist before writing remote data.
            if (isTauriRuntime() && (backend === 'webdav' || backend === 'file' || backend === 'cloud')) {
                setStep('attachments_prepare');
                try {
                    const localData = await readLocalDataForSync();
                    let preMutated = false;
                    if (backend === 'webdav' && webdavConfig?.url) {
                        const baseUrl = getBaseSyncUrl(webdavConfig.url);
                        preMutated = await syncAttachments(localData, webdavConfig, baseUrl);
                    } else if (backend === 'file' && fileBaseDir) {
                        preMutated = await syncFileAttachments(localData, fileBaseDir);
                    } else if (backend === 'cloud' && cloudConfig?.url) {
                        const baseUrl = getCloudBaseUrl(cloudConfig.url);
                        preMutated = await syncCloudAttachments(localData, cloudConfig, baseUrl);
                    }
                    if (preMutated) {
                        ensureLocalSnapshotFresh();
                        await tauriInvoke('save_data', { data: localData });
                    }
                } catch (error) {
                    if (error instanceof LocalSyncAbort) {
                        throw error;
                    }
                    logSyncWarning('Attachment pre-sync warning', error);
                }
            }
            const syncResult = await performSyncCycle({
                readLocal: async () => {
                    const baseData = await readLocalDataForSync();
                    const data = await injectExternalCalendars(baseData);
                    localSnapshotChangeAt = useTaskStore.getState().lastDataChangeAt;
                    return data;
                },
                readRemote: async () => {
                    if (backend === 'webdav') {
                        if (isTauriRuntime()) {
                            if (!webdavConfig?.url) {
                                throw new Error('WebDAV URL not configured');
                            }
                            syncUrl = webdavConfig.url;
                            return await tauriInvoke<AppData>('webdav_get_json');
                        }
                        if (!webdavConfig?.url) {
                            throw new Error('WebDAV URL not configured');
                        }
                        const normalizedUrl = normalizeWebdavUrl(webdavConfig.url);
                        syncUrl = normalizedUrl;
                        const fetcher = await getTauriFetch();
                        return await webdavGetJson<AppData>(normalizedUrl, {
                            username: webdavConfig.username,
                            password: webdavConfig.password || '',
                            fetcher,
                        });
                    }
                    if (backend === 'cloud') {
                        if (!cloudConfig?.url) {
                            throw new Error('Self-hosted URL not configured');
                        }
                        const normalizedUrl = normalizeCloudUrl(cloudConfig.url);
                        syncUrl = normalizedUrl;
                        const fetcher = await getTauriFetch();
                        return await cloudGetJson<AppData>(normalizedUrl, { token: cloudConfig.token, fetcher });
                    }
                    if (!isTauriRuntime()) {
                        throw new Error('File sync is not available in the web app.');
                    }
                    return await tauriInvoke<AppData>('read_sync_file');
                },
                writeLocal: async (data) => {
                    ensureLocalSnapshotFresh();
                    if (isTauriRuntime()) {
                        await tauriInvoke('save_data', { data });
                    } else {
                        await webStorage.saveData(data);
                    }
                },
                writeRemote: async (data) => {
                    ensureLocalSnapshotFresh();
                    const sanitized = sanitizeAppDataForRemote(data);
                    if (backend === 'webdav') {
                        if (isTauriRuntime()) {
                            await tauriInvoke('webdav_put_json', { data: sanitized });
                            return;
                        }
                        const { url, username, password } = await SyncService.getWebDavConfig();
                        const normalizedUrl = normalizeWebdavUrl(url);
                        const fetcher = await getTauriFetch();
                        await webdavPutJson(normalizedUrl, sanitized, { username, password: password || '', fetcher });
                        return;
                    }
                    if (backend === 'cloud') {
                        const { url, token } = await SyncService.getCloudConfig();
                        const normalizedUrl = normalizeCloudUrl(url);
                        const fetcher = await getTauriFetch();
                        await cloudPutJson(normalizedUrl, sanitized, { token, fetcher });
                        return;
                    }
                    await SyncService.markSyncWrite(sanitized);
                    await tauriInvoke('write_sync_file', { data: sanitized });
                },
                onStep: (next) => {
                    setStep(next);
                },
            });
            const stats = syncResult.stats;
            let mergedData = syncResult.data;
            await persistExternalCalendars(mergedData);
            const conflictCount = (stats.tasks.conflicts || 0)
                + (stats.projects.conflicts || 0)
                + (stats.sections.conflicts || 0)
                + (stats.areas.conflicts || 0);
            const maxClockSkewMs = Math.max(
                stats.tasks.maxClockSkewMs || 0,
                stats.projects.maxClockSkewMs || 0,
                stats.sections.maxClockSkewMs || 0,
                stats.areas.maxClockSkewMs || 0
            );
            const timestampAdjustments = (stats.tasks.timestampAdjustments || 0)
                + (stats.projects.timestampAdjustments || 0)
                + (stats.sections.timestampAdjustments || 0)
                + (stats.areas.timestampAdjustments || 0);
            if (isTauriRuntime() && (conflictCount > 0 || maxClockSkewMs > CLOCK_SKEW_THRESHOLD_MS || timestampAdjustments > 0)) {
                const conflictSamples = [
                    ...(stats.tasks.conflictIds || []),
                    ...(stats.projects.conflictIds || []),
                    ...(stats.sections.conflictIds || []),
                    ...(stats.areas.conflictIds || []),
                ].slice(0, 6);
                void logInfo(
                    `Sync merge summary: ${conflictCount} conflicts, max skew ${Math.round(maxClockSkewMs)}ms, ${timestampAdjustments} timestamp fixes.`,
                    {
                        scope: 'sync',
                        extra: {
                            conflicts: String(conflictCount),
                            maxClockSkewMs: String(Math.round(maxClockSkewMs)),
                            timestampFixes: String(timestampAdjustments),
                            conflictSamples: conflictSamples.join(','),
                        },
                    }
                );
            }

            ensureLocalSnapshotFresh();

            if ((backend === 'webdav' || backend === 'file' || backend === 'cloud') && isTauriRuntime()) {
                setStep('attachments');
                try {
                    ensureLocalSnapshotFresh();
                    if (backend === 'webdav') {
                        const config = await SyncService.getWebDavConfig();
                        const baseUrl = config.url ? getBaseSyncUrl(config.url) : '';
                        if (baseUrl) {
                            const candidateData = cloneAppData(mergedData);
                            const mutated = await syncAttachments(candidateData, config, baseUrl);
                            if (mutated) {
                                mergedData = candidateData;
                                await tauriInvoke('save_data', { data: mergedData });
                            }
                        }
                    } else if (backend === 'file') {
                        if (fileBaseDir) {
                            const candidateData = cloneAppData(mergedData);
                            const mutated = await syncFileAttachments(candidateData, fileBaseDir);
                            if (mutated) {
                                mergedData = candidateData;
                                await tauriInvoke('save_data', { data: mergedData });
                            }
                        }
                    } else if (backend === 'cloud') {
                        const config = cloudConfig ?? await SyncService.getCloudConfig();
                        const baseUrl = config.url ? getCloudBaseUrl(config.url) : '';
                        if (baseUrl) {
                            const candidateData = cloneAppData(mergedData);
                            const mutated = await syncCloudAttachments(candidateData, config, baseUrl);
                            if (mutated) {
                                mergedData = candidateData;
                                await tauriInvoke('save_data', { data: mergedData });
                            }
                        }
                    }
                } catch (error) {
                    if (error instanceof LocalSyncAbort) {
                        throw error;
                    }
                    logSyncWarning('Attachment sync warning', error);
                }
            }

            await cleanupAttachmentTempFiles();

            if (isTauriRuntime() && shouldRunAttachmentCleanup(mergedData.settings.attachments?.lastCleanupAt)) {
                setStep('attachments_cleanup');
                ensureLocalSnapshotFresh();
                mergedData = await cleanupOrphanedAttachments(mergedData, backend);
                await tauriInvoke('save_data', { data: mergedData });
            }

            // 7. Refresh UI Store
            setStep('refresh');
            ensureLocalSnapshotFresh();
            await useTaskStore.getState().fetchData({ silent: true });

            const syncStatus = syncResult.status;
            const now = new Date().toISOString();
            try {
                await useTaskStore.getState().updateSettings({
                    lastSyncAt: now,
                    lastSyncStatus: syncStatus,
                    lastSyncError: undefined,
                });
            } catch (error) {
                logSyncWarning('Failed to persist sync status', error);
            }

            useTaskStore.getState().setError(null);
            return { success: true, stats };
        };

        const resultPromise = runSync().catch(async (error) => {
            if (error instanceof LocalSyncAbort) {
                return { success: true };
            }
            logSyncWarning('Sync failed', error);
            const now = new Date().toISOString();
            const logPath = await logSyncError(error, {
                backend,
                step,
                url: syncUrl,
            });
            const logHint = logPath ? ` (log: ${logPath})` : '';
            const safeMessage = sanitizeLogMessage(String(error));
            const nextHistory = appendSyncHistory(useTaskStore.getState().settings, {
                at: now,
                status: 'error',
                conflicts: 0,
                conflictIds: [],
                maxClockSkewMs: 0,
                timestampAdjustments: 0,
                error: `${safeMessage}${logHint}`,
            });
            useTaskStore.getState().setError(`${safeMessage}${logHint}`);
            try {
                await useTaskStore.getState().fetchData({ silent: true });
                await useTaskStore.getState().updateSettings({
                    lastSyncAt: now,
                    lastSyncStatus: 'error',
                    lastSyncError: `${safeMessage}${logHint}`,
                    lastSyncHistory: nextHistory,
                });
            } catch (e) {
                logSyncWarning('Failed to persist sync error', e);
            }
            return { success: false, error: `${safeMessage}${logHint}` };
        });

        SyncService.syncInFlight = resultPromise;
        const result = await resultPromise;
        SyncService.syncInFlight = null;
        SyncService.updateSyncStatus({
            inFlight: false,
            step: null,
            queued: SyncService.syncQueued,
            lastResult: result.success ? 'success' : 'error',
            lastResultAt: new Date().toISOString(),
        });

        if (SyncService.syncQueued) {
            SyncService.syncQueued = false;
            void SyncService.performSync()
                .then((queuedResult) => {
                    if (!queuedResult.success) {
                        logSyncWarning('Queued sync failed', queuedResult.error);
                    }
                })
                .catch((error) => {
                    logSyncWarning('Queued sync crashed', error);
                });
        }

        return result;
    }
}
