import { useCallback, useEffect, useState } from 'react';
import { SyncService } from '../../../lib/sync-service';
import { reportError } from '../../../lib/report-error';

export type SyncBackend = 'file' | 'webdav' | 'cloud';

type UseSyncSettingsOptions = {
    isTauri: boolean;
    showSaved: () => void;
    selectSyncFolderTitle: string;
};

export const useSyncSettings = ({ isTauri, showSaved, selectSyncFolderTitle }: UseSyncSettingsOptions) => {
    const [syncPath, setSyncPath] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncBackend, setSyncBackend] = useState<SyncBackend>('file');
    const [webdavUrl, setWebdavUrl] = useState('');
    const [webdavUsername, setWebdavUsername] = useState('');
    const [webdavPassword, setWebdavPassword] = useState('');
    const [webdavHasPassword, setWebdavHasPassword] = useState(false);
    const [cloudUrl, setCloudUrl] = useState('');
    const [cloudToken, setCloudToken] = useState('');

    useEffect(() => {
        SyncService.getSyncPath().then(setSyncPath).catch((error) => reportError('Failed to load sync path', error));
        SyncService.getSyncBackend().then(setSyncBackend).catch((error) => reportError('Failed to load sync backend', error));
        SyncService.getWebDavConfig()
            .then((cfg) => {
                setWebdavUrl(cfg.url);
                setWebdavUsername(cfg.username);
                setWebdavPassword(cfg.password ?? '');
                setWebdavHasPassword(cfg.hasPassword === true);
            })
            .catch((error) => reportError('Failed to update sync backend', error));
        SyncService.getCloudConfig()
            .then((cfg) => {
                setCloudUrl(cfg.url);
                setCloudToken(cfg.token);
            })
            .catch((error) => reportError('Failed to update sync path', error));
    }, []);

    const handleSaveSyncPath = useCallback(async () => {
        if (!syncPath.trim()) return;
        const result = await SyncService.setSyncPath(syncPath.trim());
        if (result.success) {
            showSaved();
        }
    }, [showSaved, syncPath]);

    const handleChangeSyncLocation = useCallback(async () => {
        try {
            if (!isTauri) return;

            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: selectSyncFolderTitle,
            });

            if (selected && typeof selected === 'string') {
                setSyncPath(selected);
                const result = await SyncService.setSyncPath(selected);
                if (result.success) {
                    showSaved();
                }
            }
        } catch (error) {
            reportError('Failed to change sync location', error);
        }
    }, [isTauri, selectSyncFolderTitle, showSaved]);

    const handleSetSyncBackend = useCallback(async (backend: SyncBackend) => {
        setSyncBackend(backend);
        await SyncService.setSyncBackend(backend);
        showSaved();
    }, [showSaved]);

    const handleSaveWebDav = useCallback(async () => {
        const trimmedUrl = webdavUrl.trim();
        const trimmedPassword = webdavPassword.trim();
        await SyncService.setWebDavConfig({
            url: trimmedUrl,
            username: webdavUsername.trim(),
            ...(trimmedPassword ? { password: trimmedPassword } : {}),
        });
        if (!trimmedUrl) {
            setWebdavHasPassword(false);
            setWebdavPassword('');
        } else if (trimmedPassword) {
            setWebdavHasPassword(true);
        }
        showSaved();
    }, [showSaved, webdavPassword, webdavUrl, webdavUsername]);

    const handleSaveCloud = useCallback(async () => {
        await SyncService.setCloudConfig({
            url: cloudUrl.trim(),
            token: cloudToken.trim(),
        });
        showSaved();
    }, [cloudUrl, cloudToken, showSaved]);

    const handleSync = useCallback(async () => {
        try {
            setIsSyncing(true);
            setSyncError(null);

            if (syncBackend === 'webdav') {
                if (!webdavUrl.trim()) return;
                await handleSaveWebDav();
            }
            if (syncBackend === 'cloud') {
                if (!cloudUrl.trim()) return;
                await handleSaveCloud();
            }
            if (syncBackend === 'file') {
                const path = syncPath.trim();
                if (path) {
                    await SyncService.setSyncPath(path);
                }
            }

            await SyncService.performSync();
        } catch (error) {
            reportError('Sync failed', error);
            setSyncError(String(error));
        } finally {
            setIsSyncing(false);
        }
    }, [cloudUrl, handleSaveCloud, handleSaveWebDav, syncBackend, syncPath, webdavUrl]);

    return {
        syncPath,
        setSyncPath,
        isSyncing,
        syncError,
        syncBackend,
        setSyncBackend,
        webdavUrl,
        setWebdavUrl,
        webdavUsername,
        setWebdavUsername,
        webdavPassword,
        setWebdavPassword,
        webdavHasPassword,
        cloudUrl,
        setCloudUrl,
        cloudToken,
        setCloudToken,
        handleSaveSyncPath,
        handleChangeSyncLocation,
        handleSetSyncBackend,
        handleSaveWebDav,
        handleSaveCloud,
        handleSync,
    };
};
