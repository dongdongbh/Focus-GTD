
import {
    AppData,
    Attachment,
    useTaskStore,
    MergeStats,
    computeSha256Hex,
    globalProgressTracker,
    findOrphanedAttachments,
    removeOrphanedAttachmentsFromData,
    validateAttachmentForUpload,
    webdavGetJson,
    webdavPutJson,
    webdavGetFile,
    webdavPutFile,
    webdavMakeDirectory,
    cloudGetFile,
    cloudPutFile,
    cloudGetJson,
    cloudPutJson,
    flushPendingSave,
    performSyncCycle,
    normalizeAppData,
    withRetry,
} from '@mindwtr/core';
import { isTauriRuntime } from './runtime';
import { logSyncError, sanitizeLogMessage } from './app-log';
import { webStorage } from './storage-adapter-web';

type SyncBackend = 'file' | 'webdav' | 'cloud';

const SYNC_BACKEND_KEY = 'mindwtr-sync-backend';
const WEBDAV_URL_KEY = 'mindwtr-webdav-url';
const WEBDAV_USERNAME_KEY = 'mindwtr-webdav-username';
const WEBDAV_PASSWORD_KEY = 'mindwtr-webdav-password';
const CLOUD_URL_KEY = 'mindwtr-cloud-url';
const CLOUD_TOKEN_KEY = 'mindwtr-cloud-token';
const SYNC_FILE_NAME = 'data.json';
const LEGACY_SYNC_FILE_NAME = 'mindwtr-sync.json';

const toStableJson = (value: unknown): string => {
    const normalize = (input: any): any => {
        if (Array.isArray(input)) {
            return input.map(normalize);
        }
        if (input && typeof input === 'object') {
            const entries = Object.keys(input)
                .sort()
                .map((key) => [key, normalize(input[key])]);
            const result: Record<string, any> = {};
            for (const [key, val] of entries) {
                result[key] = val;
            }
            return result;
        }
        return input;
    };
    return JSON.stringify(normalize(value));
};

const hashString = (value: string): string => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = Math.imul(31, hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(16);
};

const normalizePath = (input: string) => input.replace(/\\/g, '/').toLowerCase();

const isSyncFilePath = (path: string) => {
    const normalized = normalizePath(path);
    return normalized.endsWith(`/${SYNC_FILE_NAME}`) || normalized.endsWith(`/${LEGACY_SYNC_FILE_NAME}`);
};

