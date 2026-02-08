import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, MergeStats, useTaskStore, webdavGetJson, webdavPutJson, cloudGetJson, cloudPutJson, flushPendingSave, performSyncCycle, findOrphanedAttachments, removeOrphanedAttachmentsFromData, webdavDeleteFile, cloudDeleteFile, CLOCK_SKEW_THRESHOLD_MS, appendSyncHistory, withRetry, normalizeWebdavUrl, normalizeCloudUrl, sanitizeAppDataForRemote, injectExternalCalendars as injectExternalCalendarsForSync, persistExternalCalendars as persistExternalCalendarsForSync, mergeAppData } from '@mindwtr/core';
import { mobileStorage } from './storage-adapter';
import { logInfo, logSyncError, logWarn, sanitizeLogMessage } from './app-log';
import { readSyncFile, writeSyncFile } from './storage-file';
import { getBaseSyncUrl, getCloudBaseUrl, syncCloudAttachments, syncFileAttachments, syncWebdavAttachments, cleanupAttachmentTempFiles } from './attachment-sync';
import { getExternalCalendars, saveExternalCalendars } from './external-calendar';
import * as FileSystem from 'expo-file-system/legacy';
import {
  SYNC_PATH_KEY,
  SYNC_BACKEND_KEY,
  WEBDAV_URL_KEY,
  WEBDAV_USERNAME_KEY,
  WEBDAV_PASSWORD_KEY,
  CLOUD_URL_KEY,
  CLOUD_TOKEN_KEY,
} from './sync-constants';

const DEFAULT_SYNC_TIMEOUT_MS = 30_000;
const WEBDAV_RETRY_OPTIONS = { maxAttempts: 5, baseDelayMs: 2000, maxDelayMs: 30_000 };
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SYNC_FILE_NAME = 'data.json';
const LEGACY_SYNC_FILE_NAME = 'mindwtr-sync.json';

const logSyncWarning = (message: string, error?: unknown) => {
  const extra = error ? { error: sanitizeLogMessage(error instanceof Error ? error.message : String(error)) } : undefined;
  void logWarn(message, { scope: 'sync', extra });
};

const logSyncInfo = (message: string, extra?: Record<string, string>) => {
  void logInfo(message, { scope: 'sync', extra });
};

const formatSyncErrorMessage = (error: unknown, backend: SyncBackend): string => {
  const raw = sanitizeLogMessage(String(error));
  if (backend !== 'webdav') return raw;

  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  const unauthorized = status === 401 || /\(401\)/.test(raw) || /\b401\b/.test(raw);
  if (unauthorized) {
    return 'WebDAV unauthorized (401). Check folder URL, username, and app password.';
  }
  if (raw.includes('WebDAV URL not configured')) {
    return 'WebDAV folder URL is not configured. Save WebDAV settings first.';
  }
  return raw;
};

const externalCalendarProvider = {
  load: () => getExternalCalendars(),
  save: (calendars: AppData['settings']['externalCalendars'] | undefined) =>
    saveExternalCalendars(calendars ?? []),
  onWarn: (message: string, error?: unknown) => logSyncWarning(message, error),
};

const injectExternalCalendars = async (data: AppData): Promise<AppData> =>
  injectExternalCalendarsForSync(data, externalCalendarProvider);

const persistExternalCalendars = async (data: AppData): Promise<void> =>
  persistExternalCalendarsForSync(data, externalCalendarProvider);

const cloneAppData = (data: AppData): AppData => JSON.parse(JSON.stringify(data)) as AppData;

const getInMemoryAppDataSnapshot = (): AppData => {
  const state = useTaskStore.getState();
  return cloneAppData({
    tasks: state._allTasks ?? state.tasks ?? [],
    projects: state._allProjects ?? state.projects ?? [],
    sections: state._allSections ?? state.sections ?? [],
    areas: state._allAreas ?? state.areas ?? [],
    settings: state.settings ?? {},
  });
};

const shouldRunAttachmentCleanup = (lastCleanupAt?: string): boolean => {
  if (!lastCleanupAt) return true;
  const parsed = Date.parse(lastCleanupAt);
  if (Number.isNaN(parsed)) return true;
  return Date.now() - parsed >= CLEANUP_INTERVAL_MS;
};

