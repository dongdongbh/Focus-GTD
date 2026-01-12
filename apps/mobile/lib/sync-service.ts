import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, MergeStats, useTaskStore, webdavGetJson, webdavPutJson, cloudGetJson, cloudPutJson, flushPendingSave, performSyncCycle, findOrphanedAttachments, removeOrphanedAttachmentsFromData } from '@mindwtr/core';
import { mobileStorage } from './storage-adapter';
import { logSyncError, sanitizeLogMessage } from './app-log';
import { readSyncFile, writeSyncFile } from './storage-file';
import { getBaseSyncUrl, getCloudBaseUrl, sanitizeAppDataForRemote, syncCloudAttachments, syncFileAttachments, syncWebdavAttachments } from './attachment-sync';
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
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
    console.warn('Failed to delete attachment file', error);
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
    const backend = rawBackend === 'webdav' || rawBackend === 'cloud' || rawBackend === 'off' ? rawBackend : 'file';

    if (backend === 'off') {
      return { success: true };
    }

    let step = 'init';
    let syncUrl: string | undefined;
    let wroteLocal = false;
    try {
      let webdavConfig: { url: string; username: string; password: string } | null = null;
      let cloudConfig: { url: string; token: string } | null = null;
      let fileSyncPath: string | null = null;
      step = 'flush';
      await flushPendingSave();
      if (backend === 'file') {
        fileSyncPath = syncPathOverride || await AsyncStorage.getItem(SYNC_PATH_KEY);
        if (!fileSyncPath) {
          return { success: true };
        }
      }
      const syncResult = await performSyncCycle({
        readLocal: async () => await mobileStorage.getData(),
        readRemote: async () => {
          if (backend === 'webdav') {
            const url = await AsyncStorage.getItem(WEBDAV_URL_KEY);
            if (!url) throw new Error('WebDAV URL not configured');
            syncUrl = url;
            const username = (await AsyncStorage.getItem(WEBDAV_USERNAME_KEY)) || '';
            const password = (await AsyncStorage.getItem(WEBDAV_PASSWORD_KEY)) || '';
            webdavConfig = { url, username, password };
            return await webdavGetJson<AppData>(url, { username, password, timeoutMs: DEFAULT_SYNC_TIMEOUT_MS });
          }
          if (backend === 'cloud') {
            const url = await AsyncStorage.getItem(CLOUD_URL_KEY);
            if (!url) throw new Error('Self-hosted URL not configured');
            syncUrl = url;
            const token = (await AsyncStorage.getItem(CLOUD_TOKEN_KEY)) || '';
            cloudConfig = { url, token };
            return await cloudGetJson<AppData>(url, { token, timeoutMs: DEFAULT_SYNC_TIMEOUT_MS });
          }
          if (!fileSyncPath) {
            throw new Error('No sync file configured');
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
            await webdavPutJson(webdavConfig.url, sanitized, { username: webdavConfig.username, password: webdavConfig.password, timeoutMs: DEFAULT_SYNC_TIMEOUT_MS });
            return;
          }
          if (backend === 'cloud') {
            if (!cloudConfig?.url) throw new Error('Self-hosted URL not configured');
            await cloudPutJson(cloudConfig.url, sanitized, { token: cloudConfig.token, timeoutMs: DEFAULT_SYNC_TIMEOUT_MS });
            return;
          }
          if (!fileSyncPath) throw new Error('No sync file configured');
          await writeSyncFile(fileSyncPath, sanitized);
        },
        onStep: (next) => {
          step = next;
        },
      });

      let mergedData = syncResult.data;

      if (backend === 'webdav' && webdavConfig?.url) {
        step = 'attachments';
        const baseSyncUrl = getBaseSyncUrl(webdavConfig.url);
        const mutated = await syncWebdavAttachments(mergedData, webdavConfig, baseSyncUrl);
        if (mutated) {
          await mobileStorage.saveData(mergedData);
          wroteLocal = true;
        }
      }

      if (backend === 'cloud' && cloudConfig?.url) {
        step = 'attachments';
        const baseSyncUrl = getCloudBaseUrl(cloudConfig.url);
        const mutated = await syncCloudAttachments(mergedData, cloudConfig, baseSyncUrl);
        if (mutated) {
          await mobileStorage.saveData(mergedData);
          wroteLocal = true;
        }
      }

      if (backend === 'file' && fileSyncPath) {
        step = 'attachments';
        const mutated = await syncFileAttachments(mergedData, fileSyncPath);
        if (mutated) {
          await mobileStorage.saveData(mergedData);
          wroteLocal = true;
        }
      }

      if (shouldRunAttachmentCleanup(mergedData.settings.attachments?.lastCleanupAt)) {
        step = 'attachments_cleanup';
        const orphaned = findOrphanedAttachments(mergedData);
        if (orphaned.length > 0) {
          for (const attachment of orphaned) {
            await deleteAttachmentFile(attachment.uri);
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
      return { success: true, stats: syncResult.stats };
    } catch (error) {
      const now = new Date().toISOString();
      const logPath = await logSyncError(error, { backend, step, url: syncUrl });
      const logHint = logPath ? ` (log: ${logPath})` : '';
      const safeMessage = sanitizeLogMessage(String(error));
      try {
        if (wroteLocal) {
          await useTaskStore.getState().fetchData();
        }
        await useTaskStore.getState().updateSettings({
          lastSyncAt: now,
          lastSyncStatus: 'error',
          lastSyncError: `${safeMessage}${logHint}`,
        });
      } catch (e) {
        console.error('[Mobile] Failed to persist sync error', e);
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