const ATTACHMENTS_DIR_NAME = 'attachments';
const FILE_BACKEND_VALIDATION_CONFIG = {
    maxFileSizeBytes: Number.POSITIVE_INFINITY,
    blockedMimeTypes: [],
};
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const stripFileScheme = (uri: string): string => {
    if (!/^file:\/\//i.test(uri)) return uri;
    try {
        const parsed = new URL(uri);
        let path = decodeURIComponent(parsed.pathname);
        if (/^\/[A-Za-z]:\//.test(path)) {
            path = path.slice(1);
        }
        return path;
    } catch {
        return uri.replace(/^file:\/\//i, '');
    }
};

const extractExtension = (value?: string): string => {
    if (!value) return '';
    const stripped = value.split('?')[0].split('#')[0];
    const leaf = stripped.split(/[\\/]/).pop() || '';
    const match = leaf.match(/\.[A-Za-z0-9]{1,8}$/);
    return match ? match[0].toLowerCase() : '';
};

const buildCloudKey = (attachment: Attachment): string => {
    const ext = extractExtension(attachment.title) || extractExtension(attachment.uri);
    return `${ATTACHMENTS_DIR_NAME}/${attachment.id}${ext}`;
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
        console.warn(`Failed to delete attachment file ${attachment.title}`, error);
    }
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

const getFileSyncDir = (syncPath: string): string => {
    if (!syncPath) return '';
    const trimmed = syncPath.replace(/[\\\/]+$/, '');
    if (isSyncFilePath(trimmed)) {
        const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        return lastSlash > -1 ? trimmed.slice(0, lastSlash) : '';
    }
    return trimmed;
};

const sanitizeAppDataForRemote = (data: AppData): AppData => {
    const sanitizeAttachments = (attachments?: Attachment[]): Attachment[] | undefined => {
        if (!attachments) return attachments;
        return attachments.map((attachment) => {
            if (attachment.kind !== 'file') return attachment;
            return {
                ...attachment,
                uri: '',
                localStatus: undefined,
            };
        });
    };

    return {
        ...data,
        tasks: data.tasks.map((task) => ({
            ...task,
            attachments: sanitizeAttachments(task.attachments),
        })),
        projects: data.projects.map((project) => ({
            ...project,
            attachments: sanitizeAttachments(project.attachments),
        })),
    };
};

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke<T>(command as any, args as any);
}

type WebDavConfig = { url: string; username: string; password?: string; hasPassword?: boolean };
type CloudConfig = { url: string; token: string };

function normalizeSyncBackend(raw: string | null): SyncBackend {
    return raw === 'webdav' || raw === 'cloud' ? raw : 'file';
}

async function getTauriFetch(): Promise<typeof fetch | undefined> {
    if (!isTauriRuntime()) return undefined;
    try {
        const mod = await import('@tauri-apps/plugin-http');
        return mod.fetch;
    } catch (error) {
        console.warn('Failed to load tauri http fetch', error);
        return undefined;
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
    const { BaseDirectory, exists, mkdir, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const { dataDir, join } = await import('@tauri-apps/api/path');

    const attachmentsDirUrl = `${baseSyncUrl}/${ATTACHMENTS_DIR_NAME}`;
    try {
        await webdavMakeDirectory(attachmentsDirUrl, {
            username: webDavConfig.username,
            password: webDavConfig.password || '',
            fetcher,
        });
    } catch (error) {
        console.warn('Failed to ensure WebDAV attachments directory', error);
    }

    try {
        await mkdir(ATTACHMENTS_DIR_NAME, { baseDir: BaseDirectory.Data, recursive: true });
    } catch (error) {
        console.warn('Failed to ensure local attachments directory', error);
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
            console.warn('Failed to check attachment file', error);
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
                    console.warn(`Attachment validation failed (${validation.error}) for ${attachment.title}`);
                    continue;
                }
                reportProgress(attachment.id, 'upload', 0, fileData.length, 'active');
                await webdavPutFile(
                    `${baseSyncUrl}/${cloudKey}`,
                    fileData,
                    attachment.mimeType || 'application/octet-stream',
                    {
                        username: webDavConfig.username,
                        password: webDavConfig.password || '',
                        fetcher,
                        onProgress: (loaded, total) => reportProgress(attachment.id, 'upload', loaded, total, 'active'),
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
                console.warn(`Failed to upload attachment ${attachment.title}`, error);
            }
        }

        if (attachment.cloudKey && !existsLocally) {
            if (attachment.localStatus !== 'downloading') {
                attachment.localStatus = 'downloading';
                didMutate = true;
            }
            try {
                const downloadUrl = `${baseSyncUrl}/${attachment.cloudKey}`;
                const fileData = await withRetry(() =>
                    webdavGetFile(downloadUrl, {
                        username: webDavConfig.username,
                        password: webDavConfig.password || '',
                        fetcher,
                        onProgress: (loaded, total) => reportProgress(attachment.id, 'download', loaded, total, 'active'),
                    })
                );
                const bytes = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : new Uint8Array(fileData as ArrayBuffer);
                await validateAttachmentHash(attachment, bytes);
                const filename = attachment.cloudKey.split('/').pop() || `${attachment.id}${extractExtension(attachment.uri)}`;
                const relativePath = `${ATTACHMENTS_DIR_NAME}/${filename}`;
                await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Data });
                const absolutePath = await join(baseDataDir, relativePath);
                attachment.uri = absolutePath;
                attachment.localStatus = 'available';
                didMutate = true;
                reportProgress(attachment.id, 'download', bytes.length, bytes.length, 'completed');
            } catch (error) {
                attachment.localStatus = 'missing';
                didMutate = true;
                reportProgress(
                    attachment.id,
                    'download',
                    0,
                    attachment.size ?? 0,
                    'failed',
                    error instanceof Error ? error.message : String(error)
                );
                console.warn(`Failed to download attachment ${attachment.title}`, error);
            }
        }
    }

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
    const { BaseDirectory, exists, mkdir, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const { dataDir, join } = await import('@tauri-apps/api/path');

    try {
        await mkdir(ATTACHMENTS_DIR_NAME, { baseDir: BaseDirectory.Data, recursive: true });
    } catch (error) {
        console.warn('Failed to ensure local attachments directory', error);
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
            console.warn('Failed to check attachment file', error);
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
                    console.warn(`Attachment validation failed (${validation.error}) for ${attachment.title}`);
                    continue;
                }
                reportProgress(attachment.id, 'upload', 0, fileData.length, 'active');
                await cloudPutFile(
                    `${baseSyncUrl}/${cloudKey}`,
                    fileData,
                    attachment.mimeType || 'application/octet-stream',
                    {
                        token: cloudConfig.token,
                        fetcher,
                        onProgress: (loaded, total) => reportProgress(attachment.id, 'upload', loaded, total, 'active'),
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
                console.warn(`Failed to upload attachment ${attachment.title}`, error);
            }
        }

        if (attachment.cloudKey && !existsLocally) {
            if (attachment.localStatus !== 'downloading') {
                attachment.localStatus = 'downloading';
                didMutate = true;
            }
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
                const relativePath = `${ATTACHMENTS_DIR_NAME}/${filename}`;
                await writeFile(relativePath, bytes, { baseDir: BaseDirectory.Data });
                const absolutePath = await join(baseDataDir, relativePath);
                attachment.uri = absolutePath;
                attachment.localStatus = 'available';
                didMutate = true;
                reportProgress(attachment.id, 'download', bytes.length, bytes.length, 'completed');
            } catch (error) {
                attachment.localStatus = 'missing';
                didMutate = true;
                reportProgress(
                    attachment.id,
                    'download',
                    0,
                    attachment.size ?? 0,
                    'failed',
                    error instanceof Error ? error.message : String(error)
                );
                console.warn(`Failed to download attachment ${attachment.title}`, error);
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

    const { BaseDirectory, exists, mkdir, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const { dataDir, join } = await import('@tauri-apps/api/path');

    const attachmentsDir = await join(baseSyncDir, ATTACHMENTS_DIR_NAME);
    try {
        await mkdir(attachmentsDir, { recursive: true });
    } catch (error) {
        console.warn('Failed to ensure sync attachments directory', error);
    }

    try {
        await mkdir(ATTACHMENTS_DIR_NAME, { baseDir: BaseDirectory.Data, recursive: true });
    } catch (error) {
        console.warn('Failed to ensure local attachments directory', error);
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
            console.warn('Failed to check attachment file', error);
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
                    console.warn(`Attachment validation failed (${validation.error}) for ${attachment.title}`);
                    continue;
                }
                const targetPath = await join(baseSyncDir, cloudKey);
                await writeFile(targetPath, fileData);
                attachment.cloudKey = cloudKey;
                attachment.localStatus = 'available';
                didMutate = true;
            } catch (error) {
                console.warn(`Failed to copy attachment ${attachment.title} to sync folder`, error);
            }
        }

        if (attachment.cloudKey && !existsLocally) {
            if (attachment.localStatus !== 'downloading') {
                attachment.localStatus = 'downloading';
                didMutate = true;
            }
            try {
                const sourcePath = await join(baseSyncDir, attachment.cloudKey);
                const hasRemote = await exists(sourcePath);
                if (!hasRemote) continue;
                const fileData = await readFile(sourcePath);
                await validateAttachmentHash(attachment, fileData);
                const filename = attachment.cloudKey.split('/').pop() || `${attachment.id}${extractExtension(attachment.uri)}`;
                const relativePath = `${ATTACHMENTS_DIR_NAME}/${filename}`;
                await writeFile(relativePath, fileData, { baseDir: BaseDirectory.Data });
                const absolutePath = await join(baseDataDir, relativePath);
                attachment.uri = absolutePath;
                attachment.localStatus = 'available';
                didMutate = true;
            } catch (error) {
                attachment.localStatus = 'missing';
                didMutate = true;
                console.warn(`Failed to copy attachment ${attachment.title} from sync folder`, error);
            }
        }
    }

    return didMutate;
}

