import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
    Bell,
    CalendarDays,
    Check,
    Database,
    ExternalLink,
    Info,
    ListChecks,
    Monitor,
    RefreshCw,
    Sparkles,
} from 'lucide-react';
import {
    DEFAULT_GEMINI_THINKING_BUDGET,
    DEFAULT_ANTHROPIC_THINKING_BUDGET,
    DEFAULT_REASONING_EFFORT,
    generateUUID,
    getDefaultAIConfig,
    getDefaultCopilotModel,
    getCopilotModelOptions,
    getModelOptions,
    translateText,
    type AIProviderId,
    type AIReasoningEffort,
    safeFormatDate,
    type TaskEditorFieldId,
    type ExternalCalendarSubscription,
    useTaskStore,
} from '@mindwtr/core';

import { useKeybindings } from '../../contexts/keybinding-context';
import { useLanguage, type Language } from '../../contexts/language-context';
import { isTauriRuntime } from '../../lib/runtime';
import { SyncService } from '../../lib/sync-service';
import { clearLog, getLogPath, logDiagnosticsEnabled } from '../../lib/app-log';
import { ExternalCalendarService } from '../../lib/external-calendar-service';
import { checkForUpdates, type UpdateInfo, GITHUB_RELEASES_URL } from '../../lib/update-service';
import { loadAIKey, saveAIKey } from '../../lib/ai-config';
import { cn } from '../../lib/utils';

