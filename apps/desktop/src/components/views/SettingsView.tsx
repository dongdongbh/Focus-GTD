import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import {
    Bell,
    CalendarDays,
    Database,
    Info,
    ListChecks,
    Monitor,
    Sparkles,
} from 'lucide-react';
import {
    DEFAULT_ANTHROPIC_THINKING_BUDGET,
    safeFormatDate,
    useTaskStore,
} from '@mindwtr/core';

import { useKeybindings } from '../../contexts/keybinding-context';
import { useLanguage, type Language } from '../../contexts/language-context';
import { isTauriRuntime } from '../../lib/runtime';
import { SyncService } from '../../lib/sync-service';
import { clearLog, getLogPath, logDiagnosticsEnabled } from '../../lib/app-log';
import { checkForUpdates, type UpdateInfo, GITHUB_RELEASES_URL, verifyDownloadChecksum } from '../../lib/update-service';
import { SettingsMainPage } from './settings/SettingsMainPage';
import { SettingsGtdPage } from './settings/SettingsGtdPage';
import { SettingsAiPage } from './settings/SettingsAiPage';
import { SettingsNotificationsPage } from './settings/SettingsNotificationsPage';
import { SettingsCalendarPage } from './settings/SettingsCalendarPage';
import { SettingsSyncPage } from './settings/SettingsSyncPage';
import { labelFallback, labelKeyOverrides, type SettingsLabels } from './settings/labels';
import { SettingsAboutPage } from './settings/SettingsAboutPage';
import { SettingsUpdateModal } from './settings/SettingsUpdateModal';
import { SettingsSidebar } from './settings/SettingsSidebar';
import { useAiSettings } from './settings/useAiSettings';
import { useCalendarSettings } from './settings/useCalendarSettings';
import { useSyncSettings } from './settings/useSyncSettings';

type ThemeMode = 'system' | 'light' | 'dark' | 'eink' | 'nord' | 'sepia';
type SettingsPage = 'main' | 'gtd' | 'notifications' | 'sync' | 'calendar' | 'ai' | 'about';
type LinuxDistroInfo = { id?: string; id_like?: string[] };

const THEME_STORAGE_KEY = 'mindwtr-theme';