const deleteAttachmentFile = async (uri?: string): Promise<void> => {
  if (!uri) return;
  if (uri.startsWith('content://') || /^https?:\/\//i.test(uri)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    logSyncWarning('Failed to delete attachment file', error);
  }
};

const isSyncFilePath = (path: string) =>
  path.endsWith(`/${SYNC_FILE_NAME}`) || path.endsWith(`/${LEGACY_SYNC_FILE_NAME}`);

const getFileSyncBaseDir = (syncPath: string) => {
  const trimmed = syncPath.replace(/\/+$/, '');
  if (isSyncFilePath(trimmed)) {
    return trimmed.replace(/\/[^/]+$/, '');
  }
  return trimmed;
};

type SyncBackend = 'file' | 'webdav' | 'cloud' | 'off';

const resolveBackend = (value: string | null): SyncBackend => {
  switch (value) {
    case 'webdav':
    case 'cloud':
    case 'off':
    case 'file':
      return value;
    default:
      return 'file';
  }
};

let syncInFlight: Promise<{ success: boolean; stats?: MergeStats; error?: string }> | null = null;
let syncQueued = false;

export async function performMobileSync(syncPathOverride?: string): Promise<{ success: boolean; stats?: MergeStats; error?: string }> {
  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }
  syncInFlight = (async () => {
    const rawBackend = await AsyncStorage.getItem(SYNC_BACKEND_KEY);
    const backend: SyncBackend = resolveBackend(rawBackend);

    if (backend === 'off') {
      return { success: true };
    }

    logSyncInfo('Sync start', { backend });

    let step = 'init';
    let syncUrl: string | undefined;
    let wroteLocal = false;
    try {
      let webdavConfig: { url: string; username: string; password: string } | null = null;
      let cloudConfig: { url: string; token: string } | null = null;
      let fileSyncPath: string | null = null;
      let preSyncedLocalData: AppData | null = null;
      step = 'flush';
      await flushPendingSave();
      if (backend === 'file') {
        fileSyncPath = syncPathOverride || await AsyncStorage.getItem(SYNC_PATH_KEY);
        if (!fileSyncPath) {
          return { success: true };
        }
        if (!fileSyncPath.startsWith('content://') && !isSyncFilePath(fileSyncPath)) {
          const trimmed = fileSyncPath.replace(/\/+$/, '');
          fileSyncPath = `${trimmed}/${SYNC_FILE_NAME}`;
        }
      }
      if (backend === 'webdav') {
        const url = await AsyncStorage.getItem(WEBDAV_URL_KEY);
        if (!url) throw new Error('WebDAV URL not configured');
        syncUrl = normalizeWebdavUrl(url);
        const username = (await AsyncStorage.getItem(WEBDAV_USERNAME_KEY)) || '';
        const password = (await AsyncStorage.getItem(WEBDAV_PASSWORD_KEY)) || '';
        webdavConfig = { url: syncUrl, username, password };
      }
      if (backend === 'cloud') {
        const url = await AsyncStorage.getItem(CLOUD_URL_KEY);
        if (!url) throw new Error('Self-hosted URL not configured');
        syncUrl = normalizeCloudUrl(url);
        const token = (await AsyncStorage.getItem(CLOUD_TOKEN_KEY)) || '';
        cloudConfig = { url: syncUrl, token };
      }

      // Pre-sync local attachments so cloudKeys exist before writing remote data.
      step = 'attachments_prepare';
      logSyncInfo('Sync step', { step });
      try {
        const persistedData = await mobileStorage.getData();
        const localData = mergeAppData(persistedData, getInMemoryAppDataSnapshot());
        let preMutated = false;
        if (backend === 'webdav' && webdavConfig?.url) {
          const baseSyncUrl = getBaseSyncUrl(webdavConfig.url);
          preMutated = await syncWebdavAttachments(localData, webdavConfig, baseSyncUrl);
        } else if (backend === 'cloud' && cloudConfig?.url) {
          const baseSyncUrl = getCloudBaseUrl(cloudConfig.url);
          preMutated = await syncCloudAttachments(localData, cloudConfig, baseSyncUrl);
        } else if (backend === 'file' && fileSyncPath) {
          preMutated = await syncFileAttachments(localData, fileSyncPath);
        }
        if (preMutated) {
          // Keep pre-sync attachment mutations in memory until the main merge/write succeeds.
          preSyncedLocalData = localData;
        }
      } catch (error) {
        logSyncWarning('Attachment pre-sync warning', error);
      }
      const syncResult = await performSyncCycle({
        readLocal: async () => {
          const inMemorySnapshot = getInMemoryAppDataSnapshot();
          const baseData = preSyncedLocalData
            ? mergeAppData(preSyncedLocalData, inMemorySnapshot)
            : mergeAppData(await mobileStorage.getData(), inMemorySnapshot);
          return await injectExternalCalendars(baseData);
        },
        readRemote: async () => {
          if (backend === 'webdav' && webdavConfig?.url) {
            return await withRetry(
              () =>
                webdavGetJson<AppData>(webdavConfig.url, {
                  username: webdavConfig.username,
                  password: webdavConfig.password,
                  timeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
                }),
              WEBDAV_RETRY_OPTIONS
            );
          }
          if (backend === 'cloud' && cloudConfig?.url) {
            return await cloudGetJson<AppData>(cloudConfig.url, {
              token: cloudConfig.token,
              timeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
            });
          }
          if (!fileSyncPath) {
            throw new Error('No sync folder configured');
          }
          return await readSyncFile(fileSyncPath);
        },
        writeLocal: async (data) => {
          await mobileStorage.saveData(data);
          wroteLocal = true;
        },
        writeRemote: async (data) => {
          const sanitized = sanitizeAppDataForRemote(data);
          if (backend === 'webdav') {
            if (!webdavConfig?.url) throw new Error('WebDAV URL not configured');
            await withRetry(
              () =>
                webdavPutJson(webdavConfig.url, sanitized, {
                  username: webdavConfig.username,
                  password: webdavConfig.password,
                  timeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
                }),
              WEBDAV_RETRY_OPTIONS
            );
            return;
          }
          if (backend === 'cloud') {
            if (!cloudConfig?.url) throw new Error('Self-hosted URL not configured');
            await cloudPutJson(cloudConfig.url, sanitized, { token: cloudConfig.token, timeoutMs: DEFAULT_SYNC_TIMEOUT_MS });
            return;
          }
          if (!fileSyncPath) throw new Error('No sync folder configured');
          await writeSyncFile(fileSyncPath, sanitized);
        },
        onStep: (next) => {
          step = next;
          logSyncInfo('Sync step', { step });
        },
      });

      const stats = syncResult.stats;
      const conflictCount = (stats.tasks.conflicts || 0)
        + (stats.projects.conflicts || 0)
        + (stats.sections.conflicts || 0);
      const maxClockSkewMs = Math.max(
        stats.tasks.maxClockSkewMs || 0,
        stats.projects.maxClockSkewMs || 0,
        stats.sections.maxClockSkewMs || 0,
      );
      const timestampAdjustments = (stats.tasks.timestampAdjustments || 0)
        + (stats.projects.timestampAdjustments || 0)
        + (stats.sections.timestampAdjustments || 0);
      if (conflictCount > 0 || maxClockSkewMs > CLOCK_SKEW_THRESHOLD_MS || timestampAdjustments > 0) {
        const conflictSamples = [
          ...(stats.tasks.conflictIds || []),
          ...(stats.projects.conflictIds || []),
          ...(stats.sections.conflictIds || []),
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

      let mergedData = syncResult.data;
      await persistExternalCalendars(mergedData);

      const webdavConfigValue = webdavConfig as { url: string; username: string; password: string } | null;
      const cloudConfigValue = cloudConfig as { url: string; token: string } | null;

      if (backend === 'webdav' && webdavConfigValue?.url) {
        step = 'attachments';
        logSyncInfo('Sync step', { step });
        const baseSyncUrl = getBaseSyncUrl(webdavConfigValue.url);
        const candidateData = cloneAppData(mergedData);
        const mutated = await syncWebdavAttachments(candidateData, webdavConfigValue, baseSyncUrl);
        if (mutated) {
          mergedData = candidateData;
          await mobileStorage.saveData(mergedData);
          wroteLocal = true;
        }
      }

      if (backend === 'cloud' && cloudConfigValue?.url) {
        step = 'attachments';
        logSyncInfo('Sync step', { step });
        const baseSyncUrl = getCloudBaseUrl(cloudConfigValue.url);
        const candidateData = cloneAppData(mergedData);
        const mutated = await syncCloudAttachments(candidateData, cloudConfigValue, baseSyncUrl);
        if (mutated) {
          mergedData = candidateData;
          await mobileStorage.saveData(mergedData);
          wroteLocal = true;
        }
      }

      if (backend === 'file' && fileSyncPath) {
        step = 'attachments';
        logSyncInfo('Sync step', { step });
        const candidateData = cloneAppData(mergedData);
        const mutated = await syncFileAttachments(candidateData, fileSyncPath);
        if (mutated) {
          mergedData = candidateData;
          await mobileStorage.saveData(mergedData);
          wroteLocal = true;
        }
      }

      await cleanupAttachmentTempFiles();

      if (shouldRunAttachmentCleanup(mergedData.settings.attachments?.lastCleanupAt)) {
        step = 'attachments_cleanup';
        logSyncInfo('Sync step', { step });
        const orphaned = findOrphanedAttachments(mergedData);
        if (orphaned.length > 0) {
          const isFileBackend = backend === 'file';
          const isWebdavBackend = backend === 'webdav' && webdavConfigValue?.url;
          const isCloudBackend = backend === 'cloud' && cloudConfigValue?.url;
          const fileBaseDir = isFileBackend && fileSyncPath && !fileSyncPath.startsWith('content://')
            ? getFileSyncBaseDir(fileSyncPath)
            : null;

          for (const attachment of orphaned) {
            await deleteAttachmentFile(attachment.uri);
            if (attachment.cloudKey) {
              try {
                if (isWebdavBackend && webdavConfigValue) {
                  const baseSyncUrl = getBaseSyncUrl(webdavConfigValue.url);
                  await webdavDeleteFile(`${baseSyncUrl}/${attachment.cloudKey}`, {
                    username: webdavConfigValue.username,
                    password: webdavConfigValue.password,
                    timeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
                  });
                } else if (isCloudBackend && cloudConfigValue) {
                  const baseSyncUrl = getCloudBaseUrl(cloudConfigValue.url);
                  await cloudDeleteFile(`${baseSyncUrl}/${attachment.cloudKey}`, {
                    token: cloudConfigValue.token,
                    timeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
                  });
                } else if (fileBaseDir) {
                  const targetPath = `${fileBaseDir}/${attachment.cloudKey}`;
                  await FileSystem.deleteAsync(targetPath, { idempotent: true });
                }
              } catch (error) {
                logSyncWarning('Failed to delete remote attachment', error);
              }
            }
          }
          mergedData = removeOrphanedAttachmentsFromData(mergedData);
        }
        mergedData.settings.attachments = {
          ...mergedData.settings.attachments,
          lastCleanupAt: new Date().toISOString(),
        };
        await mobileStorage.saveData(mergedData);
        wroteLocal = true;
      }

      step = 'refresh';
      await useTaskStore.getState().fetchData();
      const now = new Date().toISOString();
      try {
        await useTaskStore.getState().updateSettings({
          lastSyncAt: now,
          lastSyncStatus: syncResult.status,
          lastSyncError: undefined,
        });
      } catch (error) {
        logSyncWarning('[Mobile] Failed to persist sync status', error);
      }
      return { success: true, stats: syncResult.stats };
    } catch (error) {
      const now = new Date().toISOString();
      const logPath = await logSyncError(error, { backend, step, url: syncUrl });
      const logHint = logPath ? ` (log: ${logPath})` : '';
      const safeMessage = formatSyncErrorMessage(error, backend);
      const nextHistory = appendSyncHistory(useTaskStore.getState().settings, {
        at: now,
        status: 'error',
        conflicts: 0,
        conflictIds: [],
        maxClockSkewMs: 0,
        timestampAdjustments: 0,
        error: `${safeMessage}${logHint}`,
      });
      try {
        if (wroteLocal) {
          await useTaskStore.getState().fetchData();
        }
        await useTaskStore.getState().updateSettings({
          lastSyncAt: now,
          lastSyncStatus: 'error',
          lastSyncError: `${safeMessage}${logHint}`,
          lastSyncHistory: nextHistory,
        });
      } catch (e) {
        logSyncWarning('[Mobile] Failed to persist sync error', e);
      }

      return { success: false, error: `${safeMessage}${logHint}` };
    }
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
    if (syncQueued) {
      syncQueued = false;
      void performMobileSync(syncPathOverride);
    }
  }
}