export class SyncService {
    private static didMigrate = false;
    private static syncInFlight: Promise<{ success: boolean; stats?: MergeStats; error?: string }> | null = null;
    private static syncQueued = false;
    private static fileWatcherStop: (() => void) | null = null;
    private static fileWatcherPath: string | null = null;
    private static fileWatcherBackend: SyncBackend | null = null;
    private static lastWrittenHash: string | null = null;
    private static lastObservedHash: string | null = null;
    private static ignoreFileEventsUntil = 0;
    private static externalSyncTimer: ReturnType<typeof setTimeout> | null = null;

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
        return {
            url: localStorage.getItem(CLOUD_URL_KEY) || '',
            token: '',
        };
    }

    private static setCloudConfigLocal(config: { url: string; token?: string }) {
        localStorage.setItem(CLOUD_URL_KEY, config.url);
        sessionStorage.removeItem(CLOUD_TOKEN_KEY);
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
            console.error('Failed to migrate legacy sync config:', error);
        }
    }

    static async getSyncBackend(): Promise<SyncBackend> {
        if (!isTauriRuntime()) return SyncService.getSyncBackendLocal();
        await SyncService.maybeMigrateLegacyLocalStorageToConfig();
        try {
            const backend = await tauriInvoke<string>('get_sync_backend');
            return normalizeSyncBackend(backend);
        } catch (error) {
            console.error('Failed to get sync backend:', error);
            return 'file';
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
            console.error('Failed to set sync backend:', error);
        }
    }

    static async getWebDavConfig(): Promise<WebDavConfig> {
        if (!isTauriRuntime()) return SyncService.getWebDavConfigLocal();
        await SyncService.maybeMigrateLegacyLocalStorageToConfig();
        try {
            return await tauriInvoke<WebDavConfig>('get_webdav_config');
        } catch (error) {
            console.error('Failed to get WebDAV config:', error);
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
            console.error('Failed to set WebDAV config:', error);
        }
    }

    static async getCloudConfig(): Promise<CloudConfig> {
        if (!isTauriRuntime()) return SyncService.getCloudConfigLocal();
        await SyncService.maybeMigrateLegacyLocalStorageToConfig();
        try {
            return await tauriInvoke<CloudConfig>('get_cloud_config');
        } catch (error) {
            console.error('Failed to get Self-Hosted config:', error);
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
            console.error('Failed to set Self-Hosted config:', error);
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
            console.error('Failed to get sync path:', error);
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
            console.error('Failed to set sync path:', error);
            return { success: false, path: '' };
        }
    }

    private static markSyncWrite(data: AppData) {
        const hash = hashString(toStableJson(data));
        SyncService.lastWrittenHash = hash;
        SyncService.ignoreFileEventsUntil = Date.now() + 2000;
    }

    private static async handleFileChange(paths: string[]) {
        if (!isTauriRuntime()) return;
        if (Date.now() < SyncService.ignoreFileEventsUntil) return;

        const hasSyncFile = paths.some(isSyncFilePath);
        if (!hasSyncFile) return;

        try {
            const syncData = await tauriInvoke<AppData>('read_sync_file');
            const normalized = normalizeAppData(syncData);
            const hash = hashString(toStableJson(normalized));
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
                SyncService.performSync().catch(console.error);
            }, 750);
        } catch (error) {
            console.warn('Failed to process external sync change', error);
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
            console.warn('Failed to start sync file watcher', error);
        }
    }

    static async stopFileWatcher(): Promise<void> {
        if (SyncService.fileWatcherStop) {
            try {
                SyncService.fileWatcherStop();
            } catch (error) {
                console.warn('Failed to stop sync watcher', error);
            }
        }
        SyncService.fileWatcherStop = null;
        SyncService.fileWatcherPath = null;
        SyncService.fileWatcherBackend = null;
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
            return SyncService.syncInFlight;
        }

        let step = 'init';
        let backend: SyncBackend = 'file';
        let syncUrl: string | undefined;

        const runSync = async (): Promise<{ success: boolean; stats?: MergeStats; error?: string }> => {
            // 1. Flush pending writes so disk reflects the latest state
            step = 'flush';
            await flushPendingSave();

            // 2. Read/merge/write via shared core orchestration.
            backend = await SyncService.getSyncBackend();
            const syncResult = await performSyncCycle({
                readLocal: async () => (
                    isTauriRuntime()
                        ? await tauriInvoke<AppData>('get_data')
                        : await webStorage.getData()
                ),
                readRemote: async () => {
                    if (backend === 'webdav') {
                        if (isTauriRuntime()) {
                            const { url } = await SyncService.getWebDavConfig();
                            if (!url) {
                                throw new Error('WebDAV URL not configured');
                            }
                            syncUrl = url;
                            return await tauriInvoke<AppData>('webdav_get_json');
                        }
                        const { url, username, password } = await SyncService.getWebDavConfig();
                        if (!url) {
                            throw new Error('WebDAV URL not configured');
                        }
                        syncUrl = url;
                        const fetcher = await getTauriFetch();
                        return await webdavGetJson<AppData>(url, { username, password: password || '', fetcher });
                    }
                    if (backend === 'cloud') {
                        const { url, token } = await SyncService.getCloudConfig();
                        if (!url) {
                            throw new Error('Self-hosted URL not configured');
                        }
                        syncUrl = url;
                        const fetcher = await getTauriFetch();
                        return await cloudGetJson<AppData>(url, { token, fetcher });
                    }
                    if (!isTauriRuntime()) {
                        throw new Error('File sync is not available in the web app.');
                    }
                    return await tauriInvoke<AppData>('read_sync_file');
                },
                writeLocal: async (data) => {
                    if (isTauriRuntime()) {
                        await tauriInvoke('save_data', { data });
                    } else {
                        await webStorage.saveData(data);
                    }
                },
                writeRemote: async (data) => {
                    const sanitized = sanitizeAppDataForRemote(data);
                    if (backend === 'webdav') {
                        if (isTauriRuntime()) {
                            await tauriInvoke('webdav_put_json', { data: sanitized });
                            return;
                        }
                        const { url, username, password } = await SyncService.getWebDavConfig();
                        const fetcher = await getTauriFetch();
                        await webdavPutJson(url, sanitized, { username, password: password || '', fetcher });
                        return;
                    }
                    if (backend === 'cloud') {
                        const { url, token } = await SyncService.getCloudConfig();
                        const fetcher = await getTauriFetch();
                        await cloudPutJson(url, sanitized, { token, fetcher });
                        return;
                    }
                    SyncService.markSyncWrite(sanitized);
                    await tauriInvoke('write_sync_file', { data: sanitized });
                },
                onStep: (next) => {
                    step = next;
                },
            });
            const stats = syncResult.stats;
            let mergedData = syncResult.data;

            if ((backend === 'webdav' || backend === 'file' || backend === 'cloud') && isTauriRuntime()) {
                step = 'attachments';
                try {
                    if (backend === 'webdav') {
                        const config = await SyncService.getWebDavConfig();
                        const baseUrl = config.url ? getBaseSyncUrl(config.url) : '';
                        if (baseUrl) {
                            const mutated = await syncAttachments(mergedData, config, baseUrl);
                            if (mutated) {
                                await tauriInvoke('save_data', { data: mergedData });
                            }
                        }
                    } else if (backend === 'file') {
                        const syncPath = await SyncService.getSyncPath();
                        const baseDir = getFileSyncDir(syncPath);
                        if (baseDir) {
                            const mutated = await syncFileAttachments(mergedData, baseDir);
                            if (mutated) {
                                await tauriInvoke('save_data', { data: mergedData });
                            }
                        }
                    } else if (backend === 'cloud') {
                        const config = await SyncService.getCloudConfig();
                        const baseUrl = config.url ? getCloudBaseUrl(config.url) : '';
                        if (baseUrl) {
                            const mutated = await syncCloudAttachments(mergedData, config, baseUrl);
                            if (mutated) {
                                await tauriInvoke('save_data', { data: mergedData });
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Attachment sync warning', error);
                }
            }

            if (isTauriRuntime() && shouldRunAttachmentCleanup(mergedData.settings.attachments?.lastCleanupAt)) {
                step = 'attachments_cleanup';
                const orphaned = findOrphanedAttachments(mergedData);
                if (orphaned.length > 0) {
                    for (const attachment of orphaned) {
                        await deleteAttachmentFile(attachment);
                    }
                    mergedData = removeOrphanedAttachmentsFromData(mergedData);
                }
                mergedData.settings.attachments = {
                    ...mergedData.settings.attachments,
                    lastCleanupAt: new Date().toISOString(),
                };
                await tauriInvoke('save_data', { data: mergedData });
            }

            // 7. Refresh UI Store
            step = 'refresh';
            await useTaskStore.getState().fetchData();

            return { success: true, stats };
        };

        const resultPromise = runSync().catch(async (error) => {
            console.error('Sync failed', error);
            const now = new Date().toISOString();
            const logPath = await logSyncError(error, {
                backend,
                step,
                url: syncUrl,
            });
            const logHint = logPath ? ` (log: ${logPath})` : '';
            const safeMessage = sanitizeLogMessage(String(error));
            try {
                await useTaskStore.getState().fetchData();
                await useTaskStore.getState().updateSettings({
                    lastSyncAt: now,
                    lastSyncStatus: 'error',
                    lastSyncError: `${safeMessage}${logHint}`,
                });
            } catch (e) {
                console.error('Failed to persist sync error', e);
            }
            return { success: false, error: `${safeMessage}${logHint}` };
        });

        SyncService.syncInFlight = resultPromise;
        const result = await resultPromise;
        SyncService.syncInFlight = null;

        if (SyncService.syncQueued) {
            SyncService.syncQueued = false;
            void SyncService.performSync();
        }

        return result;
    }
}