const LANGUAGES: { id: Language; label: string; native: string }[] = [
    { id: 'en', label: 'English', native: 'English' },
    { id: 'zh', label: 'Chinese', native: '中文' },
    { id: 'es', label: 'Spanish', native: 'Español' },
    { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
    { id: 'ar', label: 'Arabic', native: 'العربية' },
    { id: 'de', label: 'German', native: 'Deutsch' },
    { id: 'ru', label: 'Russian', native: 'Русский' },
    { id: 'ja', label: 'Japanese', native: '日本語' },
    { id: 'fr', label: 'French', native: 'Français' },
    { id: 'pt', label: 'Portuguese', native: 'Português' },
    { id: 'ko', label: 'Korean', native: '한국어' },
    { id: 'it', label: 'Italian', native: 'Italiano' },
    { id: 'tr', label: 'Turkish', native: 'Türkçe' },
];

const maskCalendarUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(https?:\/\/)?([^/?#]+)([^?#]*)/i);
    if (!match) {
        return trimmed.length <= 8 ? '...' : `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
    }
    const protocol = match[1] ?? '';
    const host = match[2] ?? '';
    const path = match[3] ?? '';
    const lastSegment = path.split('/').filter(Boolean).pop() ?? '';
    const suffix = lastSegment ? `...${lastSegment.slice(-6)}` : '...';
    return `${protocol}${host}/${suffix}`;
};

export function SettingsView() {
    const [page, setPage] = useState<SettingsPage>('main');
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const { language, setLanguage, t: translate } = useLanguage();
    const { style: keybindingStyle, setStyle: setKeybindingStyle, openHelp } = useKeybindings();
    const settings = useTaskStore((state) => state.settings);
    const updateSettings = useTaskStore((state) => state.updateSettings);
    const isTauri = isTauriRuntime();

    const [saved, setSaved] = useState(false);
    const [appVersion, setAppVersion] = useState('0.1.0');
    const [dataPath, setDataPath] = useState('');
    const [dbPath, setDbPath] = useState('');
    const [configPath, setConfigPath] = useState('');
    const [logPath, setLogPath] = useState('');
    const notificationsEnabled = settings?.notificationsEnabled !== false;
    const dailyDigestMorningEnabled = settings?.dailyDigestMorningEnabled === true;
    const dailyDigestEveningEnabled = settings?.dailyDigestEveningEnabled === true;
    const dailyDigestMorningTime = settings?.dailyDigestMorningTime || '09:00';
    const dailyDigestEveningTime = settings?.dailyDigestEveningTime || '20:00';
    const autoArchiveDays = Number.isFinite(settings?.gtd?.autoArchiveDays)
        ? Math.max(0, Math.floor(settings?.gtd?.autoArchiveDays as number))
        : 7;
    const loggingEnabled = settings?.diagnostics?.loggingEnabled === true;
    const attachmentsLastCleanupAt = settings?.attachments?.lastCleanupAt;
    const didWriteLogRef = useRef(false);

    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [updateNotice, setUpdateNotice] = useState<string | null>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
    const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
    const [linuxDistro, setLinuxDistro] = useState<LinuxDistroInfo | null>(null);

    const showSaved = useCallback(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, []);
    const selectSyncFolderTitle = useMemo(() => {
        const key = 'settings.selectSyncFolderTitle';
        const translated = translate(key);
        return translated === key ? 'Select sync folder' : translated;
    }, [translate]);

    const {
        syncPath,
        setSyncPath,
        isSyncing,
        syncError,
        syncBackend,
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
    } = useSyncSettings({
        isTauri,
        showSaved,
        selectSyncFolderTitle,
    });
    const aiSettingsEnabled = page === 'ai';
    const {
        aiEnabled,
        aiProvider,
        aiModel,
        aiModelOptions,
        aiCopilotModel,
        aiCopilotOptions,
        aiReasoningEffort,
        aiThinkingBudget,
        anthropicThinkingEnabled,
        aiApiKey,
        speechEnabled,
        speechProvider,
        speechModel,
        speechModelOptions,
        speechLanguage,
        speechMode,
        speechFieldStrategy,
        speechApiKey,
        speechOfflineReady,
        speechOfflineSize,
        speechDownloadState,
        speechDownloadError,
        onUpdateAISettings,
        onUpdateSpeechSettings,
        onProviderChange,
        onSpeechProviderChange,
        onToggleAnthropicThinking,
        onAiApiKeyChange,
        onSpeechApiKeyChange,
        onDownloadWhisperModel,
        onDeleteWhisperModel,
    } = useAiSettings({
        isTauri,
        settings,
        updateSettings,
        showSaved,
        enabled: aiSettingsEnabled,
    });
    const {
        externalCalendars,
        newCalendarName,
        newCalendarUrl,
        calendarError,
        setNewCalendarName,
        setNewCalendarUrl,
        handleAddCalendar,
        handleToggleCalendar,
        handleRemoveCalendar,
    } = useCalendarSettings({ showSaved });
    const [isCleaningAttachments, setIsCleaningAttachments] = useState(false);



    const t = useMemo(() => {
        const labelsFallback = language === 'zh' ? labelFallback.zh : labelFallback.en;
        const result = {} as SettingsLabels;
        (Object.keys(labelFallback.en) as Array<keyof SettingsLabels>).forEach((key) => {
            const i18nKey = labelKeyOverrides[key] ?? `settings.${key}`;
            const translated = translate(i18nKey);
            result[key] = translated !== i18nKey ? translated : labelsFallback[key];
        });
        return result;
    }, [language, translate]);

    useEffect(() => {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (
            savedTheme === 'system'
            || savedTheme === 'light'
            || savedTheme === 'dark'
            || savedTheme === 'eink'
            || savedTheme === 'nord'
            || savedTheme === 'sepia'
        ) {
            setThemeMode(savedTheme);
        }

        if (!isTauri) {
            setAppVersion('web');
            return;
        }

        import('@tauri-apps/api/app')
            .then(({ getVersion }) => getVersion())
            .then(setAppVersion)
            .catch(console.error);

        import('@tauri-apps/api/core')
            .then(async ({ invoke }) => {
                const [data, config, db, distro] = await Promise.all([
                    invoke<string>('get_data_path_cmd'),
                    invoke<string>('get_config_path_cmd'),
                    invoke<string>('get_db_path_cmd'),
                    invoke<LinuxDistroInfo | null>('get_linux_distro'),
                ]);
                setDataPath(data);
                setConfigPath(config);
                setDbPath(db);
                setLinuxDistro(distro);
            })
            .catch(console.error);

        getLogPath()
            .then((path) => {
                if (path) setLogPath(path);
            })
            .catch(console.error);
    }, [isTauri]);

    useEffect(() => {
        if (!loggingEnabled) {
            didWriteLogRef.current = false;
            return;
        }
        if (didWriteLogRef.current) return;
        didWriteLogRef.current = true;
        logDiagnosticsEnabled().catch(console.warn);
    }, [loggingEnabled]);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('theme-eink', 'theme-nord', 'theme-sepia');

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (themeMode === 'system') {
            root.classList.toggle('dark', prefersDark);
        } else if (themeMode === 'dark' || themeMode === 'nord') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        if (themeMode === 'eink') root.classList.add('theme-eink');
        if (themeMode === 'nord') root.classList.add('theme-nord');
        if (themeMode === 'sepia') root.classList.add('theme-sepia');

        if (!isTauri) return;
        const tauriTheme = themeMode === 'system'
            ? null
            : themeMode === 'dark' || themeMode === 'nord'
                ? 'dark'
                : 'light';
        import('@tauri-apps/api/app')
            .then(({ setTheme }) => setTheme(tauriTheme))
            .catch(console.error);
    }, [isTauri, themeMode]);

    const saveThemePreference = (mode: ThemeMode) => {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
        setThemeMode(mode);
        showSaved();
    };

    const saveLanguagePreference = (lang: Language) => {
        setLanguage(lang);
        showSaved();
    };

    const handleKeybindingStyleChange = (style: 'vim' | 'emacs') => {
        setKeybindingStyle(style);
        showSaved();
    };

    const openLink = async (url: string) => {
        if (isTauri) {
            try {
                const { open } = await import('@tauri-apps/plugin-shell');
                await open(url);
                return;
            } catch (error) {
                console.error('Failed to open external link:', error);
            }
        }

        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleAttachmentsCleanup = useCallback(async () => {
        if (!isTauri) return;
        try {
            setIsCleaningAttachments(true);
            await SyncService.cleanupAttachmentsNow();
        } catch (error) {
            console.error('Attachment cleanup failed:', error);
        } finally {
            setIsCleaningAttachments(false);
        }
    }, [isTauri]);

    const toggleLogging = async () => {
        const nextEnabled = !loggingEnabled;
        await updateSettings({
            diagnostics: {
                ...(settings?.diagnostics ?? {}),
                loggingEnabled: nextEnabled,
            },
        }).then(showSaved).catch(console.error);
        if (nextEnabled) {
            await logDiagnosticsEnabled();
        }
    };

    const handleClearLog = async () => {
        await clearLog();
        showSaved();
    };

    const handleCheckUpdates = async () => {
        setIsCheckingUpdate(true);
        setUpdateInfo(null);
        setUpdateError(null);
        setUpdateNotice(null);
        try {
            const info = await checkForUpdates(appVersion);
            if (!info || !info.hasUpdate) {
                setUpdateNotice(t.upToDate);
                return;
            }
            setUpdateInfo(info);
            if (info.platform === 'linux' && linuxFlavor === 'arch') {
                setDownloadNotice(t.downloadAURHint);
            } else {
                setDownloadNotice(null);
            }
            setIsDownloadingUpdate(false);
            setShowUpdateModal(true);
        } catch (error) {
            console.error('Update check failed:', error);
            setUpdateError(String(error));
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const handleDownloadUpdate = async () => {
        const targetUrl = preferredDownloadUrl;
        if (updateInfo?.platform === 'linux' && linuxFlavor === 'arch') {
            setDownloadNotice(t.downloadAURHint);
            return;
        }
        if (!targetUrl) {
            setDownloadNotice(t.downloadFailed);
            return;
        }
        setIsDownloadingUpdate(true);
        setDownloadNotice(t.downloadStarting);

        try {
            if (updateInfo?.assets?.length) {
                const verified = await verifyDownloadChecksum(targetUrl, updateInfo.assets);
                if (!verified) {
                    setDownloadNotice(t.downloadFailed);
                    setIsDownloadingUpdate(false);
                    return;
                }
            }
            if (isTauri) {
                const { open } = await import('@tauri-apps/plugin-shell');
                await open(targetUrl);
            } else {
                window.open(targetUrl, '_blank');
            }
            setDownloadNotice(t.downloadStarted);
        } catch (error) {
            console.error('Failed to open update URL:', error);
            window.open(targetUrl, '_blank');
            setDownloadNotice(t.downloadFailed);
        }

        if (isTauri) {
            try {
                const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
                if (/linux/i.test(userAgent)) {
                    setDownloadNotice(t.linuxUpdateHint);
                }
            } catch (error) {
                console.error('Failed to detect platform:', error);
            }
        }

    };

    const attachmentsLastCleanupDisplay = useMemo(() => {
        if (!attachmentsLastCleanupAt) return '';
        return safeFormatDate(attachmentsLastCleanupAt, 'MMM d, HH:mm');
    }, [attachmentsLastCleanupAt]);
    const anthropicThinkingOptions = [
        { value: DEFAULT_ANTHROPIC_THINKING_BUDGET || 1024, label: t.aiThinkingLow },
        { value: 2048, label: t.aiThinkingMedium },
        { value: 4096, label: t.aiThinkingHigh },
    ];

    const linuxFlavor = useMemo(() => {
        if (!linuxDistro) return null;
        const tokens = [
            linuxDistro.id,
            ...(linuxDistro.id_like ?? []),
        ]
            .filter(Boolean)
            .map((value) => String(value).toLowerCase());
        if (tokens.some((token) => token.includes('arch') || token.includes('manjaro'))) return 'arch';
        if (tokens.some((token) => token.includes('debian') || token.includes('ubuntu') || token.includes('pop'))) return 'debian';
        if (tokens.some((token) => token.includes('fedora') || token.includes('rhel') || token.includes('redhat') || token.includes('centos') || token.includes('rocky') || token.includes('alma'))) return 'rpm';
        if (tokens.some((token) => token.includes('suse') || token.includes('opensuse'))) return 'rpm';
        return 'other';
    }, [linuxDistro]);

    const recommendedDownload = useMemo(() => {
        if (!updateInfo) return null;
        const assets = updateInfo.assets || [];
        const findAsset = (patterns: RegExp[]) => assets.find((asset) => patterns.some((pattern) => pattern.test(asset.name)));

        if (updateInfo.platform === 'windows') {
            const asset = findAsset([/\.msi$/i, /\.exe$/i]);
            return asset ? { label: '.msi/.exe', url: asset.url } : null;
        }

        if (updateInfo.platform === 'macos') {
            const asset = findAsset([/\.dmg$/i, /\.app\.tar\.gz$/i]);
            return asset ? { label: '.dmg', url: asset.url } : null;
        }

        if (updateInfo.platform === 'linux') {
            if (linuxFlavor === 'arch') {
                return { label: 'AUR' };
            }
            if (linuxFlavor === 'debian') {
                const asset = findAsset([/\.deb$/i]);
                return asset?.url ? { label: '.deb', url: asset.url } : null;
            }
            if (linuxFlavor === 'rpm') {
                const asset = findAsset([/\.rpm$/i]);
                return asset?.url ? { label: '.rpm', url: asset.url } : null;
            }
            const asset = findAsset([/\.AppImage$/i]);
            return asset?.url ? { label: '.AppImage', url: asset.url } : null;
        }

        return null;
    }, [updateInfo, linuxFlavor]);

    const preferredDownloadUrl = useMemo(() => {
        if (!updateInfo) return null;
        if (updateInfo.platform === 'linux') {
            if (linuxFlavor === 'arch') return null;
            if (linuxFlavor === 'debian' || linuxFlavor === 'rpm') {
                return recommendedDownload?.url ?? updateInfo.releaseUrl ?? GITHUB_RELEASES_URL;
            }
        }
        return recommendedDownload?.url ?? updateInfo.downloadUrl ?? updateInfo.releaseUrl ?? GITHUB_RELEASES_URL;
    }, [updateInfo, linuxFlavor, recommendedDownload]);

    const isArchLinuxUpdate = updateInfo?.platform === 'linux' && linuxFlavor === 'arch';
    const canDownloadUpdate = Boolean(preferredDownloadUrl) && !isArchLinuxUpdate;

    const lastSyncAt = settings?.lastSyncAt;
    const lastSyncStatus = settings?.lastSyncStatus;
    const lastSyncStats = settings?.lastSyncStats ?? null;
    const lastSyncDisplay = lastSyncAt ? safeFormatDate(lastSyncAt, 'PPpp', lastSyncAt) : t.lastSyncNever;
    const conflictCount = (lastSyncStats?.tasks.conflicts || 0) + (lastSyncStats?.projects.conflicts || 0);
    const weeklyReviewEnabled = settings?.weeklyReviewEnabled === true;
    const weeklyReviewTime = settings?.weeklyReviewTime || '18:00';
    const weeklyReviewDay = Number.isFinite(settings?.weeklyReviewDay) ? settings?.weeklyReviewDay as number : 0;
    const localeMap: Record<Language, string> = {
        en: 'en-US',
        zh: 'zh-CN',
        es: 'es-ES',
        hi: 'hi-IN',
        ar: 'ar',
        de: 'de-DE',
        ru: 'ru-RU',
        ja: 'ja-JP',
        fr: 'fr-FR',
        pt: 'pt-PT',
        ko: 'ko-KR',
        it: 'it-IT',
        tr: 'tr-TR',
    };
    const locale = localeMap[language] ?? 'en-US';
    const weekdayOptions = useMemo(() => (
        Array.from({ length: 7 }, (_, i) => {
            const base = new Date(2021, 7, 1 + i);
            return { value: i, label: base.toLocaleDateString(locale, { weekday: 'long' }) };
        })
    ), [locale]);

    const pageTitle = useMemo(() => {
        switch (page) {
            case 'gtd':
                return t.gtd;
            case 'notifications':
                return t.notifications;
            case 'ai':
                return t.ai;
            case 'sync':
                return t.sync;
            case 'calendar':
                return t.calendar;
            case 'about':
                return t.about;
            default:
                return t.general;
        }
    }, [page, t]);

    const navItems = useMemo<Array<{
        id: SettingsPage;
        icon: ComponentType<{ className?: string }>;
        label: string;
        description?: string;
    }>>(() => [
        { id: 'main', icon: Monitor, label: t.general, description: `${t.appearance} • ${t.language} • ${t.keybindings}` },
        { id: 'gtd', icon: ListChecks, label: t.gtd, description: t.gtdDesc },
        { id: 'notifications', icon: Bell, label: t.notifications },
        { id: 'sync', icon: Database, label: t.sync },
        { id: 'ai', icon: Sparkles, label: t.ai, description: t.aiDesc },
        { id: 'calendar', icon: CalendarDays, label: t.calendar },
        { id: 'about', icon: Info, label: t.about },
    ], [t]);

    const renderPage = () => {
        if (page === 'main') {
            return (
                <SettingsMainPage
                    t={t}
                    themeMode={themeMode}
                    onThemeChange={saveThemePreference}
                    language={language}
                    onLanguageChange={saveLanguagePreference}
                    keybindingStyle={keybindingStyle}
                    onKeybindingStyleChange={handleKeybindingStyleChange}
                    onOpenHelp={openHelp}
                    languages={LANGUAGES}
                />
            );
        }

        if (page === 'gtd') {
            return (
                <SettingsGtdPage
                    t={t}
                    language={language}
                    settings={settings}
                    updateSettings={updateSettings}
                    showSaved={showSaved}
                    autoArchiveDays={autoArchiveDays}
                />
            );
        }

        if (page === 'ai') {
            return (
                <SettingsAiPage
                    t={t}
                    aiEnabled={aiEnabled}
                    aiProvider={aiProvider}
                    aiModel={aiModel}
                    aiModelOptions={aiModelOptions}
                    aiCopilotModel={aiCopilotModel}
                    aiCopilotOptions={aiCopilotOptions}
                    aiReasoningEffort={aiReasoningEffort}
                    aiThinkingBudget={aiThinkingBudget}
                    anthropicThinkingEnabled={anthropicThinkingEnabled}
                    anthropicThinkingOptions={anthropicThinkingOptions}
                    aiApiKey={aiApiKey}
                    speechEnabled={speechEnabled}
                    speechProvider={speechProvider}
                    speechModel={speechModel}
                    speechModelOptions={speechModelOptions}
                    speechLanguage={speechLanguage}
                    speechMode={speechMode}
                    speechFieldStrategy={speechFieldStrategy}
                    speechApiKey={speechApiKey}
                    speechOfflineReady={speechOfflineReady}
                    speechOfflineSize={speechOfflineSize}
                    speechDownloadState={speechDownloadState}
                    speechDownloadError={speechDownloadError}
                    onUpdateAISettings={onUpdateAISettings}
                    onUpdateSpeechSettings={onUpdateSpeechSettings}
                    onProviderChange={onProviderChange}
                    onSpeechProviderChange={onSpeechProviderChange}
                    onToggleAnthropicThinking={onToggleAnthropicThinking}
                    onAiApiKeyChange={onAiApiKeyChange}
                    onSpeechApiKeyChange={onSpeechApiKeyChange}
                    onDownloadWhisperModel={onDownloadWhisperModel}
                    onDeleteWhisperModel={onDeleteWhisperModel}
                />
            );
        }

        if (page === 'notifications') {
            return (
                <SettingsNotificationsPage
                    t={t}
                    notificationsEnabled={notificationsEnabled}
                    weeklyReviewEnabled={weeklyReviewEnabled}
                    weeklyReviewDay={weeklyReviewDay}
                    weeklyReviewTime={weeklyReviewTime}
                    weekdayOptions={weekdayOptions}
                    dailyDigestMorningEnabled={dailyDigestMorningEnabled}
                    dailyDigestEveningEnabled={dailyDigestEveningEnabled}
                    dailyDigestMorningTime={dailyDigestMorningTime}
                    dailyDigestEveningTime={dailyDigestEveningTime}
                    updateSettings={updateSettings}
                    showSaved={showSaved}
                />
            );
        }

        if (page === 'calendar') {
            return (
                <SettingsCalendarPage
                    t={t}
                    newCalendarName={newCalendarName}
                    newCalendarUrl={newCalendarUrl}
                    calendarError={calendarError}
                    externalCalendars={externalCalendars}
                    onCalendarNameChange={setNewCalendarName}
                    onCalendarUrlChange={setNewCalendarUrl}
                    onAddCalendar={handleAddCalendar}
                    onToggleCalendar={handleToggleCalendar}
                    onRemoveCalendar={handleRemoveCalendar}
                    maskCalendarUrl={maskCalendarUrl}
                />
            );
        }

        if (page === 'sync') {
            return (
                <SettingsSyncPage
                    t={t}
                    isTauri={isTauri}
                    dataPath={dataPath}
                    dbPath={dbPath}
                    configPath={configPath}
                    loggingEnabled={loggingEnabled}
                    logPath={logPath}
                    onToggleLogging={toggleLogging}
                    onClearLog={handleClearLog}
                    syncBackend={syncBackend}
                    onSetSyncBackend={handleSetSyncBackend}
                    syncPath={syncPath}
                    onSyncPathChange={setSyncPath}
                    onSaveSyncPath={handleSaveSyncPath}
                    onBrowseSyncPath={handleChangeSyncLocation}
                    webdavUrl={webdavUrl}
                    webdavUsername={webdavUsername}
                    webdavPassword={webdavPassword}
                    webdavHasPassword={webdavHasPassword}
                    onWebdavUrlChange={setWebdavUrl}
                    onWebdavUsernameChange={setWebdavUsername}
                    onWebdavPasswordChange={setWebdavPassword}
                    onSaveWebDav={handleSaveWebDav}
                    cloudUrl={cloudUrl}
                    cloudToken={cloudToken}
                    onCloudUrlChange={setCloudUrl}
                    onCloudTokenChange={setCloudToken}
                    onSaveCloud={handleSaveCloud}
                    onSyncNow={handleSync}
                    isSyncing={isSyncing}
                    syncError={syncError}
                    lastSyncDisplay={lastSyncDisplay}
                    lastSyncStatus={lastSyncStatus}
                    lastSyncStats={lastSyncStats}
                    conflictCount={conflictCount}
                    lastSyncError={settings?.lastSyncError}
                    attachmentsLastCleanupDisplay={attachmentsLastCleanupDisplay}
                    onRunAttachmentsCleanup={handleAttachmentsCleanup}
                    isCleaningAttachments={isCleaningAttachments}
                />
            );
        }

        if (page === 'about') {
            return (
                <SettingsAboutPage
                    t={t}
                    isTauri={isTauri}
                    dataPath={dataPath}
                    dbPath={dbPath}
                    configPath={configPath}
                    appVersion={appVersion}
                    onOpenLink={openLink}
                    onCheckUpdates={handleCheckUpdates}
                    isCheckingUpdate={isCheckingUpdate}
                    updateError={updateError}
                    updateNotice={updateNotice}
                />
            );
        }

        return null;
    };

    return (
        <ErrorBoundary>
            <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-6xl p-8">
                <div className="grid grid-cols-12 gap-6">
                    <SettingsSidebar
                        title={t.title}
                        subtitle={t.subtitle}
                        items={navItems}
                        activeId={page}
                        onSelect={(id) => setPage(id as SettingsPage)}
                    />

                    <main className="col-span-12 lg:col-span-8 xl:col-span-9">
                        <div className="space-y-6">
                            <header className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-semibold tracking-tight">{pageTitle}</h2>
                                </div>
                            </header>
                            {renderPage()}
                        </div>
                    </main>
                </div>
            </div>

            {saved && (
                <div className="fixed bottom-8 right-8 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
                    {t.saved}
                </div>
            )}

            <SettingsUpdateModal
                isOpen={showUpdateModal}
                updateInfo={updateInfo}
                t={t}
                recommendedDownload={recommendedDownload}
                linuxFlavor={linuxFlavor}
                isDownloading={isDownloadingUpdate}
                downloadNotice={downloadNotice}
                canDownload={canDownloadUpdate}
                onClose={() => {
                    setShowUpdateModal(false);
                    setIsDownloadingUpdate(false);
                    setDownloadNotice(null);
                }}
                onDownload={handleDownloadUpdate}
            />
            </div>
        </ErrorBoundary>
    );
}