type ThemeMode = 'system' | 'light' | 'dark';
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
    const { language, setLanguage } = useLanguage();
    const { style: keybindingStyle, setStyle: setKeybindingStyle, openHelp } = useKeybindings();
    const { settings, updateSettings } = useTaskStore();

    const [saved, setSaved] = useState(false);
    const [appVersion, setAppVersion] = useState('0.1.0');
    const [dataPath, setDataPath] = useState('');
    const [dbPath, setDbPath] = useState('');
    const [configPath, setConfigPath] = useState('');
    const [logPath, setLogPath] = useState('');
    const [aiApiKey, setAiApiKey] = useState('');

    const notificationsEnabled = settings?.notificationsEnabled !== false;
    const dailyDigestMorningEnabled = settings?.dailyDigestMorningEnabled === true;
    const dailyDigestEveningEnabled = settings?.dailyDigestEveningEnabled === true;
    const dailyDigestMorningTime = settings?.dailyDigestMorningTime || '09:00';
    const dailyDigestEveningTime = settings?.dailyDigestEveningTime || '20:00';
    const autoArchiveDays = Number.isFinite(settings?.gtd?.autoArchiveDays)
        ? Math.max(0, Math.floor(settings?.gtd?.autoArchiveDays as number))
        : 7;
    const aiProvider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
    const aiEnabled = settings?.ai?.enabled === true;
    const aiDefaults = getDefaultAIConfig(aiProvider);
    const aiModel = settings?.ai?.model ?? aiDefaults.model;
    const aiReasoningEffort = (settings?.ai?.reasoningEffort ?? DEFAULT_REASONING_EFFORT) as AIReasoningEffort;
    const aiThinkingBudget = settings?.ai?.thinkingBudget ?? aiDefaults.thinkingBudget ?? DEFAULT_GEMINI_THINKING_BUDGET;
    const anthropicThinkingEnabled = aiProvider === 'anthropic' && aiThinkingBudget > 0;
    const aiModelOptions = getModelOptions(aiProvider);
    const aiCopilotModel = settings?.ai?.copilotModel ?? getDefaultCopilotModel(aiProvider);
    const aiCopilotOptions = getCopilotModelOptions(aiProvider);
    const loggingEnabled = settings?.diagnostics?.loggingEnabled === true;
    const didWriteLogRef = useRef(false);
    const prioritiesEnabled = settings?.features?.priorities === true;
    const timeEstimatesEnabled = settings?.features?.timeEstimates === true;

    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [updateNotice, setUpdateNotice] = useState<string | null>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
    const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
    const [linuxDistro, setLinuxDistro] = useState<LinuxDistroInfo | null>(null);

    const [syncPath, setSyncPath] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncBackend, setSyncBackend] = useState<'file' | 'webdav'>('file');
    const [webdavUrl, setWebdavUrl] = useState('');
    const [webdavUsername, setWebdavUsername] = useState('');
    const [webdavPassword, setWebdavPassword] = useState('');
    const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSubscription[]>([]);
    const [newCalendarName, setNewCalendarName] = useState('');
    const [newCalendarUrl, setNewCalendarUrl] = useState('');
    const [calendarError, setCalendarError] = useState<string | null>(null);

    useEffect(() => {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
            setThemeMode(savedTheme);
        }

        if (!isTauriRuntime()) {
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
    }, []);

    useEffect(() => {
        SyncService.getSyncPath().then(setSyncPath).catch(console.error);
        SyncService.getSyncBackend().then(setSyncBackend).catch(console.error);
        SyncService.getWebDavConfig()
            .then((cfg) => {
                setWebdavUrl(cfg.url);
                setWebdavUsername(cfg.username);
                setWebdavPassword(cfg.password);
            })
            .catch(console.error);
    }, []);

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
        ExternalCalendarService.getCalendars().then(setExternalCalendars).catch(console.error);
    }, []);

    useEffect(() => {
        setAiApiKey(loadAIKey(aiProvider));
    }, [aiProvider]);

    useEffect(() => {
        const root = document.documentElement;
        if (themeMode === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.classList.toggle('dark', isDark);
        } else {
            root.classList.toggle('dark', themeMode === 'dark');
        }
        if (!isTauriRuntime()) return;
        import('@tauri-apps/api/app')
            .then(({ setTheme }) => setTheme(themeMode === 'system' ? null : themeMode))
            .catch(console.error);
    }, [themeMode]);

    const showSaved = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const saveThemePreference = (mode: ThemeMode) => {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
        setThemeMode(mode);
        showSaved();
    };

    const saveLanguagePreference = (lang: Language) => {
        setLanguage(lang);
        showSaved();
    };

    const updateAISettings = (next: Partial<NonNullable<typeof settings.ai>>) => {
        updateSettings({ ai: { ...(settings.ai ?? {}), ...next } })
            .then(showSaved)
            .catch(console.error);
    };

    const updateFeatureFlags = (next: Partial<NonNullable<typeof settings.features>>) => {
        updateSettings({ features: { ...(settings.features ?? {}), ...next } })
            .then(showSaved)
            .catch(console.error);
    };

    const openLink = (url: string) => {
        window.open(url, '_blank');
    };

    const handleChangeSyncLocation = async () => {
        try {
            if (!isTauriRuntime()) return;

            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: t.selectSyncFolderTitle,
            });

            if (selected && typeof selected === 'string') {
                setSyncPath(selected);
                const result = await SyncService.setSyncPath(selected);
                if (result.success) {
                    showSaved();
                }
            }
        } catch (error) {
            console.error('Failed to change sync location:', error);
        }
    };

    const handleSetSyncBackend = async (backend: 'file' | 'webdav') => {
        setSyncBackend(backend);
        await SyncService.setSyncBackend(backend);
        showSaved();
    };

    const handleSaveWebDav = async () => {
        await SyncService.setWebDavConfig({
            url: webdavUrl.trim(),
            username: webdavUsername.trim(),
            password: webdavPassword,
        });
        showSaved();
    };

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            setSyncError(null);

            if (syncBackend === 'webdav') {
                if (!webdavUrl.trim()) return;
                await handleSaveWebDav();
            }
            if (syncBackend === 'file') {
                const path = syncPath.trim();
                if (path) {
                    await SyncService.setSyncPath(path);
                }
            }

            await SyncService.performSync();
        } catch (error) {
            console.error('Sync failed:', error);
            setSyncError(String(error));
        } finally {
            setIsSyncing(false);
        }
    };

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
            if (isTauriRuntime()) {
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

        if (isTauriRuntime()) {
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

    const labels = {
        en: {
            title: 'Settings',
            general: 'General',
            subtitle: 'Customize your Mindwtr experience',
            back: 'Back',
            features: 'Features',
            featuresDesc: 'Optional signals you can turn on when needed.',
            appearance: 'Appearance',
            gtd: 'GTD',
            gtdDesc: 'Tune the GTD workflow defaults.',
            autoArchive: 'Auto-archive done tasks',
            autoArchiveDesc: 'Move completed tasks to Archived after a set number of days.',
            autoArchiveNever: 'Never (keep in Done)',
            language: 'Language',
            keybindings: 'Keyboard Shortcuts',
            keybindingsDesc: 'Choose your preferred desktop keybinding style.',
            keybindingVim: 'Vim',
            keybindingEmacs: 'Emacs',
            viewShortcuts: 'View shortcuts',
            taskEditorLayout: 'Task editor layout',
            taskEditorLayoutDesc: 'Choose which fields are shown by default in the task editor.',
            taskEditorLayoutHint: 'Hidden fields appear when they have content or after clicking “More options”.',
            taskEditorLayoutReset: 'Reset layout',
            taskEditorFieldStatus: 'Status',
            taskEditorFieldProject: 'Project',
            taskEditorFieldPriority: 'Priority',
            taskEditorFieldContexts: 'Contexts',
            taskEditorFieldDescription: 'Description',
            taskEditorFieldTags: 'Tags',
            taskEditorFieldTimeEstimate: 'Time estimate',
            taskEditorFieldRecurrence: 'Recurrence',
            taskEditorFieldStartTime: 'Start date',
            taskEditorFieldDueDate: 'Due date',
            taskEditorFieldReviewAt: 'Review date',
            taskEditorFieldAttachments: 'Attachments',
            taskEditorFieldChecklist: 'Checklist',
            featurePriorities: 'Priorities',
            featurePrioritiesDesc: 'Show a priority flag on tasks.',
            featureTimeEstimates: 'Time estimates',
            featureTimeEstimatesDesc: 'Add quick duration estimates for time blocking.',
            notifications: 'Notifications',
            notificationsDesc: 'Enable task reminders and daily digest notifications.',
            notificationsEnable: 'Enable notifications',
            ai: 'AI Assistant',
            aiDesc: 'Optional help to clarify and break down tasks.',
            aiEnable: 'Enable AI assistant',
            aiProvider: 'Provider',
            aiProviderOpenAI: 'OpenAI',
            aiProviderGemini: 'Gemini',
            aiProviderAnthropic: 'Anthropic (Claude)',
            aiModel: 'Model',
            aiApiKey: 'API key',
            aiApiKeyHint: 'Stored locally on this device. Never synced.',
            aiReasoning: 'Reasoning effort',
            aiReasoningHint: 'Used by GPT-5 models.',
            aiEffortLow: 'Low',
            aiEffortMedium: 'Medium',
            aiEffortHigh: 'High',
            aiCopilotModel: 'Copilot model',
            aiCopilotHint: 'Used for fast autocomplete suggestions.',
            aiThinkingBudget: 'Thinking budget',
            aiThinkingHint: 'Claude/Gemini only. 0 disables extended thinking.',
            aiThinkingEnable: 'Enable thinking',
            aiThinkingEnableDesc: 'Use extended reasoning for complex tasks.',
            aiThinkingOff: 'Off',
            aiThinkingLow: 'Low',
            aiThinkingMedium: 'Medium',
            aiThinkingHigh: 'High',
            dailyDigest: 'Daily Digest',
            dailyDigestDesc: 'Morning briefing and evening review prompts.',
            dailyDigestMorning: 'Morning briefing',
            dailyDigestEvening: 'Evening review',
            weeklyReview: 'Weekly review',
            weeklyReviewDesc: 'Get a weekly review reminder at your chosen time.',
            weeklyReviewDay: 'Review day',
            weeklyReviewTime: 'Review time',
            on: 'On',
            off: 'Off',
            visible: 'Shown',
            hidden: 'Hidden',
            manage: 'Manage',
            localData: 'Local Data',
            localDataDesc: 'Config is stored in your system config folder; data is stored in your system data folder.',
            webDataDesc: 'The web app stores data in browser storage.',
            diagnostics: 'Diagnostics',
            diagnosticsDesc: 'Help troubleshoot issues.',
            debugLogging: 'Debug logging',
            debugLoggingDesc: 'Record errors locally to share with support.',
            logFile: 'Log file',
            clearLog: 'Clear log',
            sync: 'Sync',
            syncDescription:
                'Configure a secondary folder to sync your data with (e.g., Dropbox, Syncthing). This merges your local data with the sync folder to prevent data loss.',
            syncBackend: 'Sync backend',
            syncBackendFile: 'File',
            syncBackendWebdav: 'WebDAV',
            calendar: 'Calendar',
            calendarDesc: 'View external calendars via ICS subscription URLs.',
            externalCalendars: 'External calendars',
            calendarName: 'Name',
            calendarUrl: 'ICS URL',
            calendarAdd: 'Add calendar',
            calendarRemove: 'Remove',
            syncFolderLocation: 'Sync folder',
            savePath: 'Save',
            browse: 'Browse…',
            syncNow: 'Sync now',
            syncing: 'Syncing…',
            pathHint: 'Type a path directly (e.g., ~/Sync/mindwtr) or use Browse if available',
            webdavUrl: 'WebDAV URL',
            webdavUsername: 'Username',
            webdavPassword: 'Password',
            webdavSave: 'Save WebDAV',
            webdavHint: 'Use a full URL to your sync JSON file (e.g., https://example.com/remote.php/dav/files/user/data.json).',
            lastSync: 'Last sync',
            lastSyncNever: 'Never',
            lastSyncSuccess: 'Sync completed',
            lastSyncError: 'Sync failed',
            lastSyncConflict: 'Conflicts resolved',
            lastSyncConflicts: 'Conflicts',
            about: 'About',
            version: 'Version',
            developer: 'Developer',
            website: 'Website',
            github: 'GitHub',
            license: 'License',
            checkForUpdates: 'Check for Updates',
            checking: 'Checking…',
            upToDate: 'You are using the latest version!',
            updateAvailable: 'Update Available',
            checkFailed: 'Failed to check for updates',
            download: 'Download',
            downloadStarting: 'Opening download…',
            downloadStarted: 'Download started in your browser.',
            downloadFailed: 'Failed to open download link.',
            downloadRecommended: 'Recommended package',
            downloadAURHint: 'Arch detected: update via AUR',
            changelog: 'Changelog',
            noChangelog: 'No changelog available',
            later: 'Later',
            linuxUpdateHint: 'On Linux, Mindwtr cannot auto-install updates. After downloading, install via your package manager (e.g., yay -S mindwtr or paru -S mindwtr) or the downloaded package.',
            saved: 'Settings saved',
            selectSyncFolderTitle: 'Select sync folder',
            system: 'System',
            light: 'Light',
            dark: 'Dark',
        },
        zh: {
            title: '设置',
            general: '通用',
            subtitle: '自定义您的 Mindwtr 体验',
            back: '返回',
            features: '功能',
            featuresDesc: '按需开启可选信号。',
            appearance: '外观',
            gtd: 'GTD',
            gtdDesc: '调整 GTD 工作流默认设置。',
            autoArchive: '自动归档完成任务',
            autoArchiveDesc: '在设定天数后将已完成任务移入归档。',
            autoArchiveNever: '从不（保留在已完成）',
            language: '语言',
            keybindings: '快捷键',
            keybindingsDesc: '选择桌面端偏好的快捷键风格。',
            keybindingVim: 'Vim',
            keybindingEmacs: 'Emacs',
            viewShortcuts: '查看快捷键',
            taskEditorLayout: '任务编辑布局',
            taskEditorLayoutDesc: '选择默认显示的任务编辑字段。',
            taskEditorLayoutHint: '隐藏字段仅在有内容或点击“更多选项”后显示。',
            taskEditorLayoutReset: '重置布局',
            taskEditorFieldStatus: '状态',
            taskEditorFieldProject: '项目',
            taskEditorFieldPriority: '优先级',
            taskEditorFieldContexts: '情境',
            taskEditorFieldDescription: '描述',
            taskEditorFieldTags: '标签',
            taskEditorFieldTimeEstimate: '时间预估',
            taskEditorFieldRecurrence: '重复',
            taskEditorFieldStartTime: '开始日期',
            taskEditorFieldDueDate: '截止日期',
            taskEditorFieldReviewAt: '回顾日期',
            taskEditorFieldAttachments: '附件',
            taskEditorFieldChecklist: '清单',
            featurePriorities: '优先级',
            featurePrioritiesDesc: '为任务显示优先级标记。',
            featureTimeEstimates: '时间估算',
            featureTimeEstimatesDesc: '为时间管理添加时长估计。',
            notifications: '通知',
            notificationsDesc: '启用任务提醒与每日简报通知。',
            notificationsEnable: '启用通知',
            ai: 'AI 助手',
            aiDesc: '帮助澄清与拆解任务（可选）。',
            aiEnable: '启用 AI 助手',
            aiProvider: '服务商',
            aiProviderOpenAI: 'OpenAI',
            aiProviderGemini: 'Gemini',
            aiProviderAnthropic: 'Anthropic（Claude）',
            aiModel: '模型',
            aiApiKey: 'API 密钥',
            aiApiKeyHint: '仅保存在本机，不会同步。',
            aiReasoning: '推理强度',
            aiReasoningHint: '仅用于 GPT-5 模型。',
            aiEffortLow: '低',
            aiEffortMedium: '中',
            aiEffortHigh: '高',
            aiCopilotModel: '助手模型',
            aiCopilotHint: '用于快速补全建议。',
            aiThinkingBudget: '思考预算',
            aiThinkingHint: '仅用于 Claude/Gemini。0 代表关闭深度思考。',
            aiThinkingEnable: '启用思考',
            aiThinkingEnableDesc: '为复杂任务启用扩展推理。',
            aiThinkingOff: '关闭',
            aiThinkingLow: '低',
            aiThinkingMedium: '中',
            aiThinkingHigh: '高',
            dailyDigest: '每日简报',
            dailyDigestDesc: '早间简报与晚间回顾提醒。',
            dailyDigestMorning: '早间简报',
            dailyDigestEvening: '晚间回顾',
            weeklyReview: '每周回顾',
            weeklyReviewDesc: '在你设定的时间提醒进行每周回顾。',
            weeklyReviewDay: '回顾日期',
            weeklyReviewTime: '回顾时间',
            on: '开启',
            off: '关闭',
            visible: '显示',
            hidden: '隐藏',
            manage: '管理',
            localData: '本地数据',
            localDataDesc: '配置保存在系统配置目录；数据保存在系统数据目录。',
            webDataDesc: 'Web 版本使用浏览器存储。',
            diagnostics: '诊断',
            diagnosticsDesc: '帮助排查问题。',
            debugLogging: '调试日志',
            debugLoggingDesc: '将错误记录到本地以便提交反馈。',
            logFile: '日志文件',
            clearLog: '清除日志',
            sync: '同步',
            syncDescription:
                '配置一个辅助文件夹来同步您的数据（如 Dropbox、Syncthing）。这会将本地数据与同步文件夹合并，以防止数据丢失。',
            syncBackend: '同步后端',
            syncBackendFile: '文件',
            syncBackendWebdav: 'WebDAV',
            calendar: '日历',
            calendarDesc: '通过 ICS 订阅地址查看外部日历（只读）。',
            externalCalendars: '外部日历',
            calendarName: '名称',
            calendarUrl: 'ICS 地址',
            calendarAdd: '添加日历',
            calendarRemove: '移除',
            syncFolderLocation: '同步文件夹',
            savePath: '保存',
            browse: '浏览…',
            syncNow: '立即同步',
            syncing: '同步中…',
            pathHint: '直接输入路径（如 ~/Sync/mindwtr）或点击浏览选择',
            webdavUrl: 'WebDAV 地址',
            webdavUsername: '用户名',
            webdavPassword: '密码',
            webdavSave: '保存 WebDAV',
            webdavHint: '请输入同步 JSON 文件的完整 URL（例如 https://example.com/remote.php/dav/files/user/data.json）。',
            lastSync: '上次同步',
            lastSyncNever: '从未同步',
            lastSyncSuccess: '同步完成',
            lastSyncError: '同步失败',
            lastSyncConflict: '已解决冲突',
            lastSyncConflicts: '冲突',
            about: '关于',
            version: '版本',
            developer: '开发者',
            website: '网站',
            github: 'GitHub',
            license: '许可证',
            checkForUpdates: '检查更新',
            checking: '检查中…',
            upToDate: '您正在使用最新版本！',
            updateAvailable: '有可用更新',
            checkFailed: '检查更新失败',
            download: '下载',
            downloadStarting: '正在打开下载…',
            downloadStarted: '已在浏览器开始下载。',
            downloadFailed: '打开下载链接失败。',
            downloadRecommended: '推荐下载包',
            downloadAURHint: '检测到 Arch：建议使用 AUR 更新',
            changelog: '更新日志',
            noChangelog: '暂无更新日志',
            later: '稍后',
            linuxUpdateHint: 'Linux 上无法自动安装更新。下载后请使用包管理器更新（如 yay -S mindwtr 或 paru -S mindwtr），或安装下载的包。',
            saved: '设置已保存',
            selectSyncFolderTitle: '选择同步文件夹',
            system: '系统',
            light: '浅色',
            dark: '深色',
        },
    } as const;

    type Labels = Record<keyof typeof labels.en, string>;
    const translateLabels = (lang: Language): Labels => {
        const entries = Object.entries(labels.en).map(([key, value]) => [
            key,
            translateText(value, lang),
        ]);
        return Object.fromEntries(entries) as Labels;
    };
    const labelsByLanguage: Record<Language, Labels> = {
        en: labels.en,
        zh: labels.zh,
        es: translateLabels('es'),
        hi: translateLabels('hi'),
        ar: translateLabels('ar'),
        de: translateLabels('de'),
        ru: translateLabels('ru'),
        ja: translateLabels('ja'),
        fr: translateLabels('fr'),
        pt: translateLabels('pt'),
        ko: translateLabels('ko'),
        it: translateLabels('it'),
        tr: translateLabels('tr'),
    };

    const t = labelsByLanguage[language] ?? labels.en;
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
                return { label: 'AUR', url: null };
            }
            if (linuxFlavor === 'debian') {
                const asset = findAsset([/\.deb$/i]);
                return { label: '.deb', url: asset?.url ?? null };
            }
            if (linuxFlavor === 'rpm') {
                const asset = findAsset([/\.rpm$/i]);
                return { label: '.rpm', url: asset?.url ?? null };
            }
            const asset = findAsset([/\.AppImage$/i]);
            return { label: '.AppImage', url: asset?.url ?? null };
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
    const lastSyncStats = settings?.lastSyncStats;
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

    const pageTitle = page === 'gtd'
        ? t.gtd
        : page === 'notifications'
            ? t.notifications
            : page === 'ai'
                ? t.ai
            : page === 'sync'
                ? t.sync
                : page === 'calendar'
                    ? t.calendar
                    : page === 'about'
                        ? t.about
                        : t.general;

    const navItems: Array<{
        id: SettingsPage;
        icon: ComponentType<{ className?: string }>;
        label: string;
        description?: string;
    }> = [
        { id: 'main', icon: Monitor, label: t.general, description: `${t.appearance} • ${t.language} • ${t.keybindings}` },
        { id: 'gtd', icon: ListChecks, label: t.gtd, description: t.gtdDesc },
        { id: 'notifications', icon: Bell, label: t.notifications },
        { id: 'sync', icon: Database, label: t.sync },
        { id: 'ai', icon: Sparkles, label: t.ai, description: t.aiDesc },
        { id: 'calendar', icon: CalendarDays, label: t.calendar },
        { id: 'about', icon: Info, label: t.about },
    ];

    const renderPage = () => {
        if (page === 'main') {
            return (
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-lg divide-y divide-border">
                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.appearance}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.system} / {t.light} / {t.dark}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Monitor className="w-4 h-4 text-muted-foreground" />
                                <select
                                    value={themeMode}
                                    onChange={(e) => saveThemePreference(e.target.value as ThemeMode)}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="system">{t.system}</option>
                                    <option value="light">{t.light}</option>
                                    <option value="dark">{t.dark}</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.language}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    {LANGUAGES.find(l => l.id === language)?.native ?? language}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Check className="w-4 h-4 text-muted-foreground" />
                                <select
                                    value={language}
                                    onChange={(e) => saveLanguagePreference(e.target.value as Language)}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {LANGUAGES.map((lang) => (
                                        <option key={lang.id} value={lang.id}>
                                            {lang.native}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.keybindings}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.keybindingsDesc}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <select
                                    value={keybindingStyle}
                                    onChange={(e) => {
                                        setKeybindingStyle(e.target.value as 'vim' | 'emacs');
                                        showSaved();
                                    }}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="vim">{t.keybindingVim}</option>
                                    <option value="emacs">{t.keybindingEmacs}</option>
                                </select>
                                <button
                                    onClick={openHelp}
                                    className="text-sm px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                                >
                                    {t.viewShortcuts}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (page === 'gtd') {
            const autoArchiveOptions = [0, 1, 3, 7, 14, 30, 60];
            const formatArchiveLabel = (days: number) => {
                if (days <= 0) return t.autoArchiveNever;
                const dayLabelMap: Record<Language, string> = {
                    en: 'days',
                    zh: '天',
                    es: 'días',
                    hi: 'दिन',
                    ar: 'أيام',
                    de: translateText('days', 'de'),
                    ru: translateText('days', 'ru'),
                    ja: translateText('days', 'ja'),
                    fr: translateText('days', 'fr'),
                    pt: translateText('days', 'pt'),
                    ko: translateText('days', 'ko'),
                    it: translateText('days', 'it'),
                    tr: translateText('days', 'tr'),
                };
                const label = dayLabelMap[language] ?? 'days';
                return `${days} ${label}`;
            };
            const featureHiddenFields = new Set<TaskEditorFieldId>();
            if (!prioritiesEnabled) featureHiddenFields.add('priority');
            if (!timeEstimatesEnabled) featureHiddenFields.add('timeEstimate');
            const baseTaskEditorOrder: TaskEditorFieldId[] = [
                'status',
                'project',
                'priority',
                'contexts',
                'description',
                'tags',
                'timeEstimate',
                'recurrence',
                'startTime',
                'dueDate',
                'reviewAt',
                'attachments',
                'checklist',
            ];
            const defaultTaskEditorOrder = baseTaskEditorOrder.filter((fieldId) => !featureHiddenFields.has(fieldId));
            const defaultTaskEditorHidden = [...defaultTaskEditorOrder];
            const savedOrder = settings.gtd?.taskEditor?.order ?? [];
            const savedHidden = settings.gtd?.taskEditor?.hidden ?? defaultTaskEditorHidden;
            const taskEditorOrder = [
                ...savedOrder.filter((id) => defaultTaskEditorOrder.includes(id)),
                ...defaultTaskEditorOrder.filter((id) => !savedOrder.includes(id)),
            ];
            const taskEditorDisplayOrder = taskEditorOrder.filter((id) => id !== 'dueDate');
            const hiddenSet = new Set(savedHidden);
            const fieldLabel = (fieldId: TaskEditorFieldId) => {
                switch (fieldId) {
                    case 'status':
                        return t.taskEditorFieldStatus;
                    case 'project':
                        return t.taskEditorFieldProject;
                    case 'priority':
                        return t.taskEditorFieldPriority;
                    case 'contexts':
                        return t.taskEditorFieldContexts;
                    case 'description':
                        return t.taskEditorFieldDescription;
                    case 'tags':
                        return t.taskEditorFieldTags;
                    case 'timeEstimate':
                        return t.taskEditorFieldTimeEstimate;
                    case 'recurrence':
                        return t.taskEditorFieldRecurrence;
                    case 'startTime':
                        return t.taskEditorFieldStartTime;
                    case 'dueDate':
                        return t.taskEditorFieldDueDate;
                    case 'reviewAt':
                        return t.taskEditorFieldReviewAt;
                    case 'attachments':
                        return t.taskEditorFieldAttachments;
                    case 'checklist':
                        return t.taskEditorFieldChecklist;
                    default:
                        return fieldId;
                }
            };
            const saveTaskEditor = (next: { order?: TaskEditorFieldId[]; hidden?: TaskEditorFieldId[] }) => {
                updateSettings({
                    gtd: {
                        ...(settings.gtd ?? {}),
                        taskEditor: {
                            ...(settings.gtd?.taskEditor ?? {}),
                            ...next,
                        },
                    },
                }).then(showSaved).catch(console.error);
            };
            const toggleFieldVisibility = (fieldId: TaskEditorFieldId) => {
                const nextHidden = new Set(hiddenSet);
                if (nextHidden.has(fieldId)) {
                    nextHidden.delete(fieldId);
                } else {
                    nextHidden.add(fieldId);
                }
                saveTaskEditor({ order: taskEditorOrder, hidden: Array.from(nextHidden) });
            };
            const moveField = (fieldId: TaskEditorFieldId, delta: number) => {
                const fromIndex = taskEditorOrder.indexOf(fieldId);
                if (fromIndex === -1) return;
                const toIndex = Math.max(0, Math.min(taskEditorOrder.length - 1, fromIndex + delta));
                if (fromIndex === toIndex) return;
                const nextOrder = [...taskEditorOrder];
                const [moved] = nextOrder.splice(fromIndex, 1);
                nextOrder.splice(toIndex, 0, moved);
                saveTaskEditor({ order: nextOrder, hidden: Array.from(hiddenSet) });
            };

            return (
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-lg divide-y divide-border">
                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.autoArchive}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.autoArchiveDesc}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <select
                                    value={autoArchiveDays}
                                    onChange={(e) => {
                                        const value = Number.parseInt(e.target.value, 10);
                                        updateSettings({
                                            gtd: {
                                                ...(settings.gtd ?? {}),
                                                autoArchiveDays: Number.isFinite(value) ? value : 7,
                                            },
                                        }).then(showSaved).catch(console.error);
                                    }}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {autoArchiveOptions.map((days) => (
                                        <option key={days} value={days}>
                                            {formatArchiveLabel(days)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-lg divide-y divide-border">
                        <div className="p-4">
                            <div className="text-sm font-medium">{t.features}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t.featuresDesc}</div>
                        </div>
                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.featurePriorities}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.featurePrioritiesDesc}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => updateFeatureFlags({ priorities: !prioritiesEnabled })}
                                className={cn(
                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                                    prioritiesEnabled
                                        ? "bg-primary/10 text-primary border-primary ring-1 ring-primary"
                                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {prioritiesEnabled ? t.on : t.off}
                            </button>
                        </div>

                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.featureTimeEstimates}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.featureTimeEstimatesDesc}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => updateFeatureFlags({ timeEstimates: !timeEstimatesEnabled })}
                                className={cn(
                                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                                    timeEstimatesEnabled
                                        ? "bg-primary/10 text-primary border-primary ring-1 ring-primary"
                                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {timeEstimatesEnabled ? t.on : t.off}
                            </button>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium">{t.taskEditorLayout}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.taskEditorLayoutDesc}</div>
                                <div className="text-xs text-muted-foreground">{t.taskEditorLayoutHint}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => saveTaskEditor({ order: [...defaultTaskEditorOrder], hidden: [...defaultTaskEditorHidden] })}
                                className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
                            >
                                {t.taskEditorLayoutReset}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {taskEditorDisplayOrder.map((fieldId, index) => {
                                const isVisible = !hiddenSet.has(fieldId);
                                return (
                                    <div
                                        key={fieldId}
                                        className={cn(
                                            "flex items-center justify-between rounded-md px-3 py-2 border transition-colors cursor-pointer",
                                            isVisible ? "bg-primary/10 border-primary/40" : "bg-muted/30 border-transparent hover:border-border"
                                        )}
                                        onClick={() => toggleFieldVisibility(fieldId)}
                                    >
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className={cn("text-xs uppercase tracking-wide", isVisible ? "text-primary" : "text-muted-foreground")}>
                                                {isVisible ? t.visible : t.hidden}
                                            </span>
                                            <span className={cn(isVisible ? "text-foreground" : "text-muted-foreground")}>
                                                {fieldLabel(fieldId)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    moveField(fieldId, -1);
                                                }}
                                                disabled={index === 0}
                                                className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors disabled:opacity-40"
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    moveField(fieldId, 1);
                                                }}
                                                disabled={index === taskEditorDisplayOrder.length - 1}
                                                className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors disabled:opacity-40"
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        if (page === 'ai') {
            return (
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-lg divide-y divide-border">
                        <div className="p-4 flex items-center justify-between gap-6">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t.aiEnable}</div>
                                <div className="text-xs text-muted-foreground mt-1">{t.aiDesc}</div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={aiEnabled}
                                onClick={() => updateAISettings({ enabled: !aiEnabled })}
                                className={cn(
                                    "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
                                    aiEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                        aiEnabled ? "translate-x-4" : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between gap-4">
                                <div className="text-sm font-medium">{t.aiProvider}</div>
                                <select
                                    value={aiProvider}
                                    onChange={(e) => updateAISettings({
                                        provider: e.target.value as AIProviderId,
                                        model: getDefaultAIConfig(e.target.value as AIProviderId).model,
                                        copilotModel: getDefaultCopilotModel(e.target.value as AIProviderId),
                                        thinkingBudget: getDefaultAIConfig(e.target.value as AIProviderId).thinkingBudget,
                                    })}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="openai">{t.aiProviderOpenAI}</option>
                                    <option value="gemini">{t.aiProviderGemini}</option>
                                    <option value="anthropic">{t.aiProviderAnthropic}</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <div className="text-sm font-medium">{t.aiModel}</div>
                                <select
                                    value={aiModel}
                                    onChange={(e) => updateAISettings({ model: e.target.value })}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {aiModelOptions.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-sm font-medium">{t.aiCopilotModel}</div>
                                    <div className="text-xs text-muted-foreground">{t.aiCopilotHint}</div>
                                </div>
                                <select
                                    value={aiCopilotModel}
                                    onChange={(e) => updateAISettings({ copilotModel: e.target.value })}
                                    className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {aiCopilotOptions.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {aiProvider === 'openai' && (
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-sm font-medium">{t.aiReasoning}</div>
                                        <div className="text-xs text-muted-foreground">{t.aiReasoningHint}</div>
                                    </div>
                                    <select
                                        value={aiReasoningEffort}
                                        onChange={(e) => updateAISettings({ reasoningEffort: e.target.value as AIReasoningEffort })}
                                        className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    >
                                        <option value="low">{t.aiEffortLow}</option>
                                        <option value="medium">{t.aiEffortMedium}</option>
                                        <option value="high">{t.aiEffortHigh}</option>
                                    </select>
                                </div>
                            )}

                            {aiProvider === 'anthropic' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-medium">{t.aiThinkingEnable}</div>
                                            <div className="text-xs text-muted-foreground">{t.aiThinkingEnableDesc}</div>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={anthropicThinkingEnabled}
                                            onClick={() => updateAISettings({
                                                thinkingBudget: anthropicThinkingEnabled
                                                    ? 0
                                                    : (DEFAULT_ANTHROPIC_THINKING_BUDGET || 1024),
                                            })}
                                            className={cn(
                                                "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
                                                anthropicThinkingEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                                    anthropicThinkingEnabled ? "translate-x-4" : "translate-x-1"
                                                )}
                                            />
                                        </button>
                                    </div>
                                    {anthropicThinkingEnabled && (
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-sm font-medium">{t.aiThinkingBudget}</div>
                                                <div className="text-xs text-muted-foreground">{t.aiThinkingHint}</div>
                                            </div>
                                            <select
                                                value={String(aiThinkingBudget)}
                                                onChange={(e) => updateAISettings({ thinkingBudget: Number(e.target.value) })}
                                                className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                            >
                                                {anthropicThinkingOptions.map((option) => (
                                                    <option key={option.value} value={String(option.value)}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {aiProvider === 'gemini' && (
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-sm font-medium">{t.aiThinkingBudget}</div>
                                        <div className="text-xs text-muted-foreground">{t.aiThinkingHint}</div>
                                    </div>
                                    <select
                                        value={String(aiThinkingBudget)}
                                        onChange={(e) => updateAISettings({ thinkingBudget: Number(e.target.value) })}
                                        className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    >
                                        <option value="0">{t.aiThinkingOff}</option>
                                        <option value="128">{t.aiThinkingLow}</option>
                                        <option value="256">{t.aiThinkingMedium}</option>
                                        <option value="512">{t.aiThinkingHigh}</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="p-4 space-y-2">
                            <div className="text-sm font-medium">{t.aiApiKey}</div>
                            <input
                                type="password"
                                value={aiApiKey}
                                onChange={(e) => {
                                    setAiApiKey(e.target.value);
                                    saveAIKey(aiProvider, e.target.value);
                                }}
                                placeholder={t.aiApiKey}
                                className="w-full text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <div className="text-xs text-muted-foreground">{t.aiApiKeyHint}</div>
                        </div>
                    </div>
                </div>
            );
        }

        if (page === 'notifications') {
            return (
                <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                    <p className="text-sm text-muted-foreground">{t.notificationsDesc}</p>

                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium">{t.notificationsEnable}</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={notificationsEnabled}
                            onClick={() => updateSettings({ notificationsEnabled: !notificationsEnabled }).then(showSaved).catch(console.error)}
                            className={cn(
                                "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
                                notificationsEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                            )}
                        >
                            <span
                                className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                    notificationsEnabled ? "translate-x-4" : "translate-x-1"
                                )}
                            />
                        </button>
                    </div>

                    <div className="border-t border-border/50"></div>

                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium">{t.weeklyReview}</p>
                            <p className="text-xs text-muted-foreground mt-1">{t.weeklyReviewDesc}</p>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium">{t.weeklyReview}</div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={weeklyReviewEnabled}
                                onClick={() => updateSettings({ weeklyReviewEnabled: !weeklyReviewEnabled }).then(showSaved).catch(console.error)}
                                disabled={!notificationsEnabled}
                                className={cn(
                                    "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50",
                                    weeklyReviewEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                        weeklyReviewEnabled ? "translate-x-4" : "translate-x-1"
                                    )}
                                />
                            </button>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium">{t.weeklyReviewDay}</div>
                            <select
                                value={weeklyReviewDay}
                                disabled={!notificationsEnabled || !weeklyReviewEnabled}
                                onChange={(e) => updateSettings({ weeklyReviewDay: Number(e.target.value) }).then(showSaved).catch(console.error)}
                                className="bg-muted px-2 py-1 rounded text-sm border border-border disabled:opacity-50"
                            >
                                {weekdayOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium">{t.weeklyReviewTime}</div>
                            <input
                                type="time"
                                value={weeklyReviewTime}
                                disabled={!notificationsEnabled || !weeklyReviewEnabled}
                                onChange={(e) => updateSettings({ weeklyReviewTime: e.target.value }).then(showSaved).catch(console.error)}
                                className="bg-muted px-2 py-1 rounded text-sm border border-border disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div className="border-t border-border/50"></div>

                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium">{t.dailyDigest}</p>
                            <p className="text-xs text-muted-foreground mt-1">{t.dailyDigestDesc}</p>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium">{t.dailyDigestMorning}</div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="time"
                                    value={dailyDigestMorningTime}
                                    disabled={!notificationsEnabled || !dailyDigestMorningEnabled}
                                    onChange={(e) => updateSettings({ dailyDigestMorningTime: e.target.value }).then(showSaved).catch(console.error)}
                                    className="bg-muted px-2 py-1 rounded text-sm border border-border disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={dailyDigestMorningEnabled}
                                    onClick={() => updateSettings({ dailyDigestMorningEnabled: !dailyDigestMorningEnabled }).then(showSaved).catch(console.error)}
                                    disabled={!notificationsEnabled}
                                    className={cn(
                                        "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50",
                                        dailyDigestMorningEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                            dailyDigestMorningEnabled ? "translate-x-4" : "translate-x-1"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="text-sm font-medium">{t.dailyDigestEvening}</div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="time"
                                    value={dailyDigestEveningTime}
                                    disabled={!notificationsEnabled || !dailyDigestEveningEnabled}
                                    onChange={(e) => updateSettings({ dailyDigestEveningTime: e.target.value }).then(showSaved).catch(console.error)}
                                    className="bg-muted px-2 py-1 rounded text-sm border border-border disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={dailyDigestEveningEnabled}
                                    onClick={() => updateSettings({ dailyDigestEveningEnabled: !dailyDigestEveningEnabled }).then(showSaved).catch(console.error)}
                                    disabled={!notificationsEnabled}
                                    className={cn(
                                        "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50",
                                        dailyDigestEveningEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                            dailyDigestEveningEnabled ? "translate-x-4" : "translate-x-1"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (page === 'calendar') {
            const persistCalendars = async (next: ExternalCalendarSubscription[]) => {
                setCalendarError(null);
                setExternalCalendars(next);
                try {
                    await ExternalCalendarService.setCalendars(next);
                    showSaved();
                } catch (error) {
                    console.error(error);
                    setCalendarError(String(error));
                }
            };

            return (
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                        <p className="text-sm text-muted-foreground">{t.calendarDesc}</p>

                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <div className="text-sm font-medium">{t.calendarName}</div>
                                <input
                                    value={newCalendarName}
                                    onChange={(e) => setNewCalendarName(e.target.value)}
                                    placeholder={t.calendarName}
                                    className="w-full text-sm px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-sm font-medium">{t.calendarUrl}</div>
                                <input
                                    value={newCalendarUrl}
                                    onChange={(e) => setNewCalendarUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full text-sm px-3 py-2 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <button
                                disabled={!newCalendarUrl.trim()}
                                onClick={() => {
                                    const url = newCalendarUrl.trim();
                                    if (!url) return;
                                    const name = (newCalendarName.trim() || 'Calendar').trim();
                                    const next = [
                                        ...externalCalendars,
                                        { id: generateUUID(), name, url, enabled: true },
                                    ];
                                    setNewCalendarName('');
                                    setNewCalendarUrl('');
                                    persistCalendars(next);
                                }}
                                className={cn(
                                    "text-sm px-3 py-2 rounded-md transition-colors",
                                    newCalendarUrl.trim()
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                        : "bg-muted text-muted-foreground cursor-not-allowed"
                                )}
                            >
                                {t.calendarAdd}
                            </button>
                            {calendarError && (
                                <div className="text-xs text-red-400">{calendarError}</div>
                            )}
                        </div>
                    </div>

                    {externalCalendars.length > 0 && (
                        <div className="bg-card border border-border rounded-lg overflow-hidden">
                            <div className="px-4 py-3 text-sm font-medium border-b border-border">{t.externalCalendars}</div>
                            <div className="divide-y divide-border">
                                {externalCalendars.map((calendar) => (
                                    <div key={calendar.id} className="p-4 flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">{calendar.name}</div>
                                            <div className="text-xs text-muted-foreground truncate mt-1">{maskCalendarUrl(calendar.url)}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={calendar.enabled}
                                                onChange={(e) => {
                                                    const next = externalCalendars.map((c) => c.id === calendar.id ? { ...c, enabled: e.target.checked } : c);
                                                    persistCalendars(next);
                                                }}
                                                className="h-4 w-4 accent-blue-600"
                                            />
                                            <button
                                                onClick={() => {
                                                    const next = externalCalendars.filter((c) => c.id !== calendar.id);
                                                    persistCalendars(next);
                                                }}
                                                className="text-sm text-red-400 hover:text-red-300"
                                            >
                                                {t.calendarRemove}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        if (page === 'sync') {
            return (
                <div className="space-y-8">
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Database className="w-5 h-5" />
                            {t.localData}
                        </h2>
                        <div className="bg-card border border-border rounded-lg p-6 space-y-3">
                            <p className="text-sm text-muted-foreground">{isTauriRuntime() ? t.localDataDesc : t.webDataDesc}</p>
                            {isTauriRuntime() && dataPath && (
                                <div className="space-y-2 text-sm">
                                    {dbPath && (
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-muted-foreground">mindwtr.db</span>
                                            <span className="font-mono text-xs break-all">{dbPath}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-muted-foreground">data.json (backup)</span>
                                        <span className="font-mono text-xs break-all">{dataPath}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-muted-foreground">config.toml</span>
                                        <span className="font-mono text-xs break-all">{configPath}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {isTauriRuntime() && (
                        <section className="space-y-3">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Info className="w-5 h-5" />
                                {t.diagnostics}
                            </h2>
                            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                                <p className="text-sm text-muted-foreground">{t.diagnosticsDesc}</p>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium">{t.debugLogging}</p>
                                        <p className="text-xs text-muted-foreground">{t.debugLoggingDesc}</p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={loggingEnabled}
                                        onClick={toggleLogging}
                                        className={cn(
                                            "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
                                            loggingEnabled ? "bg-primary border-primary" : "bg-muted/50 border-border"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                                loggingEnabled ? "translate-x-4" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>
                                {loggingEnabled && logPath && (
                                    <div className="text-xs text-muted-foreground">
                                        <span className="font-medium">{t.logFile}:</span>{' '}
                                        <span className="font-mono break-all">{logPath}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleClearLog}
                                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
                                    >
                                        {t.clearLog}
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <RefreshCw className="w-5 h-5" />
                            {t.sync}
                        </h2>

                        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                            <p className="text-sm text-muted-foreground">{t.syncDescription}</p>

                            <div className="flex items-center justify-between gap-4">
                                <span className="text-sm font-medium">{t.syncBackend}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleSetSyncBackend('file')}
                                        className={cn(
                                            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                                            syncBackend === 'file'
                                                ? "bg-primary/10 text-primary border-primary ring-1 ring-primary"
                                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                                        )}
                                    >
                                        {t.syncBackendFile}
                                    </button>
                                    <button
                                        onClick={() => handleSetSyncBackend('webdav')}
                                        className={cn(
                                            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                                            syncBackend === 'webdav'
                                                ? "bg-primary/10 text-primary border-primary ring-1 ring-primary"
                                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                                        )}
                                    >
                                        {t.syncBackendWebdav}
                                    </button>
                                </div>
                            </div>

                            {syncBackend === 'file' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">{t.syncFolderLocation}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={syncPath}
                                            onChange={(e) => setSyncPath(e.target.value)}
                                            placeholder="/path/to/your/sync/folder"
                                            className="flex-1 bg-muted p-2 rounded text-sm font-mono border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button
                                            onClick={async () => {
                                                if (syncPath.trim()) {
                                                    const result = await SyncService.setSyncPath(syncPath.trim());
                                                    if (result.success) {
                                                        showSaved();
                                                    }
                                                }
                                            }}
                                            disabled={!syncPath.trim() || !isTauriRuntime()}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
                                        >
                                            {t.savePath}
                                        </button>
                                        <button
                                            onClick={handleChangeSyncLocation}
                                            disabled={!isTauriRuntime()}
                                            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/90 whitespace-nowrap disabled:opacity-50"
                                        >
                                            {t.browse}
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{t.pathHint}</p>
                                </div>
                            )}

                            {syncBackend === 'webdav' && (
                                <div className="space-y-3">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium">{t.webdavUrl}</label>
                                        <input
                                            type="text"
                                            value={webdavUrl}
                                            onChange={(e) => setWebdavUrl(e.target.value)}
                                            placeholder="https://example.com/remote.php/dav/files/user/data.json"
                                            className="bg-muted p-2 rounded text-sm font-mono border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="text-xs text-muted-foreground">{t.webdavHint}</p>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-2">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-medium">{t.webdavUsername}</label>
                                            <input
                                                type="text"
                                                value={webdavUsername}
                                                onChange={(e) => setWebdavUsername(e.target.value)}
                                                className="bg-muted p-2 rounded text-sm border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-medium">{t.webdavPassword}</label>
                                            <input
                                                type="password"
                                                value={webdavPassword}
                                                onChange={(e) => setWebdavPassword(e.target.value)}
                                                className="bg-muted p-2 rounded text-sm border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleSaveWebDav}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
                                        >
                                            {t.webdavSave}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(syncBackend === 'webdav'
                                ? !!webdavUrl.trim()
                                : !!syncPath.trim()) && (
                                <div className="pt-2 flex items-center gap-3">
                                    <button
                                        onClick={handleSync}
                                        disabled={isSyncing}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors",
                                            isSyncing ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700",
                                        )}
                                    >
                                        <ExternalLink className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                                        {isSyncing ? t.syncing : t.syncNow}
                                    </button>
                                    {syncError && <span className="text-xs text-destructive">{syncError}</span>}
                                </div>
                            )}

                            <div className="pt-3 text-xs text-muted-foreground space-y-1">
                                <div>
                                    {t.lastSync}: {lastSyncDisplay}
                                    {lastSyncStatus === 'success' && ` • ${t.lastSyncSuccess}`}
                                    {lastSyncStatus === 'conflict' && ` • ${t.lastSyncConflict}`}
                                    {lastSyncStatus === 'error' && ` • ${t.lastSyncError}`}
                                </div>
                                {lastSyncStats && (
                                    <div>
                                        {t.lastSyncConflicts}: {conflictCount} • Tasks {lastSyncStats.tasks.mergedTotal} /
                                        Projects {lastSyncStats.projects.mergedTotal}
                                    </div>
                                )}
                                {lastSyncStatus === 'error' && settings?.lastSyncError && (
                                    <div className="text-destructive">{settings.lastSyncError}</div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            );
        }

        if (page === 'about') {
            return (
                <div className="bg-muted/30 rounded-lg p-6 space-y-4 border border-border">
                    <div className="space-y-1">
                        <div className="text-sm font-medium">{t.localData}</div>
                        <div className="text-xs text-muted-foreground">
                            {isTauriRuntime() ? t.localDataDesc : t.webDataDesc}
                        </div>
                    </div>
                    {isTauriRuntime() && (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {dbPath && (
                                <div className="space-y-1">
                                    <div className="text-xs font-medium text-muted-foreground">mindwtr.db</div>
                                    <div className="text-xs font-mono bg-muted/60 border border-border rounded px-2 py-1 break-all">
                                        {dbPath}
                                    </div>
                                </div>
                            )}
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">data.json (backup)</div>
                                <div className="text-xs font-mono bg-muted/60 border border-border rounded px-2 py-1 break-all">
                                    {dataPath}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">config.toml</div>
                                <div className="text-xs font-mono bg-muted/60 border border-border rounded px-2 py-1 break-all">
                                    {configPath}
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="border-t border-border/50"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.version}</span>
                        <span className="font-mono bg-muted px-2 py-1 rounded text-sm">v{appVersion}</span>
                    </div>
                    <div className="border-t border-border/50"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.developer}</span>
                        <span className="font-medium">dongdongbh</span>
                    </div>
                    <div className="border-t border-border/50"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.license}</span>
                        <span className="font-medium">MIT</span>
                    </div>
                    <div className="border-t border-border/50"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.website}</span>
                        <button onClick={() => openLink('https://dongdongbh.tech')} className="text-primary hover:underline flex items-center gap-1">
                            dongdongbh.tech
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="border-t border-border/50"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.github}</span>
                        <button
                            onClick={() => openLink('https://github.com/dongdongbh/Mindwtr')}
                            className="text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                            github.com/dongdongbh/Mindwtr
                            <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="border-t border-border/50"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.checkForUpdates}</span>
                        <button
                            onClick={handleCheckUpdates}
                            disabled={isCheckingUpdate}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                                isCheckingUpdate
                                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                            )}
                        >
                            <RefreshCw className={cn("w-4 h-4", isCheckingUpdate && "animate-spin")} />
                            {isCheckingUpdate ? t.checking : t.checkForUpdates}
                        </button>
                    </div>
                    {updateError && (
                        <>
                            <div className="border-t border-border/50"></div>
                            <div className="text-red-500 text-sm">{t.checkFailed}</div>
                        </>
                    )}
                    {updateNotice && !updateError && (
                        <>
                            <div className="border-t border-border/50"></div>
                            <div className="text-sm text-muted-foreground">{updateNotice}</div>
                        </>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-6xl p-8">
                <div className="grid grid-cols-12 gap-6">
                    <aside className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-4">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
                            <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
                        </div>
                        <nav className="bg-card border border-border rounded-lg p-1">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = item.id === page;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setPage(item.id)}
                                        className={cn(
                                            "w-full flex items-start gap-3 px-3 py-2 rounded-md text-left transition-colors",
                                            isActive
                                                ? "bg-primary/10 text-primary"
                                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                        )}
                                    >
                                        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium leading-5">{item.label}</div>
                                            {item.description && (
                                                <div className={cn("text-xs mt-0.5", isActive ? "text-primary/80" : "text-muted-foreground")}>
                                                    {item.description}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

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

            {showUpdateModal && updateInfo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-border">
                            <h3 className="text-xl font-semibold text-green-500 flex items-center gap-2">{t.updateAvailable}</h3>
                            <p className="text-muted-foreground mt-1">
                                v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
                            </p>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            <h4 className="font-medium mb-2">{t.changelog}</h4>
                            <div className="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
                                {updateInfo.releaseNotes || t.noChangelog}
                            </div>
                            {recommendedDownload && (
                                <div className="mt-4 text-xs text-muted-foreground">
                                    {t.downloadRecommended}: {recommendedDownload.label}
                                    {!recommendedDownload.url && linuxFlavor === 'arch' && (
                                        <span className="ml-1">• {t.downloadAURHint}</span>
                                    )}
                                </div>
                            )}
                            {(isDownloadingUpdate || downloadNotice) && (
                                <div className="mt-4 space-y-2">
                                    {downloadNotice && (
                                        <div className="text-xs text-muted-foreground">{downloadNotice}</div>
                                    )}
                                    {isDownloadingUpdate && (
                                        <div className="h-2 w-full rounded bg-muted">
                                            <div className="h-2 w-1/2 rounded bg-green-500 animate-pulse"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-border flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowUpdateModal(false);
                                    setIsDownloadingUpdate(false);
                                    setDownloadNotice(null);
                                }}
                                disabled={isDownloadingUpdate}
                                className="px-4 py-2 rounded-md text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
                            >
                                {t.later}
                            </button>
                            <button
                                onClick={handleDownloadUpdate}
                                disabled={isDownloadingUpdate || !canDownloadUpdate}
                                className={cn(
                                    "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                                    isDownloadingUpdate || !canDownloadUpdate
                                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                                        : "bg-green-600 text-white hover:bg-green-700"
                                )}
                            >
                                <ExternalLink className="w-4 h-4" />
                                {isDownloadingUpdate ? t.downloadStarting : t.download}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
