import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import Constants from 'expo-constants';
import {
    View,
    Text,
    TextInput,
    Switch,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Linking,
    Alert,
    ActivityIndicator,
    BackHandler,
    Platform,
    KeyboardAvoidingView,
    Modal,
    Pressable,
} from 'react-native';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useNavigation, useRouter } from 'expo-router';
import { useTheme } from '../../contexts/theme-context';
import { useLanguage, Language } from '../../contexts/language-context';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
    DEFAULT_REASONING_EFFORT,
    DEFAULT_ANTHROPIC_THINKING_BUDGET,
    DEFAULT_GEMINI_THINKING_BUDGET,
    generateUUID,
    getDefaultAIConfig,
    getDefaultCopilotModel,
    getCopilotModelOptions,
    getModelOptions,
    translateText,
    type AIProviderId,
    type AIReasoningEffort,
    type AppData,
    type ExternalCalendarSubscription,
    type TaskEditorFieldId,
    type TimeEstimate,
    useTaskStore,
} from '@mindwtr/core';
import { pickAndParseSyncFile, pickAndParseSyncFolder, exportData } from '../../lib/storage-file';
import { fetchExternalCalendarEvents, getExternalCalendars, saveExternalCalendars } from '../../lib/external-calendar';
import { loadAIKey, saveAIKey } from '../../lib/ai-config';
import { clearLog, ensureLogFilePath, logError, logInfo, logWarn } from '../../lib/app-log';
import { performMobileSync } from '../../lib/sync-service';
import { requestNotificationPermission, startMobileNotifications } from '../../lib/notification-service';
import {
    SYNC_PATH_KEY,
    SYNC_BACKEND_KEY,
    WEBDAV_URL_KEY,
    WEBDAV_USERNAME_KEY,
    WEBDAV_PASSWORD_KEY,
    CLOUD_URL_KEY,
    CLOUD_TOKEN_KEY,
} from '../../lib/sync-constants';

type SettingsScreen =
    | 'main'
    | 'general'
    | 'notifications'
    | 'ai'
    | 'calendar'
    | 'advanced'
    | 'gtd'
    | 'gtd-archive'
    | 'gtd-time-estimates'
    | 'gtd-task-editor'
    | 'sync'
    | 'about';

const LANGUAGES: { id: Language; native: string }[] = [
    { id: 'en', native: 'English' },
    { id: 'zh', native: '中文' },
    { id: 'es', native: 'Español' },
    { id: 'hi', native: 'हिन्दी' },
    { id: 'ar', native: 'العربية' },
    { id: 'de', native: 'Deutsch' },
    { id: 'ru', native: 'Русский' },
    { id: 'ja', native: '日本語' },
    { id: 'fr', native: 'Français' },
    { id: 'pt', native: 'Português' },
    { id: 'ko', native: '한국어' },
    { id: 'it', native: 'Italiano' },
    { id: 'tr', native: 'Türkçe' },
];

const WHISPER_MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const WHISPER_MODELS: Array<{ id: string; fileName: string; label: string }> = [
    { id: 'whisper-tiny', fileName: 'ggml-tiny.bin', label: 'whisper-tiny' },
    { id: 'whisper-tiny.en', fileName: 'ggml-tiny.en.bin', label: 'whisper-tiny.en' },
    { id: 'whisper-base', fileName: 'ggml-base.bin', label: 'whisper-base' },
    { id: 'whisper-base.en', fileName: 'ggml-base.en.bin', label: 'whisper-base.en' },
];
const DEFAULT_WHISPER_MODEL = WHISPER_MODELS[0]?.id ?? 'whisper-tiny';
const UPDATE_BADGE_AVAILABLE_KEY = 'mindwtr-update-available';
const UPDATE_BADGE_LAST_CHECK_KEY = 'mindwtr-update-last-check';
const UPDATE_BADGE_LATEST_KEY = 'mindwtr-update-latest';
const UPDATE_BADGE_INTERVAL_MS = 1000 * 60 * 60 * 24;

const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));

const compareVersions = (v1: string, v2: string): number => {
    const clean1 = v1.replace(/^v/, '');
    const clean2 = v2.replace(/^v/, '');
    const parts1 = clean1.split('.').map(Number);
    const parts2 = clean2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i += 1) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
};

const buildSettingsExtra = (message?: string, error?: unknown): Record<string, string> | undefined => {
    const extra: Record<string, string> = {};
    if (message) extra.message = message;
    if (error) extra.error = formatError(error);
    return Object.keys(extra).length ? extra : undefined;
};

const logSettingsWarn = (messageOrError: unknown, error?: unknown) => {
    if (typeof messageOrError === 'string') {
        void logWarn(messageOrError, { scope: 'settings', extra: buildSettingsExtra(undefined, error) });
        return;
    }
    void logWarn('Settings warning', { scope: 'settings', extra: buildSettingsExtra(undefined, messageOrError) });
};

const logSettingsError = (messageOrError: unknown, error?: unknown) => {
    if (typeof messageOrError === 'string') {
        const err = error instanceof Error ? error : new Error(messageOrError);
        void logError(err, { scope: 'settings', extra: buildSettingsExtra(messageOrError, error) });
        return;
    }
    void logError(messageOrError, { scope: 'settings', extra: buildSettingsExtra(undefined, messageOrError) });
};

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

const formatClockSkew = (ms: number): string => {
    if (!Number.isFinite(ms) || ms <= 0) return '0 ms';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
    const minutes = seconds / 60;
    return `${minutes.toFixed(1)} min`;
};

const isValidHttpUrl = (value: string): boolean => {
    if (!value.trim()) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

export default function SettingsPage() {
    const navigation = useNavigation();
    const router = useRouter();
    const { themeMode, setThemeMode } = useTheme();
    const { language, setLanguage, t } = useLanguage();
    const localize = (enText: string, zhText?: string) =>
        language === 'zh' && zhText ? zhText : translateText(enText, language);
    const { tasks, projects, sections, areas, settings, updateSettings } = useTaskStore();
    const [isSyncing, setIsSyncing] = useState(false);
    const [currentScreen, setCurrentScreen] = useState<SettingsScreen>('main');
    const [syncPath, setSyncPath] = useState<string | null>(null);
    const [syncBackend, setSyncBackend] = useState<'file' | 'webdav' | 'cloud' | 'off'>('off');
    const [webdavUrl, setWebdavUrl] = useState('');
    const [webdavUsername, setWebdavUsername] = useState('');
    const [webdavPassword, setWebdavPassword] = useState('');
    const [cloudUrl, setCloudUrl] = useState('');
    const [cloudToken, setCloudToken] = useState('');
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [hasUpdateBadge, setHasUpdateBadge] = useState(false);
    const [digestTimePicker, setDigestTimePicker] = useState<'morning' | 'evening' | null>(null);
    const [weeklyReviewTimePicker, setWeeklyReviewTimePicker] = useState(false);
    const [weeklyReviewDayPickerOpen, setWeeklyReviewDayPickerOpen] = useState(false);
    const [modelPicker, setModelPicker] = useState<null | 'model' | 'copilot' | 'speech'>(null);
    const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
    const [weekStartPickerOpen, setWeekStartPickerOpen] = useState(false);
    const [syncOptionsOpen, setSyncOptionsOpen] = useState(false);
    const [syncHistoryExpanded, setSyncHistoryExpanded] = useState(false);
    const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSubscription[]>([]);
    const [newCalendarName, setNewCalendarName] = useState('');
    const [newCalendarUrl, setNewCalendarUrl] = useState('');
    const [aiApiKey, setAiApiKey] = useState('');
    const [speechApiKey, setSpeechApiKey] = useState('');
    const [whisperDownloadState, setWhisperDownloadState] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
    const [whisperDownloadError, setWhisperDownloadError] = useState('');
    const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
    const [speechOpen, setSpeechOpen] = useState(false);

    const tc = useThemeColors();
    const insets = useSafeAreaInsets();
    const isExpoGo = Constants.appOwnership === 'expo';
    const currentVersion = Constants.expoConfig?.version || '0.0.0';
    const notificationsEnabled = settings.notificationsEnabled !== false;
    const dailyDigestMorningEnabled = settings.dailyDigestMorningEnabled === true;
    const dailyDigestEveningEnabled = settings.dailyDigestEveningEnabled === true;
    const dailyDigestMorningTime = settings.dailyDigestMorningTime || '09:00';
    const dailyDigestEveningTime = settings.dailyDigestEveningTime || '20:00';
    const weeklyReviewEnabled = settings.weeklyReviewEnabled === true;
    const weeklyReviewTime = settings.weeklyReviewTime || '18:00';
    const weeklyReviewDay = Number.isFinite(settings.weeklyReviewDay) ? settings.weeklyReviewDay as number : 0;
    const weekStart = settings.weekStart === 'monday' ? 'monday' : 'sunday';
    const loggingEnabled = settings.diagnostics?.loggingEnabled === true;
    const lastSyncStats = settings.lastSyncStats ?? null;
    const syncConflictCount = (lastSyncStats?.tasks.conflicts || 0) + (lastSyncStats?.projects.conflicts || 0);
    const maxClockSkewMs = Math.max(lastSyncStats?.tasks.maxClockSkewMs || 0, lastSyncStats?.projects.maxClockSkewMs || 0);
    const timestampAdjustments = (lastSyncStats?.tasks.timestampAdjustments || 0) + (lastSyncStats?.projects.timestampAdjustments || 0);
    const conflictIds = [
        ...(lastSyncStats?.tasks.conflictIds ?? []),
        ...(lastSyncStats?.projects.conflictIds ?? []),
    ].slice(0, 6);
    const syncPreferences = settings.syncPreferences ?? {};
    const syncAppearanceEnabled = syncPreferences.appearance === true;
    const syncLanguageEnabled = syncPreferences.language === true;
    const syncExternalCalendarsEnabled = syncPreferences.externalCalendars === true;
    const syncAiEnabled = syncPreferences.ai === true;
    const syncHistory = settings.lastSyncHistory ?? [];
    const syncHistoryEntries = syncHistory.slice(0, 5);
    const webdavUrlError = webdavUrl.trim() ? !isValidHttpUrl(webdavUrl.trim()) : false;
    const cloudUrlError = cloudUrl.trim() ? !isValidHttpUrl(cloudUrl.trim()) : false;
    const aiProvider = (settings.ai?.provider ?? 'openai') as AIProviderId;
    const aiEnabled = settings.ai?.enabled === true;
    const aiModel = settings.ai?.model ?? getDefaultAIConfig(aiProvider).model;
    const aiReasoningEffort = (settings.ai?.reasoningEffort ?? DEFAULT_REASONING_EFFORT) as AIReasoningEffort;
    const aiThinkingBudget = settings.ai?.thinkingBudget ?? getDefaultAIConfig(aiProvider).thinkingBudget ?? 0;
    const aiModelOptions = getModelOptions(aiProvider);
    const aiCopilotModel = settings.ai?.copilotModel ?? getDefaultCopilotModel(aiProvider);
    const aiCopilotOptions = getCopilotModelOptions(aiProvider);
    const anthropicThinkingEnabled = aiProvider === 'anthropic' && aiThinkingBudget > 0;
    const speechSettings = settings.ai?.speechToText ?? {};
    const speechEnabled = speechSettings.enabled === true;
    const speechProvider = (speechSettings.provider ?? 'gemini') as 'openai' | 'gemini' | 'whisper';
    const speechModel = speechSettings.model ?? (
        speechProvider === 'openai'
            ? 'gpt-4o-transcribe'
            : speechProvider === 'gemini'
                ? 'gemini-2.5-flash'
                : DEFAULT_WHISPER_MODEL
    );
    const speechLanguage = speechSettings.language ?? 'auto';
    const speechMode = speechSettings.mode ?? 'smart_parse';
    const speechFieldStrategy = speechSettings.fieldStrategy ?? 'smart';
    const speechModelOptions = speechProvider === 'openai'
        ? ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1']
        : speechProvider === 'gemini'
            ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
            : WHISPER_MODELS.map((model) => model.id);
    const defaultTimeEstimatePresets: TimeEstimate[] = ['10min', '30min', '1hr', '2hr', '3hr', '4hr', '4hr+'];
    const timeEstimateOptions: TimeEstimate[] = ['5min', '10min', '15min', '30min', '1hr', '2hr', '3hr', '4hr', '4hr+'];
    const timeEstimatePresets: TimeEstimate[] = (settings.gtd?.timeEstimatePresets?.length
        ? settings.gtd.timeEstimatePresets
        : defaultTimeEstimatePresets) as TimeEstimate[];
    const defaultCaptureMethod = settings.gtd?.defaultCaptureMethod ?? 'text';
    const saveAudioAttachments = settings.gtd?.saveAudioAttachments !== false;
    const inboxProcessing = settings.gtd?.inboxProcessing ?? {};
    const inboxTwoMinuteFirst = inboxProcessing.twoMinuteFirst === true;
    const inboxProjectFirst = inboxProcessing.projectFirst === true;
    const inboxScheduleEnabled = inboxProcessing.scheduleEnabled !== false;
    const autoArchiveDays = Number.isFinite(settings.gtd?.autoArchiveDays)
        ? Math.max(0, Math.floor(settings.gtd?.autoArchiveDays as number))
        : 7;
    const prioritiesEnabled = settings.features?.priorities === true;
    const timeEstimatesEnabled = settings.features?.timeEstimates === true;

    const updateSyncPreferences = (partial: Partial<NonNullable<AppData['settings']['syncPreferences']>>) => {
        updateSettings({ syncPreferences: { ...syncPreferences, ...partial } }).catch(logSettingsError);
    };

    const scrollContentStyle = useMemo(
        () => [styles.scrollContent, { paddingBottom: 16 + insets.bottom }],
        [insets.bottom],
    );
    const scrollContentStyleWithKeyboard = useMemo(
        () => [styles.scrollContent, { paddingBottom: 140 + insets.bottom }],
        [insets.bottom],
    );

    const formatTimeEstimateLabel = (value: TimeEstimate) => {
        if (value === '5min') return '5m';
        if (value === '10min') return '10m';
        if (value === '15min') return '15m';
        if (value === '30min') return '30m';
        if (value === '1hr') return '1h';
        if (value === '2hr') return '2h';
        if (value === '3hr') return '3h';
        if (value === '4hr') return '4h';
        return '4h+';
    };

    const formatTime = (time: string) => time;

    const updateInboxProcessing = (partial: Partial<NonNullable<AppData['settings']['gtd']>['inboxProcessing']>) => {
        updateSettings({
            gtd: {
                ...(settings.gtd ?? {}),
                inboxProcessing: {
                    ...(settings.gtd?.inboxProcessing ?? {}),
                    ...partial,
                },
            },
        }).catch(logSettingsError);
    };
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
    const toTimePickerDate = (time: string) => {
        const [hours, minutes] = time.split(':').map((v) => parseInt(v, 10));
        const date = new Date();
        date.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
        return date;
    };

    const onDigestTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
        const picker = digestTimePicker;
        setDigestTimePicker(null);
        if (!picker || !selected) return;
        const hours = String(selected.getHours()).padStart(2, '0');
        const minutes = String(selected.getMinutes()).padStart(2, '0');
        const value = `${hours}:${minutes}`;
        if (picker === 'morning') {
            updateSettings({ dailyDigestMorningTime: value }).catch(logSettingsError);
        } else {
            updateSettings({ dailyDigestEveningTime: value }).catch(logSettingsError);
        }
    };

    const onWeeklyReviewTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
        setWeeklyReviewTimePicker(false);
        if (!selected) return;
        const hours = String(selected.getHours()).padStart(2, '0');
        const minutes = String(selected.getMinutes()).padStart(2, '0');
        updateSettings({ weeklyReviewTime: `${hours}:${minutes}` }).catch(logSettingsError);
    };

    const getWeekdayLabel = (dayIndex: number) => {
        const base = new Date(2024, 0, 7 + dayIndex);
        return base.toLocaleDateString(locale, { weekday: 'long' });
    };

    const selectWeeklyReviewDay = () => {
        setWeeklyReviewDayPickerOpen(true);
    };

    // Load sync path on mount
    useEffect(() => {
        AsyncStorage.multiGet([
            SYNC_PATH_KEY,
            SYNC_BACKEND_KEY,
            WEBDAV_URL_KEY,
            WEBDAV_USERNAME_KEY,
            WEBDAV_PASSWORD_KEY,
            CLOUD_URL_KEY,
            CLOUD_TOKEN_KEY,
        ]).then((entries) => {
            const entryMap = new Map(entries);
            const path = entryMap.get(SYNC_PATH_KEY);
            const backend = entryMap.get(SYNC_BACKEND_KEY);
            const url = entryMap.get(WEBDAV_URL_KEY);
            const username = entryMap.get(WEBDAV_USERNAME_KEY);
            const password = entryMap.get(WEBDAV_PASSWORD_KEY);
            const cloudSyncUrl = entryMap.get(CLOUD_URL_KEY);
            const cloudSyncToken = entryMap.get(CLOUD_TOKEN_KEY);

            if (path) setSyncPath(path);
            const resolvedBackend = backend === 'webdav' || backend === 'cloud' || backend === 'off' || backend === 'file'
                ? backend
                : 'off';
            setSyncBackend(resolvedBackend);
            if (url) setWebdavUrl(url);
            if (username) setWebdavUsername(username);
            if (password) setWebdavPassword(password);
            if (cloudSyncUrl) setCloudUrl(cloudSyncUrl);
            if (cloudSyncToken) setCloudToken(cloudSyncToken);
        }).catch(logSettingsError);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const stored = await getExternalCalendars();
                if (cancelled) return;
                if (Array.isArray(settings.externalCalendars)) {
                    setExternalCalendars(settings.externalCalendars);
                    if (settings.externalCalendars.length || stored.length) {
                        await saveExternalCalendars(settings.externalCalendars);
                    }
                    return;
                }
                setExternalCalendars(stored);
            } catch (error) {
                logSettingsError(error);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [settings.externalCalendars]);

    useEffect(() => {
        loadAIKey(aiProvider).then(setAiApiKey).catch(logSettingsError);
    }, [aiProvider]);

    useEffect(() => {
        if (speechProvider === 'whisper') {
            setSpeechApiKey('');
            return;
        }
        loadAIKey(speechProvider).then(setSpeechApiKey).catch(logSettingsError);
    }, [speechProvider]);

    const handleSettingsBack = useCallback(() => {
        if (currentScreen !== 'main') {
            if (currentScreen === 'gtd-time-estimates' || currentScreen === 'gtd-task-editor' || currentScreen === 'gtd-archive') {
                setCurrentScreen('gtd');
            } else if (currentScreen === 'ai' || currentScreen === 'calendar') {
                setCurrentScreen('advanced');
            } else {
                setCurrentScreen('main');
            }
            return true;
        }
        return false;
    }, [currentScreen]);

    const handleHeaderBack = useCallback(() => {
        if (handleSettingsBack()) return;
        if (router.canGoBack()) {
            router.back();
        }
    }, [handleSettingsBack, router]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerLeft: (props: HeaderBackButtonProps) => (
                <HeaderBackButton
                    {...props}
                    onPress={handleHeaderBack}
                />
            ),
            headerBackTitleVisible: false,
            headerBackTitle: '',
        });
    }, [navigation, handleHeaderBack]);

    // Handle Android hardware back button
    useEffect(() => {
        const onBackPress = () => handleSettingsBack();
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [handleSettingsBack]);

    const themeOptions: { value: typeof themeMode; label: string }[] = [
        { value: 'system', label: t('settings.system') },
        { value: 'light', label: t('settings.light') },
        { value: 'dark', label: t('settings.dark') },
        { value: 'material3-light', label: t('settings.material3Light') },
        { value: 'material3-dark', label: t('settings.material3Dark') },
        { value: 'eink', label: t('settings.eink') },
        { value: 'nord', label: t('settings.nord') },
        { value: 'sepia', label: t('settings.sepia') },
        { value: 'oled', label: t('settings.oled') },
    ];
    const mapThemeToSetting = (mode: typeof themeMode): AppData['settings']['theme'] => mode;
    const [themePickerOpen, setThemePickerOpen] = useState(false);
    const currentThemeLabel = themeOptions.find((opt) => opt.value === themeMode)?.label ?? t('settings.system');
    const weekStartOptions: { value: 'sunday' | 'monday'; label: string }[] = [
        { value: 'sunday', label: t('settings.weekStartSunday') },
        { value: 'monday', label: t('settings.weekStartMonday') },
    ];
    const currentWeekStartLabel = weekStartOptions.find((opt) => opt.value === weekStart)?.label ?? t('settings.weekStartSunday');
    const openLink = (url: string) => Linking.openURL(url);
    const updateAISettings = (next: Partial<NonNullable<typeof settings.ai>>) => {
        updateSettings({ ai: { ...(settings.ai ?? {}), ...next } }).catch(logSettingsError);
    };
    const updateSpeechSettings = (
        next: Partial<NonNullable<NonNullable<typeof settings.ai>['speechToText']>>
    ) => {
        updateAISettings({ speechToText: { ...(settings.ai?.speechToText ?? {}), ...next } });
    };

    const getWhisperDirectories = () => {
        const candidates: Directory[] = [];
        try {
            candidates.push(new Directory(Paths.cache, 'whisper-models'));
        } catch (error) {
            logSettingsWarn('Whisper cache directory unavailable', error);
        }
        if (!candidates.length) {
            try {
                candidates.push(new Directory(Paths.document, 'whisper-models'));
            } catch (error) {
                logSettingsWarn('Whisper document directory unavailable', error);
            }
        }
        return candidates;
    };

    const getWhisperDirectory = () => {
        const candidates = getWhisperDirectories();
        return candidates.length ? candidates[0] : null;
    };

    const normalizeWhisperPath = (uri: string) => {
        if (uri.startsWith('file://')) return uri;
        if (uri.startsWith('file:/')) {
            const stripped = uri.replace(/^file:\//, '/');
            return `file://${stripped}`;
        }
        if (uri.startsWith('/')) {
            return `file://${uri}`;
        }
        return uri;
    };

    const safePathInfo = (uri: string) => {
        const normalized = normalizeWhisperPath(uri);
        try {
            const info = Paths.info(normalized);
            if (info) return info;
        } catch (error) {
            logSettingsWarn('Whisper path info failed', error);
        }
        try {
            const file = new File(normalized);
            if (file.exists) {
                const size = typeof file.size === 'number' ? file.size : 0;
                return { exists: true, isDirectory: false, size };
            }
        } catch {
        }
        try {
            const dir = new Directory(normalized);
            if (dir.exists) {
                return { exists: true, isDirectory: true, size: 0 };
            }
        } catch {
        }
        return null;
    };

    const resolveWhisperModelPath = (modelId: string) => {
        const model = WHISPER_MODELS.find((entry) => entry.id === modelId);
        if (!model) return undefined;
        const base = getWhisperDirectory();
        if (!base) return undefined;
        const baseUri = base.uri.endsWith('/') ? base.uri : `${base.uri}/`;
        return new File(`${baseUri}${model.fileName}`).uri;
    };

    const findExistingWhisperModelPath = (modelId: string) => {
        const model = WHISPER_MODELS.find((entry) => entry.id === modelId);
        if (!model) return undefined;
        const fileName = model.fileName;
        const candidates: string[] = [];
        const appendCandidates = (base?: string | null) => {
            if (!base) return;
            const normalized = base.endsWith('/') ? base : `${base}/`;
            candidates.push(`${normalized}whisper-models/${fileName}`);
            candidates.push(`${normalized}${fileName}`);
        };
        appendCandidates(Paths.cache?.uri ?? null);
        appendCandidates(Paths.document?.uri ?? null);
        for (const candidate of candidates) {
            try {
                const info = safePathInfo(candidate);
                if (info?.exists && !info.isDirectory) {
                    return candidate;
                }
            } catch {
            }
        }
        return undefined;
    };

    const isWhisperModelFilePath = (uri?: string) => {
        if (!uri) return false;
        const baseName = Paths.basename(uri);
        return Boolean(baseName && baseName.endsWith('.bin'));
    };

    const isWhisperTargetPath = (uri: string, fileName: string) => {
        const baseName = Paths.basename(uri);
        if (baseName !== fileName) return false;
        return uri.includes('/whisper-models/') || uri.includes('\\whisper-models\\');
    };

    const applyWhisperModel = (modelId: string) => {
        updateSpeechSettings({ model: modelId, offlineModelPath: resolveWhisperModelPath(modelId) });
    };

    useEffect(() => {
        if (speechProvider !== 'whisper') return;
        const storedPath = speechSettings.offlineModelPath;
        if (!storedPath) return;
        const info = safePathInfo(storedPath);
        if (info?.exists && info.isDirectory) {
            const resolved = resolveWhisperModelPath(speechModel);
            updateSpeechSettings({ offlineModelPath: resolved });
            return;
        }
        if (!info?.exists || info.isDirectory) {
            const existing = findExistingWhisperModelPath(speechModel);
            if (existing && existing !== storedPath) {
                updateSpeechSettings({ offlineModelPath: existing });
                return;
            }
        }
        if (!isWhisperModelFilePath(storedPath)) {
            const resolved = resolveWhisperModelPath(speechModel);
            if (resolved && resolved !== storedPath) {
                updateSpeechSettings({ offlineModelPath: resolved });
            }
        }
    }, [speechProvider, speechSettings.offlineModelPath, speechModel]);

    const selectedWhisperModel = WHISPER_MODELS.find((model) => model.id === speechModel) ?? WHISPER_MODELS[0];
    const whisperModelPath = speechProvider === 'whisper'
        ? (speechSettings.offlineModelPath ?? resolveWhisperModelPath(speechModel))
        : undefined;
    let whisperDownloaded = false;
    let whisperSizeLabel = '';
    if (whisperModelPath) {
        const info = safePathInfo(whisperModelPath);
        if (info?.exists && info.isDirectory === false) {
            try {
                const file = new File(normalizeWhisperPath(whisperModelPath));
                whisperDownloaded = (file.size ?? 0) > 0;
                if (whisperDownloaded && file.size) {
                    whisperSizeLabel = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
                }
            } catch (error) {
                logSettingsWarn('Whisper file info failed', error);
            }
        }
    }

    const handleDownloadWhisperModel = async () => {
        if (!selectedWhisperModel) return;
        if (isExpoGo) {
            const message = localize(
                'Whisper downloads require a dev build or production build (not Expo Go).',
                'Whisper 下载需要开发版或正式版构建（Expo Go 不支持）。'
            );
            setWhisperDownloadError(message);
            setWhisperDownloadState('error');
            Alert.alert(t('settings.speechOfflineDownloadError'), message);
            return;
        }
        setWhisperDownloadError('');
        setWhisperDownloadState('downloading');
        const clearSuccess = () => {
            setTimeout(() => setWhisperDownloadState('idle'), 2000);
        };
        try {
            const directories = getWhisperDirectories();
            if (!directories.length) {
                throw new Error('Whisper storage unavailable');
            }
            const fileName = selectedWhisperModel.fileName;
            if (!fileName) {
                throw new Error('Whisper model filename missing');
            }
            const url = `${WHISPER_MODEL_BASE_URL}/${fileName}`;
            let lastError: Error | null = null;
            for (const directory of directories) {
                try {
                    directory.create({ intermediates: true, idempotent: true });
                    const dirUri = directory.uri.endsWith('/') ? directory.uri : `${directory.uri}/`;
                    const targetFile = new File(`${dirUri}${fileName}`);
                    try {
                        const entries = directory.list();
                        const conflict = entries.find((entry) => Paths.basename(entry.uri) === fileName);
                        if (conflict instanceof Directory) {
                            conflict.delete();
                        }
                        if (conflict instanceof File) {
                            conflict.delete();
                        }
                    } catch (cleanupError) {
                        logSettingsWarn('Whisper model cleanup failed', cleanupError);
                    }
                    const conflictInfo = safePathInfo(targetFile.uri);
                    if (conflictInfo?.exists && conflictInfo.isDirectory) {
                        if (isWhisperTargetPath(targetFile.uri, fileName)) {
                            try {
                                new Directory(targetFile.uri).delete();
                            } catch (deleteError) {
                                logSettingsWarn('Whisper model directory cleanup failed', deleteError);
                            }
                        }
                    }
                    const postCleanupInfo = safePathInfo(targetFile.uri);
                    if (postCleanupInfo?.exists && postCleanupInfo.isDirectory) {
                        throw new Error(localize(
                            `Offline model path is a folder (${targetFile.uri}). Please remove it and try again.`,
                            `离线模型路径是文件夹（${targetFile.uri}），请删除后重试。`
                        ));
                    }
                    const existingInfo = safePathInfo(targetFile.uri);
                    if (existingInfo?.exists && existingInfo.isDirectory === false) {
                        try {
                            const existingFile = new File(targetFile.uri);
                            if ((existingFile.size ?? 0) > 0) {
                                updateSpeechSettings({ offlineModelPath: targetFile.uri, model: selectedWhisperModel.id });
                                setWhisperDownloadState('success');
                                clearSuccess();
                                return;
                            }
                        } catch (error) {
                            logSettingsWarn('Whisper existing file check failed', error);
                        }
                    }
                    try {
                        const file = await File.downloadFileAsync(url, targetFile, { idempotent: true });
                        updateSpeechSettings({ offlineModelPath: file.uri, model: selectedWhisperModel.id });
                    } catch (downloadError) {
                        const fallbackMessage = localize(
                            'Download failed. Please retry on Wi‑Fi. Large models cannot be buffered into memory.',
                            '下载失败。请在 Wi‑Fi 下重试。大型模型无法加载到内存。'
                        );
                        throw new Error(downloadError instanceof Error
                            ? `${fallbackMessage}\n${downloadError.message}`
                            : fallbackMessage);
                    }
                    setWhisperDownloadState('success');
                    clearSuccess();
                    return;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    logSettingsWarn('Whisper model download failed', error);
                }
            }
            throw lastError ?? new Error('Whisper storage unavailable');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setWhisperDownloadError(message);
            setWhisperDownloadState('error');
            logSettingsWarn('Whisper model download failed', error);
            Alert.alert(t('settings.speechOfflineDownloadError'), message);
            return;
        }
    };

    const handleDeleteWhisperModel = () => {
        try {
            if (whisperModelPath) {
                const info = safePathInfo(whisperModelPath);
                const basename = Paths.basename(whisperModelPath);
                if (basename && basename.endsWith('.bin') && info?.exists) {
                    if (info.isDirectory) {
                        const dir = new Directory(normalizeWhisperPath(whisperModelPath));
                        dir.delete();
                    } else {
                        const file = new File(normalizeWhisperPath(whisperModelPath));
                        file.delete();
                    }
                }
            }
            updateSpeechSettings({ offlineModelPath: undefined });
        } catch (error) {
            logSettingsWarn('Whisper model delete failed', error);
            Alert.alert(t('settings.speechOfflineDeleteError'), t('settings.speechOfflineDeleteErrorBody'));
        }
    };

    const GITHUB_RELEASES_API = 'https://api.github.com/repos/dongdongbh/Mindwtr/releases/latest';
    const GITHUB_RELEASES_URL = 'https://github.com/dongdongbh/Mindwtr/releases/latest';
    const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=tech.dongdongbh.mindwtr';
    const PLAY_STORE_MARKET_URL = 'market://details?id=tech.dongdongbh.mindwtr';

    const persistUpdateBadge = useCallback(async (next: boolean, latestVersion?: string) => {
        setHasUpdateBadge(next);
        try {
            await AsyncStorage.setItem(UPDATE_BADGE_AVAILABLE_KEY, next ? 'true' : 'false');
            if (next && latestVersion) {
                await AsyncStorage.setItem(UPDATE_BADGE_LATEST_KEY, latestVersion);
            } else {
                await AsyncStorage.removeItem(UPDATE_BADGE_LATEST_KEY);
            }
        } catch (error) {
            logSettingsWarn('Failed to persist update badge state', error);
        }
    }, []);

    const fetchLatestRelease = useCallback(async () => {
        const response = await fetch(GITHUB_RELEASES_API, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Mindwtr-App'
            }
        });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        return response.json();
    }, [GITHUB_RELEASES_API]);

    useEffect(() => {
        let cancelled = false;
        AsyncStorage.multiGet([UPDATE_BADGE_AVAILABLE_KEY, UPDATE_BADGE_LATEST_KEY])
            .then((entries) => {
                if (cancelled) return;
                const entryMap = new Map(entries);
                const storedAvailable = entryMap.get(UPDATE_BADGE_AVAILABLE_KEY) === 'true';
                const storedLatest = entryMap.get(UPDATE_BADGE_LATEST_KEY) ?? '';
                const isValid = storedAvailable && Boolean(storedLatest) && compareVersions(storedLatest, currentVersion) > 0;
                setHasUpdateBadge(isValid);
                if (storedAvailable && !isValid) {
                    AsyncStorage.setItem(UPDATE_BADGE_AVAILABLE_KEY, 'false').catch(logSettingsWarn);
                    AsyncStorage.removeItem(UPDATE_BADGE_LATEST_KEY).catch(logSettingsWarn);
                }
            })
            .catch((error) => logSettingsWarn('Failed to read update badge state', error));
        return () => {
            cancelled = true;
        };
    }, [currentVersion]);

    useEffect(() => {
        if (isExpoGo) return;
        let cancelled = false;
        const checkUpdates = async () => {
            try {
                const lastCheckRaw = await AsyncStorage.getItem(UPDATE_BADGE_LAST_CHECK_KEY);
                const lastCheck = Number(lastCheckRaw || 0);
                if (Date.now() - lastCheck < UPDATE_BADGE_INTERVAL_MS) return;
                await AsyncStorage.setItem(UPDATE_BADGE_LAST_CHECK_KEY, String(Date.now()));
                const release = await fetchLatestRelease();
                const latestVersion = release.tag_name?.replace(/^v/, '') || '0.0.0';
                const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
                if (cancelled) return;
                await persistUpdateBadge(hasUpdate, hasUpdate ? latestVersion : undefined);
            } catch (error) {
                logSettingsWarn('Background update check failed', error);
            }
        };
        void checkUpdates();
        return () => {
            cancelled = true;
        };
    }, [currentVersion, fetchLatestRelease, isExpoGo, persistUpdateBadge]);

    const handleCheckUpdates = async () => {
        setIsCheckingUpdate(true);
        try {
            if (Platform.OS === 'android') {
                const canOpenMarket = await Linking.canOpenURL(PLAY_STORE_MARKET_URL);
                const targetUrl = canOpenMarket ? PLAY_STORE_MARKET_URL : PLAY_STORE_URL;
                Alert.alert(
                    localize('Check for Updates', '检查更新'),
                    localize(
                        'Updates on Android are managed by Google Play. Open the Play Store listing?',
                        'Android 更新由 Google Play 管理。是否打开应用页面？'
                    ),
                    [
                        { text: localize('Later', '稍后'), style: 'cancel' },
                        { text: localize('Open', '打开'), onPress: () => Linking.openURL(targetUrl) }
                    ]
                );
                return;
            }

            await AsyncStorage.setItem(UPDATE_BADGE_LAST_CHECK_KEY, String(Date.now()));
            const release = await fetchLatestRelease();
            const latestVersion = release.tag_name?.replace(/^v/, '') || '0.0.0';

            // Compare versions
            const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

            if (hasUpdate) {
                // Find APK download URL
                let downloadUrl = GITHUB_RELEASES_URL;
                if (release.html_url) {
                    downloadUrl = release.html_url;
                }

                const changelog = release.body || localize('No changelog available', '暂无更新日志');

                Alert.alert(
                    localize('Update Available', '有可用更新'),
                    `v${currentVersion} → v${latestVersion}\n\n${localize('Changelog', '更新日志')}:\n${changelog.substring(0, 500)}${changelog.length > 500 ? '...' : ''}`,
                    [
                        {
                            text: localize('Later', '稍后'),
                            style: 'cancel'
                        },
                        {
                            text: localize('Download', '下载'),
                            onPress: () => Linking.openURL(downloadUrl)
                        }
                    ]
                );
                await persistUpdateBadge(true, latestVersion);
            } else {
                Alert.alert(
                    localize('Up to Date', '已是最新'),
                    localize('You are using the latest version!', '您正在使用最新版本！')
                );
                await persistUpdateBadge(false);
            }
        } catch (error) {
            logSettingsError('Update check failed:', error);
            Alert.alert(
                localize('Error', '错误'),
                localize('Failed to check for updates', '检查更新失败')
            );
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    // Set sync folder (Android) or sync file (iOS)
    const handleSetSyncPath = async () => {
        try {
            const result = await pickAndParseSyncFolder();
            if (result) {
                // Get the file URI that was picked
                const fileUri = (result as { __fileUri: string }).__fileUri;
                if (fileUri) {
                    await AsyncStorage.setItem(SYNC_PATH_KEY, fileUri);
                    setSyncPath(fileUri);
                    await AsyncStorage.setItem(SYNC_BACKEND_KEY, 'file');
                    setSyncBackend('file');
                    Alert.alert(
                        localize('Success', '成功'),
                        localize('Sync folder set successfully', '同步文件夹已设置')
                    );
                }
            }
        } catch (error) {
            logSettingsError(error);
            const message = String(error);
            if (/read-only|read only|not writable|isn't writable|permission denied|EACCES/i.test(message)) {
                Alert.alert(
                    localize('Sync folder is read-only', '同步文件夹不可写'),
                    localize(
                        'The selected folder is read-only. Please choose a writable folder (e.g. My files) or make it available offline.',
                        '所选文件夹不可写。请选择可写文件夹（如“我的文件”），或将其设为离线可用。'
                    )
                );
                return;
            }
            Alert.alert(localize('Error', '错误'), localize('Failed to set sync path', '设置失败'));
        }
    };

    // Sync from stored path
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            if (syncBackend === 'off') {
                return;
            }
            if (syncBackend === 'webdav') {
                if (!webdavUrl.trim()) {
                    Alert.alert(
                        localize('Notice', '提示'),
                        localize('Please set a WebDAV URL first', '请先设置 WebDAV 地址')
                    );
                    return;
                }
                if (webdavUrlError) {
                    Alert.alert(
                        localize('Invalid URL', '地址无效'),
                        localize('Please enter a valid WebDAV URL (http/https).', '请输入有效的 WebDAV 地址（http/https）。')
                    );
                    return;
                }
                await AsyncStorage.multiSet([
                    [SYNC_BACKEND_KEY, 'webdav'],
                    [WEBDAV_URL_KEY, webdavUrl.trim()],
                    [WEBDAV_USERNAME_KEY, webdavUsername.trim()],
                    [WEBDAV_PASSWORD_KEY, webdavPassword],
                ]);
            } else if (syncBackend === 'cloud') {
                if (!cloudUrl.trim()) {
                    Alert.alert(
                        localize('Notice', '提示'),
                        localize('Please set a self-hosted URL first', '请先设置自托管地址')
                    );
                    return;
                }
                if (cloudUrlError) {
                    Alert.alert(
                        localize('Invalid URL', '地址无效'),
                        localize('Please enter a valid self-hosted URL (http/https).', '请输入有效的自托管地址（http/https）。')
                    );
                    return;
                }
                await AsyncStorage.multiSet([
                    [SYNC_BACKEND_KEY, 'cloud'],
                    [CLOUD_URL_KEY, cloudUrl.trim()],
                    [CLOUD_TOKEN_KEY, cloudToken],
                ]);
            } else {
                if (!syncPath) {
                    Alert.alert(
                        localize('Notice', '提示'),
                        localize('Please set a sync folder first', '请先设置同步文件夹')
                    );
                    return;
                }
                await AsyncStorage.setItem(SYNC_BACKEND_KEY, 'file');
            }

            const result = await performMobileSync(syncBackend === 'file' ? syncPath || undefined : undefined);
            if (result.success) {
                Alert.alert(
                    localize('Success', '成功'),
                    localize('Sync completed!', '同步完成！')
                );
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            logSettingsError(error);
            Alert.alert(localize('Error', '错误'), localize('Sync failed', '同步失败'));
        } finally {
            setIsSyncing(false);
        }
    };

    const renderSyncHistory = () => {
        if (syncHistoryEntries.length === 0) return null;
        return (
            <View style={{ marginTop: 6 }}>
                <TouchableOpacity onPress={() => setSyncHistoryExpanded((value) => !value)} activeOpacity={0.7}>
                    <Text style={[styles.settingDescription, { color: tc.secondaryText, fontWeight: '600' }]}>
                        {localize('Sync history', '同步历史')} ({syncHistoryEntries.length}) {syncHistoryExpanded ? '▾' : '▸'}
                    </Text>
                </TouchableOpacity>
                {syncHistoryExpanded && syncHistoryEntries.map((entry) => {
                    const statusLabel = entry.status === 'success'
                        ? localize('Completed', '完成')
                        : entry.status === 'conflict'
                            ? localize('Conflicts', '冲突')
                            : localize('Failed', '失败');
                    const details = [
                        entry.conflicts ? `${localize('Conflicts', '冲突')}: ${entry.conflicts}` : null,
                        entry.maxClockSkewMs > 0 ? `${localize('Clock skew', '时钟偏差')}: ${formatClockSkew(entry.maxClockSkewMs)}` : null,
                        entry.timestampAdjustments > 0 ? `${localize('Timestamp fixes', '时间修正')}: ${entry.timestampAdjustments}` : null,
                    ].filter(Boolean);
                    return (
                        <Text key={`${entry.at}-${entry.status}`} style={[styles.settingDescription, { color: tc.secondaryText }]}>
                            {new Date(entry.at).toLocaleString()} • {statusLabel}
                            {details.length ? ` • ${details.join(' • ')}` : ''}
                            {entry.status === 'error' && entry.error ? ` • ${entry.error}` : ''}
                        </Text>
                    );
                })}
            </View>
        );
    };

    const handleBackup = async () => {
        setIsSyncing(true);
        try {
            await exportData({ tasks, projects, sections, areas, settings });
        } catch (error) {
            logSettingsError(error);
            Alert.alert(localize('Error', '错误'), localize('Failed to export data', '导出失败'));
        } finally {
            setIsSyncing(false);
        }
    };

    const toggleDebugLogging = (value: boolean) => {
        updateSettings({
            diagnostics: {
                ...(settings.diagnostics ?? {}),
                loggingEnabled: value,
            },
        })
            .then(async () => {
                if (!value) return;
                const ensuredPath = await ensureLogFilePath();
                if (!ensuredPath) return;
                await logInfo('Debug logging enabled', { scope: 'diagnostics' });
            })
            .catch(logSettingsError);
    };

    const handleShareLog = async () => {
        const path = await ensureLogFilePath();
        if (!path) {
            Alert.alert(t('settings.debugLogging'), t('settings.logMissing'));
            return;
        }
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
            Alert.alert(t('settings.debugLogging'), t('settings.shareUnavailable'));
            return;
        }
        await Sharing.shareAsync(path, { mimeType: 'text/plain' });
    };

    const handleClearLog = async () => {
        await clearLog();
        Alert.alert(t('settings.debugLogging'), t('settings.logCleared'));
    };

    const updateFeatureFlags = (next: { priorities?: boolean; timeEstimates?: boolean }) => {
        updateSettings({
            features: {
                ...(settings.features ?? {}),
                ...next,
            },
        }).catch(logSettingsError);
    };
    const ensureNotificationsPermission = async () => {
        const result = await requestNotificationPermission();
        if (result.granted) {
            startMobileNotifications().catch(logSettingsError);
            return true;
        }
        if (result.canAskAgain === false) {
            Alert.alert(
                localize('Notifications disabled', '通知已禁用'),
                localize('Please enable notifications in system settings.', '请在系统设置中启用通知。'),
                [
                    { text: localize('Cancel', '取消'), style: 'cancel' },
                    {
                        text: localize('Open settings', '打开设置'),
                        onPress: () => Linking.openSettings().catch(logSettingsError),
                    },
                ],
            );
        }
        return false;
    };

    // Sub-screen header
    const SubHeader = ({ title }: { title: string }) => (
        <View style={styles.subHeader}>
            <Text style={[styles.subHeaderTitle, { color: tc.text }]}>{title}</Text>
        </View>
    );

    // Menu Item
    const MenuItem = ({ title, onPress, showIndicator }: { title: string; onPress: () => void; showIndicator?: boolean }) => (
        <TouchableOpacity style={[styles.menuItem, { borderBottomColor: tc.border }]} onPress={onPress}>
            <Text style={[styles.menuLabel, { color: tc.text }]}>{title}</Text>
            <View style={styles.menuRight}>
                {showIndicator && (
                    <View
                        accessibilityLabel={localize('Update available', '有可用更新')}
                        accessibilityRole="text"
                        style={styles.updateDot}
                    />
                )}
                <Text style={[styles.chevron, { color: tc.secondaryText }]}>›</Text>
            </View>
        </TouchableOpacity>
    );

    // ============ NOTIFICATIONS SCREEN ============
    if (currentScreen === 'notifications') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.notifications')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.notificationsEnable')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.notificationsDesc')}
                                </Text>
                            </View>
                            <Switch
                                value={notificationsEnabled}
                                onValueChange={(value) => {
                                    if (!value) {
                                        updateSettings({ notificationsEnabled: false }).catch(logSettingsError);
                                        return;
                                    }
                                    ensureNotificationsPermission()
                                        .then((granted) => {
                                            if (!granted) return;
                                            updateSettings({ notificationsEnabled: true }).catch(logSettingsError);
                                        })
                                        .catch(logSettingsError);
                                }}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>
                    </View>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.weeklyReview')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.weeklyReviewDesc')}
                                </Text>
                            </View>
                            <Switch
                                value={weeklyReviewEnabled}
                                onValueChange={(value) => {
                                    if (!value) {
                                        updateSettings({ weeklyReviewEnabled: false }).catch(logSettingsError);
                                        return;
                                    }
                                    ensureNotificationsPermission()
                                        .then((granted) => {
                                            if (!granted) return;
                                            updateSettings({ weeklyReviewEnabled: true }).catch(logSettingsError);
                                        })
                                        .catch(logSettingsError);
                                }}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                                disabled={!notificationsEnabled}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={selectWeeklyReviewDay}
                            disabled={!weeklyReviewEnabled || !notificationsEnabled}
                        >
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text, opacity: weeklyReviewEnabled ? 1 : 0.5 }]}>
                                    {t('settings.weeklyReviewDay')}
                                </Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText, opacity: weeklyReviewEnabled ? 1 : 0.5 }]}>
                                    {getWeekdayLabel(weeklyReviewDay)}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => setWeeklyReviewTimePicker(true)}
                            disabled={!weeklyReviewEnabled || !notificationsEnabled}
                        >
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text, opacity: weeklyReviewEnabled ? 1 : 0.5 }]}>
                                    {t('settings.weeklyReviewTime')}
                                </Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText, opacity: weeklyReviewEnabled ? 1 : 0.5 }]}>
                                    {formatTime(weeklyReviewTime)}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <Modal
                        transparent
                        visible={weeklyReviewDayPickerOpen}
                        animationType="fade"
                        onRequestClose={() => setWeeklyReviewDayPickerOpen(false)}
                    >
                        <Pressable style={styles.pickerOverlay} onPress={() => setWeeklyReviewDayPickerOpen(false)}>
                            <View
                                style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                onStartShouldSetResponder={() => true}
                            >
                                <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('settings.weeklyReviewDay')}</Text>
                                <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
                                    {Array.from({ length: 7 }, (_, idx) => {
                                        const label = getWeekdayLabel(idx);
                                        const selected = weeklyReviewDay === idx;
                                        return (
                                            <TouchableOpacity
                                                key={label}
                                                style={[
                                                    styles.pickerOption,
                                                    { borderColor: tc.border, backgroundColor: selected ? tc.filterBg : 'transparent' },
                                                ]}
                                                onPress={() => {
                                                    updateSettings({ weeklyReviewDay: idx }).catch(logSettingsError);
                                                    setWeeklyReviewDayPickerOpen(false);
                                                }}
                                            >
                                                <Text style={[styles.pickerOptionText, { color: selected ? tc.tint : tc.text }]}>
                                                    {label}
                                                </Text>
                                                {selected && <Text style={{ color: tc.tint, fontSize: 18 }}>✓</Text>}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </Pressable>
                    </Modal>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.dailyDigest')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.dailyDigestDesc')}
                                </Text>
                            </View>
                        </View>

                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.dailyDigestMorning')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.dailyDigestMorningTime')}: {formatTime(dailyDigestMorningTime)}
                                </Text>
                            </View>
                            <Switch
                                value={dailyDigestMorningEnabled}
                                onValueChange={(value) => {
                                    if (!value) {
                                        updateSettings({ dailyDigestMorningEnabled: false }).catch(logSettingsError);
                                        return;
                                    }
                                    ensureNotificationsPermission()
                                        .then((granted) => {
                                            if (!granted) return;
                                            updateSettings({ dailyDigestMorningEnabled: true }).catch(logSettingsError);
                                        })
                                        .catch(logSettingsError);
                                }}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => setDigestTimePicker('morning')}
                            disabled={!dailyDigestMorningEnabled}
                        >
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text, opacity: dailyDigestMorningEnabled ? 1 : 0.5 }]}>
                                    {t('settings.dailyDigestMorningTime')}
                                </Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText, opacity: dailyDigestMorningEnabled ? 1 : 0.5 }]}>
                                    {formatTime(dailyDigestMorningTime)}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.dailyDigestEvening')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.dailyDigestEveningTime')}: {formatTime(dailyDigestEveningTime)}
                                </Text>
                            </View>
                            <Switch
                                value={dailyDigestEveningEnabled}
                                onValueChange={(value) => {
                                    if (!value) {
                                        updateSettings({ dailyDigestEveningEnabled: false }).catch(logSettingsError);
                                        return;
                                    }
                                    ensureNotificationsPermission()
                                        .then((granted) => {
                                            if (!granted) return;
                                            updateSettings({ dailyDigestEveningEnabled: true }).catch(logSettingsError);
                                        })
                                        .catch(logSettingsError);
                                }}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => setDigestTimePicker('evening')}
                            disabled={!dailyDigestEveningEnabled}
                        >
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text, opacity: dailyDigestEveningEnabled ? 1 : 0.5 }]}>
                                    {t('settings.dailyDigestEveningTime')}
                                </Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText, opacity: dailyDigestEveningEnabled ? 1 : 0.5 }]}>
                                    {formatTime(dailyDigestEveningTime)}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    {digestTimePicker && (
                        <DateTimePicker
                            value={toTimePickerDate(digestTimePicker === 'morning' ? dailyDigestMorningTime : dailyDigestEveningTime)}
                            mode="time"
                            display="default"
                            onChange={(event, date) => {
                                if (Platform.OS === 'android') {
                                    if (event.type === 'dismissed') {
                                        setDigestTimePicker(null);
                                        return;
                                    }
                                }
                                onDigestTimeChange(event, date);
                            }}
                        />
                    )}

                    {weeklyReviewTimePicker && (
                        <DateTimePicker
                            value={toTimePickerDate(weeklyReviewTime)}
                            mode="time"
                            display="default"
                            onChange={(event, date) => {
                                if (Platform.OS === 'android') {
                                    if (event.type === 'dismissed') {
                                        setWeeklyReviewTimePicker(false);
                                        return;
                                    }
                                }
                                onWeeklyReviewTimeChange(event, date);
                            }}
                        />
                    )}


                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ GENERAL SCREEN ============
    if (currentScreen === 'general') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.general')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <Text style={[styles.sectionTitle, { color: tc.secondaryText }]}>{t('settings.appearance')}</Text>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <TouchableOpacity style={styles.settingRow} onPress={() => setThemePickerOpen(true)}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.theme')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {currentThemeLabel}
                                </Text>
                            </View>
                            <Text style={{ color: tc.secondaryText, fontSize: 18 }}>▾</Text>
                        </TouchableOpacity>
                    </View>
                    <Modal
                        transparent
                        visible={themePickerOpen}
                        animationType="fade"
                        onRequestClose={() => setThemePickerOpen(false)}
                    >
                        <Pressable style={styles.pickerOverlay} onPress={() => setThemePickerOpen(false)}>
                            <View
                                style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                onStartShouldSetResponder={() => true}
                            >
                                <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('settings.theme')}</Text>
                                <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
                                    {themeOptions.map((option) => {
                                        const selected = option.value === themeMode;
                                        return (
                                            <TouchableOpacity
                                                key={option.value}
                                                style={[
                                                    styles.pickerOption,
                                                    { borderColor: tc.border, backgroundColor: selected ? tc.filterBg : 'transparent' },
                                                ]}
                                                onPress={() => {
                                                    setThemeMode(option.value);
                                                    updateSettings({ theme: mapThemeToSetting(option.value) }).catch(logSettingsError);
                                                    setThemePickerOpen(false);
                                                }}
                                            >
                                                <Text style={[styles.pickerOptionText, { color: selected ? tc.tint : tc.text }]}>
                                                    {option.label}
                                                </Text>
                                                {selected && <Text style={{ color: tc.tint, fontSize: 18 }}>✓</Text>}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </Pressable>
                    </Modal>

                    <Text style={[styles.sectionTitle, { color: tc.secondaryText, marginTop: 16 }]}>{t('settings.language')}</Text>
                    <Text style={[styles.description, { color: tc.secondaryText }]}>{t('settings.selectLang')}</Text>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <TouchableOpacity style={styles.settingRow} onPress={() => setLanguagePickerOpen(true)}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.language')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {LANGUAGES.find((lang) => lang.id === language)?.native ?? language}
                                </Text>
                            </View>
                            <Text style={{ color: tc.secondaryText, fontSize: 18 }}>▾</Text>
                        </TouchableOpacity>
                    </View>
                    <Modal
                        transparent
                        visible={languagePickerOpen}
                        animationType="fade"
                        onRequestClose={() => setLanguagePickerOpen(false)}
                    >
                        <Pressable style={styles.pickerOverlay} onPress={() => setLanguagePickerOpen(false)}>
                            <View
                                style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                onStartShouldSetResponder={() => true}
                            >
                                <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('settings.language')}</Text>
                                <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
                                    {LANGUAGES.map((lang) => {
                                        const selected = language === lang.id;
                                        return (
                                            <TouchableOpacity
                                                key={lang.id}
                                                style={[
                                                    styles.pickerOption,
                                                    { borderColor: tc.border, backgroundColor: selected ? tc.filterBg : 'transparent' },
                                                ]}
                                                onPress={() => {
                                                    setLanguage(lang.id);
                                                    updateSettings({ language: lang.id }).catch(logSettingsError);
                                                    setLanguagePickerOpen(false);
                                                }}
                                            >
                                                <Text style={[styles.pickerOptionText, { color: selected ? tc.tint : tc.text }]}>
                                                    {lang.native}
                                                </Text>
                                                {selected && <Text style={{ color: tc.tint, fontSize: 18 }}>✓</Text>}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </Pressable>
                    </Modal>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}>
                        <TouchableOpacity style={styles.settingRow} onPress={() => setWeekStartPickerOpen(true)}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.weekStart')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {currentWeekStartLabel}
                                </Text>
                            </View>
                            <Text style={{ color: tc.secondaryText, fontSize: 18 }}>▾</Text>
                        </TouchableOpacity>
                    </View>
                    <Modal
                        transparent
                        visible={weekStartPickerOpen}
                        animationType="fade"
                        onRequestClose={() => setWeekStartPickerOpen(false)}
                    >
                        <Pressable style={styles.pickerOverlay} onPress={() => setWeekStartPickerOpen(false)}>
                            <View
                                style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                onStartShouldSetResponder={() => true}
                            >
                                <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('settings.weekStart')}</Text>
                                <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
                                    {weekStartOptions.map((option) => {
                                        const selected = weekStart === option.value;
                                        return (
                                            <TouchableOpacity
                                                key={option.value}
                                                style={[
                                                    styles.pickerOption,
                                                    { borderColor: tc.border, backgroundColor: selected ? tc.filterBg : 'transparent' },
                                                ]}
                                                onPress={() => {
                                                    updateSettings({ weekStart: option.value }).catch(logSettingsError);
                                                    setWeekStartPickerOpen(false);
                                                }}
                                            >
                                                <Text style={[styles.pickerOptionText, { color: selected ? tc.tint : tc.text }]}>
                                                    {option.label}
                                                </Text>
                                                {selected && <Text style={{ color: tc.tint, fontSize: 18 }}>✓</Text>}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        </Pressable>
                    </Modal>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ AI SCREEN ============
    if (currentScreen === 'ai') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.ai')} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        style={styles.scrollView}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={scrollContentStyleWithKeyboard}
                    >
                        <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                            <TouchableOpacity
                                style={styles.settingRow}
                                onPress={() => setAiAssistantOpen((prev) => !prev)}
                            >
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.ai')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.aiDesc')}
                                    </Text>
                                </View>
                                <Text style={[styles.chevron, { color: tc.secondaryText }]}>
                                    {aiAssistantOpen ? '▾' : '▸'}
                                </Text>
                            </TouchableOpacity>

                            {aiAssistantOpen && (
                                <>
                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiEnable')}</Text>
                                </View>
                                <Switch
                                    value={aiEnabled}
                                    onValueChange={(value) => updateAISettings({ enabled: value })}
                                    trackColor={{ false: '#767577', true: '#3B82F6' }}
                                />
                            </View>

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiProvider')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {aiProvider === 'openai'
                                            ? t('settings.aiProviderOpenAI')
                                            : aiProvider === 'gemini'
                                                ? t('settings.aiProviderGemini')
                                                : t('settings.aiProviderAnthropic')}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <View style={styles.backendToggle}>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: aiProvider === 'openai' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => {
                                            const defaults = getDefaultAIConfig('openai');
                                            updateAISettings({
                                                provider: 'openai',
                                                model: defaults.model,
                                                copilotModel: getDefaultCopilotModel('openai'),
                                                reasoningEffort: defaults.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
                                                thinkingBudget: defaults.thinkingBudget ?? 0,
                                            });
                                        }}
                                    >
                                        <Text style={[styles.backendOptionText, { color: aiProvider === 'openai' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.aiProviderOpenAI')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: aiProvider === 'gemini' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => {
                                            const defaults = getDefaultAIConfig('gemini');
                                            updateAISettings({
                                                provider: 'gemini',
                                                model: defaults.model,
                                                copilotModel: getDefaultCopilotModel('gemini'),
                                                reasoningEffort: defaults.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
                                                thinkingBudget: defaults.thinkingBudget ?? DEFAULT_GEMINI_THINKING_BUDGET,
                                            });
                                        }}
                                    >
                                        <Text style={[styles.backendOptionText, { color: aiProvider === 'gemini' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.aiProviderGemini')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: aiProvider === 'anthropic' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => {
                                            const defaults = getDefaultAIConfig('anthropic');
                                            updateAISettings({
                                                provider: 'anthropic',
                                                model: defaults.model,
                                                copilotModel: getDefaultCopilotModel('anthropic'),
                                                reasoningEffort: defaults.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
                                                thinkingBudget: defaults.thinkingBudget ?? DEFAULT_ANTHROPIC_THINKING_BUDGET,
                                            });
                                        }}
                                    >
                                        <Text style={[styles.backendOptionText, { color: aiProvider === 'anthropic' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.aiProviderAnthropic')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiModel')}</Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <TouchableOpacity
                                    style={[styles.dropdownButton, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                                    onPress={() => setModelPicker('model')}
                                >
                                    <Text style={[styles.dropdownValue, { color: tc.text }]} numberOfLines={1}>
                                        {aiModel}
                                    </Text>
                                    <Text style={[styles.dropdownChevron, { color: tc.secondaryText }]}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiCopilotModel')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.aiCopilotHint')}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <TouchableOpacity
                                    style={[styles.dropdownButton, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                                    onPress={() => setModelPicker('copilot')}
                                >
                                    <Text style={[styles.dropdownValue, { color: tc.text }]} numberOfLines={1}>
                                        {aiCopilotModel}
                                    </Text>
                                    <Text style={[styles.dropdownChevron, { color: tc.secondaryText }]}>▾</Text>
                                </TouchableOpacity>
                            </View>

                        {aiProvider === 'openai' && (
                            <>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiReasoning')}</Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.aiReasoningHint')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                    <View style={styles.backendToggle}>
                                        {(['low', 'medium', 'high'] as AIReasoningEffort[]).map((effort) => (
                                            <TouchableOpacity
                                                key={effort}
                                                style={[
                                                    styles.backendOption,
                                                    { borderColor: tc.border, backgroundColor: aiReasoningEffort === effort ? tc.filterBg : 'transparent' },
                                                ]}
                                                onPress={() => updateAISettings({ reasoningEffort: effort })}
                                            >
                                                <Text style={[styles.backendOptionText, { color: aiReasoningEffort === effort ? tc.tint : tc.secondaryText }]}>
                                                    {effort === 'low'
                                                        ? t('settings.aiEffortLow')
                                                        : effort === 'medium'
                                                            ? t('settings.aiEffortMedium')
                                                            : t('settings.aiEffortHigh')}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </>
                        )}

                        {aiProvider === 'gemini' && (
                            <>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiThinkingBudget')}</Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.aiThinkingHint')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                    <View style={styles.backendToggle}>
                                        {[
                                            { value: 0, label: t('settings.aiThinkingOff') },
                                            { value: 128, label: t('settings.aiThinkingLow') },
                                            { value: 256, label: t('settings.aiThinkingMedium') },
                                            { value: 512, label: t('settings.aiThinkingHigh') },
                                        ].map((option) => (
                                            <TouchableOpacity
                                                key={option.value}
                                                style={[
                                                    styles.backendOption,
                                                    { borderColor: tc.border, backgroundColor: aiThinkingBudget === option.value ? tc.filterBg : 'transparent' },
                                                ]}
                                                onPress={() => updateAISettings({ thinkingBudget: option.value })}
                                            >
                                                <Text style={[styles.backendOptionText, { color: aiThinkingBudget === option.value ? tc.tint : tc.secondaryText }]}>
                                                    {option.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </>
                        )}

                        {aiProvider === 'anthropic' && (
                            <>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiThinkingEnable')}</Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.aiThinkingEnableDesc')}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={anthropicThinkingEnabled}
                                        onValueChange={(value) =>
                                            updateAISettings({
                                                thinkingBudget: value
                                                    ? (DEFAULT_ANTHROPIC_THINKING_BUDGET || 1024)
                                                    : 0,
                                            })
                                        }
                                        trackColor={{ false: '#767577', true: '#3B82F6' }}
                                    />
                                </View>
                                {anthropicThinkingEnabled && (
                                    <>
                                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                            <View style={styles.settingInfo}>
                                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiThinkingBudget')}</Text>
                                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                    {t('settings.aiThinkingHint')}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                            <View style={styles.backendToggle}>
                                                {[
                                                    { value: DEFAULT_ANTHROPIC_THINKING_BUDGET || 1024, label: t('settings.aiThinkingLow') },
                                                    { value: 2048, label: t('settings.aiThinkingMedium') },
                                                    { value: 4096, label: t('settings.aiThinkingHigh') },
                                                ].map((option) => (
                                                    <TouchableOpacity
                                                        key={option.value}
                                                        style={[
                                                            styles.backendOption,
                                                            { borderColor: tc.border, backgroundColor: aiThinkingBudget === option.value ? tc.filterBg : 'transparent' },
                                                        ]}
                                                        onPress={() => updateAISettings({ thinkingBudget: option.value })}
                                                    >
                                                        <Text style={[styles.backendOptionText, { color: aiThinkingBudget === option.value ? tc.tint : tc.secondaryText }]}>
                                                            {option.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </>
                                )}
                            </>
                        )}

                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiApiKey')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.aiApiKeyHint')}
                                </Text>
                            </View>
                        </View>
                        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                            <TextInput
                                value={aiApiKey}
                                onChangeText={(value) => {
                                    setAiApiKey(value);
                                    saveAIKey(aiProvider, value).catch(logSettingsError);
                                }}
                                placeholder={t('settings.aiApiKeyPlaceholder')}
                                placeholderTextColor={tc.secondaryText}
                                autoCapitalize="none"
                                secureTextEntry
                                style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                            />
                        </View>
                                </>
                            )}
                        </View>
                        <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}>
                            <TouchableOpacity
                                style={styles.settingRow}
                                onPress={() => setSpeechOpen((prev) => !prev)}
                            >
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechTitle')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.speechDesc')}
                                    </Text>
                                </View>
                                <Text style={[styles.chevron, { color: tc.secondaryText }]}>
                                    {speechOpen ? '▾' : '▸'}
                                </Text>
                            </TouchableOpacity>

                            {speechOpen && (
                                <>
                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechEnable')}</Text>
                                </View>
                                <Switch
                                    value={speechEnabled}
                                    onValueChange={(value) => updateSpeechSettings({ enabled: value })}
                                    trackColor={{ false: '#767577', true: '#3B82F6' }}
                                />
                            </View>
                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechProvider')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {speechProvider === 'openai'
                                            ? t('settings.aiProviderOpenAI')
                                            : speechProvider === 'gemini'
                                                ? t('settings.aiProviderGemini')
                                                : t('settings.speechProviderOffline')}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <View style={styles.backendToggle}>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: speechProvider === 'openai' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => {
                                            updateSpeechSettings({
                                                provider: 'openai',
                                                model: 'gpt-4o-transcribe',
                                                offlineModelPath: undefined,
                                            });
                                        }}
                                    >
                                        <Text style={[styles.backendOptionText, { color: speechProvider === 'openai' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.aiProviderOpenAI')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: speechProvider === 'gemini' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => {
                                            updateSpeechSettings({
                                                provider: 'gemini',
                                                model: 'gemini-2.5-flash',
                                                offlineModelPath: undefined,
                                            });
                                        }}
                                    >
                                        <Text style={[styles.backendOptionText, { color: speechProvider === 'gemini' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.aiProviderGemini')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: speechProvider === 'whisper' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => {
                                            updateSpeechSettings({
                                                provider: 'whisper',
                                                model: DEFAULT_WHISPER_MODEL,
                                                offlineModelPath: resolveWhisperModelPath(DEFAULT_WHISPER_MODEL),
                                            });
                                        }}
                                    >
                                        <Text style={[styles.backendOptionText, { color: speechProvider === 'whisper' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.speechProviderOffline')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechModel')}</Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <TouchableOpacity
                                    style={[styles.dropdownButton, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                                    onPress={() => setModelPicker('speech')}
                                >
                                    <Text style={[styles.dropdownValue, { color: tc.text }]} numberOfLines={1}>
                                        {speechModel}
                                    </Text>
                                    <Text style={[styles.dropdownChevron, { color: tc.secondaryText }]}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            {speechProvider === 'whisper' ? (
                                <>
                                    <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                        <View style={styles.settingInfo}>
                                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechOfflineModel')}</Text>
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {t('settings.speechOfflineModelDesc')}
                                            </Text>
                                            {isExpoGo ? (
                                                <Text style={[styles.settingDescription, { color: tc.danger, marginTop: 6 }]}>
                                                    {localize(
                                                        'Whisper transcription requires a dev build or production build (not Expo Go).',
                                                        'Whisper 转录需要开发版或正式版构建（Expo Go 不支持）。'
                                                    )}
                                                </Text>
                                            ) : null}
                                        </View>
                                    </View>
                                    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: tc.secondaryText, fontSize: 12 }}>
                                                    {whisperDownloaded ? t('settings.speechOfflineReady') : t('settings.speechOfflineNotDownloaded')}
                                                    {whisperSizeLabel ? ` - ${whisperSizeLabel}` : ''}
                                                </Text>
                                                {whisperDownloadState === 'success' ? (
                                                    <Text style={{ color: tc.tint, fontSize: 12, marginTop: 6 }}>
                                                        {t('settings.speechOfflineDownloadSuccess')}
                                                    </Text>
                                                ) : null}
                                                {whisperDownloadError ? (
                                                    <Text style={{ color: tc.danger, fontSize: 12, marginTop: 6 }}>
                                                        {whisperDownloadError}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            {whisperDownloadState === 'downloading' ? (
                                                <ActivityIndicator color={tc.tint} />
                                            ) : whisperDownloaded ? (
                                                <TouchableOpacity
                                                    style={[styles.backendOption, { borderColor: tc.border }]}
                                                    onPress={handleDeleteWhisperModel}
                                                >
                                                    <Text style={[styles.backendOptionText, { color: tc.text }]}>
                                                        {t('settings.speechOfflineDelete')}
                                                    </Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity
                                                    style={[styles.backendOption, { borderColor: tc.border }]}
                                                    onPress={handleDownloadWhisperModel}
                                                >
                                                    <Text style={[styles.backendOptionText, { color: tc.text }]}>
                                                        {t('settings.speechOfflineDownload')}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                        <View style={styles.settingInfo}>
                                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.aiApiKey')}</Text>
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {t('settings.aiApiKeyHint')}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                        <TextInput
                                            value={speechApiKey}
                                            onChangeText={(value) => {
                                                setSpeechApiKey(value);
                                                saveAIKey(speechProvider, value).catch(logSettingsError);
                                            }}
                                            placeholder={t('settings.aiApiKeyPlaceholder')}
                                            placeholderTextColor={tc.secondaryText}
                                            autoCapitalize="none"
                                            secureTextEntry
                                            style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                                        />
                                    </View>
                                </>
                            )}

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechLanguage')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.speechLanguageHint')}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <TextInput
                                    value={speechLanguage === 'auto' ? '' : speechLanguage}
                                    onChangeText={(value) => {
                                        const trimmed = value.trim();
                                        updateSpeechSettings({ language: trimmed ? trimmed : 'auto' });
                                    }}
                                    placeholder={t('settings.speechLanguageAuto')}
                                    placeholderTextColor={tc.secondaryText}
                                    autoCapitalize="none"
                                    style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                                />
                            </View>

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechMode')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.speechModeHint')}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <View style={styles.backendToggle}>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: speechMode === 'smart_parse' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => updateSpeechSettings({ mode: 'smart_parse' })}
                                    >
                                        <Text style={[styles.backendOptionText, { color: speechMode === 'smart_parse' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.speechModeSmart')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.backendOption,
                                            { borderColor: tc.border, backgroundColor: speechMode === 'transcribe_only' ? tc.filterBg : 'transparent' },
                                        ]}
                                        onPress={() => updateSpeechSettings({ mode: 'transcribe_only' })}
                                    >
                                        <Text style={[styles.backendOptionText, { color: speechMode === 'transcribe_only' ? tc.tint : tc.secondaryText }]}>
                                            {t('settings.speechModeTranscript')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.speechFieldStrategy')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.speechFieldStrategyHint')}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                                <View style={styles.backendToggle}>
                                    {[
                                        { value: 'smart', label: t('settings.speechFieldSmart') },
                                        { value: 'title_only', label: t('settings.speechFieldTitle') },
                                        { value: 'description_only', label: t('settings.speechFieldDescription') },
                                    ].map((option) => (
                                        <TouchableOpacity
                                            key={option.value}
                                            style={[
                                                styles.backendOption,
                                                { borderColor: tc.border, backgroundColor: speechFieldStrategy === option.value ? tc.filterBg : 'transparent' },
                                            ]}
                                            onPress={() => updateSpeechSettings({ fieldStrategy: option.value as 'smart' | 'title_only' | 'description_only' })}
                                        >
                                            <Text style={[styles.backendOptionText, { color: speechFieldStrategy === option.value ? tc.tint : tc.secondaryText }]}>
                                                {option.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                                </>
                            )}
                        </View>
                        <Modal
                            transparent
                            visible={modelPicker !== null}
                            animationType="fade"
                            onRequestClose={() => setModelPicker(null)}
                        >
                            <Pressable style={styles.pickerOverlay} onPress={() => setModelPicker(null)}>
                                <View
                                    style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                    onStartShouldSetResponder={() => true}
                                >
                                    <Text style={[styles.pickerTitle, { color: tc.text }]}>
                                        {modelPicker === 'model'
                                            ? t('settings.aiModel')
                                            : modelPicker === 'copilot'
                                                ? t('settings.aiCopilotModel')
                                                : t('settings.speechModel')}
                                    </Text>
                                    <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
                                        {(modelPicker === 'model'
                                            ? aiModelOptions
                                            : modelPicker === 'copilot'
                                                ? aiCopilotOptions
                                                : speechModelOptions).map((option) => {
                                            const selected = modelPicker === 'model'
                                                ? aiModel === option
                                                : modelPicker === 'copilot'
                                                    ? aiCopilotModel === option
                                                    : speechModel === option;
                                            return (
                                                <TouchableOpacity
                                                    key={option}
                                                    style={[
                                                        styles.pickerOption,
                                                        { borderColor: tc.border, backgroundColor: selected ? tc.filterBg : 'transparent' },
                                                    ]}
                                                    onPress={() => {
                                                        if (modelPicker === 'model') {
                                                            updateAISettings({ model: option });
                                                        } else if (modelPicker === 'copilot') {
                                                            updateAISettings({ copilotModel: option });
                                                        } else {
                                                            if (speechProvider === 'whisper') {
                                                                applyWhisperModel(option);
                                                            } else {
                                                                updateSpeechSettings({ model: option });
                                                            }
                                                        }
                                                        setModelPicker(null);
                                                    }}
                                                >
                                                    <Text style={[styles.pickerOptionText, { color: selected ? tc.tint : tc.text }]}>
                                                        {option}
                                                    </Text>
                                                    {selected && <Text style={{ color: tc.tint, fontSize: 18 }}>✓</Text>}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            </Pressable>
                        </Modal>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // ============ GTD MENU ============
    if (currentScreen === 'gtd') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.gtd')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <Text style={[styles.description, { color: tc.secondaryText }]}>{t('settings.gtdDesc')}</Text>
                    <View style={[styles.menuCard, { backgroundColor: tc.cardBg }]}>
                        {timeEstimatesEnabled && (
                            <MenuItem
                                title={t('settings.timeEstimatePresets')}
                                onPress={() => setCurrentScreen('gtd-time-estimates')}
                            />
                        )}
                        <MenuItem
                            title={t('settings.autoArchive')}
                            onPress={() => setCurrentScreen('gtd-archive')}
                        />
                        <MenuItem
                            title={t('settings.taskEditorLayout')}
                            onPress={() => setCurrentScreen('gtd-task-editor')}
                        />
                    </View>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.captureDefault')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.captureDefaultDesc')}
                                </Text>
                            </View>
                        </View>
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                            <View style={styles.backendToggle}>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: defaultCaptureMethod === 'text' ? tc.filterBg : 'transparent' },
                                    ]}
                                    onPress={() => {
                                        updateSettings({
                                            gtd: {
                                                ...(settings.gtd ?? {}),
                                                defaultCaptureMethod: 'text',
                                            },
                                        }).catch(logSettingsError);
                                    }}
                                >
                                    <Text style={[styles.backendOptionText, { color: defaultCaptureMethod === 'text' ? tc.tint : tc.secondaryText }]}>
                                        {t('settings.captureDefaultText')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: defaultCaptureMethod === 'audio' ? tc.filterBg : 'transparent' },
                                    ]}
                                    onPress={() => {
                                        updateSettings({
                                            gtd: {
                                                ...(settings.gtd ?? {}),
                                                defaultCaptureMethod: 'audio',
                                            },
                                        }).catch(logSettingsError);
                                    }}
                                >
                                    <Text style={[styles.backendOptionText, { color: defaultCaptureMethod === 'audio' ? tc.tint : tc.secondaryText }]}>
                                        {t('settings.captureDefaultAudio')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {defaultCaptureMethod === 'audio' ? (
                            <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                <View style={styles.settingInfo}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.captureSaveAudio')}</Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.captureSaveAudioDesc')}
                                    </Text>
                                </View>
                                <Switch
                                    value={saveAudioAttachments}
                                    onValueChange={(value) => {
                                        updateSettings({
                                            gtd: {
                                                ...(settings.gtd ?? {}),
                                                saveAudioAttachments: value,
                                            },
                                        }).catch(logSettingsError);
                                    }}
                                    trackColor={{ false: '#767577', true: '#3B82F6' }}
                                />
                            </View>
                        ) : null}
                    </View>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.inboxProcessing')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.inboxProcessingDesc')}
                                </Text>
                            </View>
                        </View>
                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.inboxTwoMinuteFirst')}</Text>
                            </View>
                            <Switch
                                value={inboxTwoMinuteFirst}
                                onValueChange={(value) => updateInboxProcessing({ twoMinuteFirst: value })}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>
                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.inboxProjectFirst')}</Text>
                            </View>
                            <Switch
                                value={inboxProjectFirst}
                                onValueChange={(value) => updateInboxProcessing({ projectFirst: value })}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>
                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.inboxScheduleEnabled')}</Text>
                            </View>
                            <Switch
                                value={inboxScheduleEnabled}
                                onValueChange={(value) => updateInboxProcessing({ scheduleEnabled: value })}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ GTD: AUTO ARCHIVE ============
    if (currentScreen === 'gtd-archive') {
        const autoArchiveOptions = [0, 1, 3, 7, 14, 30, 60];
        const formatAutoArchiveLabel = (days: number) => {
            if (days <= 0) return t('settings.autoArchiveNever');
            return language === 'zh' ? `${days} 天` : `${days} ${translateText('days', language)}`;
        };

        const handleSelectArchive = (days: number) => {
            updateSettings({
                gtd: {
                    ...(settings.gtd ?? {}),
                    autoArchiveDays: days,
                },
            }).catch(logSettingsError);
        };

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.autoArchive')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <Text style={[styles.description, { color: tc.secondaryText }]}>{t('settings.autoArchiveDesc')}</Text>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        {autoArchiveOptions.map((days, idx) => {
                            const selected = autoArchiveDays === days;
                            return (
                                <TouchableOpacity
                                    key={days}
                                    style={[styles.settingRow, idx > 0 && { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={() => handleSelectArchive(days)}
                                >
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{formatAutoArchiveLabel(days)}</Text>
                                    {selected && <Text style={{ color: '#3B82F6', fontSize: 20 }}>✓</Text>}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ GTD: TIME ESTIMATES ============
    if (currentScreen === 'gtd-time-estimates') {
        if (!timeEstimatesEnabled) {
            return (
                <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                    <SubHeader title={t('settings.timeEstimatePresets')} />
                    <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                        <Text style={[styles.description, { color: tc.secondaryText }]}>
                            {t('settings.timeEstimatePresetsDisabled')}
                        </Text>
                        <TouchableOpacity
                            style={[styles.settingCard, { backgroundColor: tc.cardBg }]}
                            onPress={() => updateFeatureFlags({ timeEstimates: true })}
                        >
                            <View style={styles.settingRow}>
                                <Text style={[styles.settingLabel, { color: tc.tint }]}>
                                    {t('settings.enableTimeEstimates')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            );
        }

        const togglePreset = (value: TimeEstimate) => {
            const isSelected = timeEstimatePresets.includes(value);
            if (isSelected && timeEstimatePresets.length <= 1) return;

            const next = isSelected ? timeEstimatePresets.filter((v) => v !== value) : [...timeEstimatePresets, value];
            const ordered = timeEstimateOptions.filter((v) => next.includes(v));

            updateSettings({
                gtd: {
                    ...(settings.gtd ?? {}),
                    timeEstimatePresets: ordered,
                },
            }).catch(logSettingsError);
        };

        const resetToDefault = () => {
            updateSettings({
                gtd: {
                    ...(settings.gtd ?? {}),
                    timeEstimatePresets: [...defaultTimeEstimatePresets],
                },
            }).catch(logSettingsError);
        };

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.timeEstimatePresets')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <Text style={[styles.description, { color: tc.secondaryText }]}>{t('settings.timeEstimatePresetsDesc')}</Text>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        {timeEstimateOptions.map((value, idx) => {
                            const selected = timeEstimatePresets.includes(value);
                            return (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.settingRow, idx > 0 && { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={() => togglePreset(value)}
                                >
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>
                                        {formatTimeEstimateLabel(value)}
                                    </Text>
                                    {selected && <Text style={{ color: '#3B82F6', fontSize: 20 }}>✓</Text>}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}
                        onPress={resetToDefault}
                    >
                        <View style={styles.settingRow}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.resetToDefault')}</Text>
                        </View>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ GTD: TASK EDITOR ============
    if (currentScreen === 'gtd-task-editor') {
        const ROW_HEIGHT = 52;

        const featureHiddenFields = new Set<TaskEditorFieldId>();
        if (!prioritiesEnabled) featureHiddenFields.add('priority');
        if (!timeEstimatesEnabled) featureHiddenFields.add('timeEstimate');

        const baseTaskEditorOrder: TaskEditorFieldId[] = [
            'status',
            'project',
            'area',
            'priority',
            'contexts',
            'description',
            'textDirection',
            'tags',
            'timeEstimate',
            'recurrence',
            'startTime',
            'dueDate',
            'reviewAt',
            'attachments',
            'checklist',
        ];
        const defaultTaskEditorOrder = baseTaskEditorOrder;
        const defaultVisibleFields: TaskEditorFieldId[] = [
            'status',
            'project',
            'area',
            'description',
            'textDirection',
            'checklist',
            'contexts',
            'dueDate',
            'priority',
            'timeEstimate',
        ];
        const defaultTaskEditorHidden = defaultTaskEditorOrder.filter(
            (id) => !defaultVisibleFields.includes(id) || featureHiddenFields.has(id)
        );
        const known = new Set(defaultTaskEditorOrder);
        const savedOrder = (settings.gtd?.taskEditor?.order ?? []).filter((id) => known.has(id));
        const taskEditorOrder = [...savedOrder, ...defaultTaskEditorOrder.filter((id) => !savedOrder.includes(id))];

        const savedHidden = settings.gtd?.taskEditor?.hidden ?? defaultTaskEditorHidden;
        const hiddenSet = new Set(savedHidden.filter((id) => known.has(id)));

            const fieldLabel = (fieldId: TaskEditorFieldId) => {
                switch (fieldId) {
                    case 'status':
                        return t('taskEdit.statusLabel');
                    case 'project':
                        return t('taskEdit.projectLabel');
                    case 'area':
                        return t('taskEdit.areaLabel');
                    case 'priority':
                        return t('taskEdit.priorityLabel');
                case 'contexts':
                    return t('taskEdit.contextsLabel');
                case 'description':
                    return t('taskEdit.descriptionLabel');
                case 'tags':
                    return t('taskEdit.tagsLabel');
                case 'timeEstimate':
                    return t('taskEdit.timeEstimateLabel');
                case 'recurrence':
                    return t('taskEdit.recurrenceLabel');
                case 'startTime':
                    return t('taskEdit.startDateLabel');
                case 'dueDate':
                    return t('taskEdit.dueDateLabel');
                case 'reviewAt':
                    return t('taskEdit.reviewDateLabel');
                case 'attachments':
                    return t('attachments.title');
                case 'checklist':
                    return t('taskEdit.checklist');
                case 'textDirection':
                    return t('taskEdit.textDirectionLabel');
                default:
                    return fieldId;
            }
        };

        const saveTaskEditor = (
            next: { order?: TaskEditorFieldId[]; hidden?: TaskEditorFieldId[] },
            nextFeatures?: AppData['settings']['features']
        ) => {
            updateSettings({
                ...(nextFeatures ? { features: nextFeatures } : null),
                gtd: {
                    ...(settings.gtd ?? {}),
                    taskEditor: {
                        ...(settings.gtd?.taskEditor ?? {}),
                        ...(next.order ? { order: next.order } : null),
                        ...(next.hidden ? { hidden: next.hidden } : null),
                    },
                },
            }).catch(logSettingsError);
        };

        const toggleFieldVisibility = (fieldId: TaskEditorFieldId) => {
            const nextHidden = new Set(hiddenSet);
            if (nextHidden.has(fieldId)) nextHidden.delete(fieldId);
            else nextHidden.add(fieldId);
            const nextFeatures = { ...(settings.features ?? {}) };
            if (fieldId === 'priority') nextFeatures.priorities = !nextHidden.has('priority');
            if (fieldId === 'timeEstimate') nextFeatures.timeEstimates = !nextHidden.has('timeEstimate');
            saveTaskEditor({ order: taskEditorOrder, hidden: Array.from(nextHidden) }, nextFeatures);
        };

        const moveOrderInGroup = (fieldId: TaskEditorFieldId, delta: number, groupFields: TaskEditorFieldId[]) => {
            const groupOrder = taskEditorOrder.filter((id) => groupFields.includes(id));
            const fromIndex = groupOrder.indexOf(fieldId);
            if (fromIndex < 0) return;
            const toIndex = Math.max(0, Math.min(groupOrder.length - 1, fromIndex + delta));
            if (fromIndex === toIndex) return;
            const nextGroupOrder = [...groupOrder];
            const [item] = nextGroupOrder.splice(fromIndex, 1);
            nextGroupOrder.splice(toIndex, 0, item);
            let groupIndex = 0;
            const nextOrder = taskEditorOrder.map((id) =>
                groupFields.includes(id) ? nextGroupOrder[groupIndex++] : id
            );
            saveTaskEditor({ order: nextOrder, hidden: Array.from(hiddenSet) });
        };

        const fieldGroups: { id: string; title: string; fields: TaskEditorFieldId[] }[] = [
            { id: 'basic', title: t('taskEdit.basic') || 'Basic', fields: ['status', 'project', 'area', 'dueDate'] },
            { id: 'scheduling', title: t('taskEdit.scheduling'), fields: ['startTime', 'recurrence', 'reviewAt'] },
            { id: 'organization', title: t('taskEdit.organization'), fields: ['contexts', 'tags', 'priority', 'timeEstimate'] },
            { id: 'details', title: t('taskEdit.details'), fields: ['description', 'textDirection', 'attachments', 'checklist'] },
        ];

        function TaskEditorRow({
            fieldId,
            index,
            groupFields,
            isFirst,
        }: {
            fieldId: TaskEditorFieldId;
            index: number;
            groupFields: TaskEditorFieldId[];
            isFirst: boolean;
        }) {
            const translateY = useSharedValue(0);
            const scale = useSharedValue(1);
            const zIndex = useSharedValue(0);

            const onDrop = (deltaRows: number) => {
                moveOrderInGroup(fieldId, deltaRows, groupFields);
            };

            const panGesture = Gesture.Pan()
                .activateAfterLongPress(220)
                .onStart(() => {
                    scale.value = withSpring(1.02);
                    zIndex.value = 50;
                })
                .onUpdate((event) => {
                    translateY.value = event.translationY;
                })
            .onEnd((event) => {
                    const deltaRows = Math.round(event.translationY / ROW_HEIGHT);
                    if (deltaRows !== 0) runOnJS(onDrop)(deltaRows);
                    translateY.value = withSpring(0);
                    scale.value = withSpring(1);
                    zIndex.value = 0;
                });

            const animatedStyle = useAnimatedStyle(() => ({
                transform: [{ translateY: translateY.value }, { scale: scale.value }],
                zIndex: zIndex.value,
            }));

            const visible = !hiddenSet.has(fieldId);

            return (
                <Animated.View
                    style={[
                        styles.taskEditorRow,
                        { borderTopColor: tc.border },
                        !isFirst && styles.taskEditorRowBorder,
                        animatedStyle,
                    ]}
                >
                    <TouchableOpacity
                        style={styles.taskEditorRowContent}
                        onPress={() => toggleFieldVisibility(fieldId)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.taskEditorCheckSlot}>
                            {visible ? <Text style={{ color: tc.tint, fontSize: 18 }}>✓</Text> : null}
                        </View>
                        <Text style={[styles.settingLabel, { color: tc.text }]}>{fieldLabel(fieldId)}</Text>
                    </TouchableOpacity>

                    <GestureDetector gesture={panGesture}>
                        <View style={styles.taskEditorDragHandle}>
                            <IconSymbol name="line.3.horizontal" size={18} color={tc.icon} />
                        </View>
                    </GestureDetector>
                </Animated.View>
            );
        }

        const resetToDefault = () => {
            const nextFeatures = { ...(settings.features ?? {}) };
            nextFeatures.priorities = !defaultTaskEditorHidden.includes('priority');
            nextFeatures.timeEstimates = !defaultTaskEditorHidden.includes('timeEstimate');
            saveTaskEditor(
                { order: [...defaultTaskEditorOrder], hidden: [...defaultTaskEditorHidden] },
                nextFeatures
            );
        };

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.taskEditorLayout')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <Text style={[styles.description, { color: tc.secondaryText }]}>{t('settings.taskEditorLayoutDesc')}</Text>
                    <Text style={[styles.description, { color: tc.secondaryText, marginTop: -6 }]}>{t('settings.taskEditorLayoutHint')}</Text>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, overflow: 'visible' }]}>
                        {fieldGroups.map((group) => {
                            const groupOrder = taskEditorOrder.filter((id) => group.fields.includes(id));
                            return (
                                <View key={group.id} style={{ marginBottom: 8 }}>
                                    <Text style={[styles.sectionHeaderText, { color: tc.secondaryText }]}>
                                        {group.title}
                                    </Text>
                                    {groupOrder.map((fieldId, index) => (
                                        <TaskEditorRow
                                            key={fieldId}
                                            fieldId={fieldId}
                                            index={index}
                                            groupFields={group.fields}
                                            isFirst={index === 0}
                                        />
                                    ))}
                                </View>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 12 }]}
                        onPress={resetToDefault}
                    >
                        <View style={styles.settingRow}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.resetToDefault')}</Text>
                        </View>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ CALENDAR SCREEN ============
    if (currentScreen === 'calendar') {
        const handleAddCalendar = async () => {
            const url = newCalendarUrl.trim();
            if (!url) return;

            const name = (newCalendarName.trim() || localize('Calendar', '日历')).trim();
            const next: ExternalCalendarSubscription[] = [
                ...externalCalendars,
                { id: generateUUID(), name, url, enabled: true },
            ];

            setExternalCalendars(next);
            setNewCalendarName('');
            setNewCalendarUrl('');
            await saveExternalCalendars(next);
            await updateSettings({ externalCalendars: next });
        };

        const handleToggleCalendar = async (id: string, enabled: boolean) => {
            const next = externalCalendars.map((c) => (c.id === id ? { ...c, enabled } : c));
            setExternalCalendars(next);
            await saveExternalCalendars(next);
            await updateSettings({ externalCalendars: next });
        };

        const handleRemoveCalendar = async (id: string) => {
            const next = externalCalendars.filter((c) => c.id !== id);
            setExternalCalendars(next);
            await saveExternalCalendars(next);
            await updateSettings({ externalCalendars: next });
        };

        const handleTestFetch = async () => {
            try {
                const now = new Date();
                const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                const { events } = await fetchExternalCalendarEvents(rangeStart, rangeEnd);
                Alert.alert(
                    localize('Success', '成功'),
                    language === 'zh' ? `已加载 ${events.length} 个日程` : translateText(`Loaded ${events.length} events`, language)
                );
            } catch (error) {
                logSettingsError(error);
                Alert.alert(localize('Error', '错误'), localize('Failed to load events', '加载失败'));
            }
        };

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.calendar')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <Text style={[styles.description, { color: tc.secondaryText }]}>
                        {t('settings.calendarDesc')}
                    </Text>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.externalCalendarName')}</Text>
                            <TextInput
                                style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                                placeholder={localize('Optional', '可选')}
                                placeholderTextColor={tc.secondaryText}
                                value={newCalendarName}
                                onChangeText={setNewCalendarName}
                            />

                            <Text style={[styles.settingLabel, { color: tc.text, marginTop: 12 }]}>{t('settings.externalCalendarUrl')}</Text>
                            <TextInput
                                style={[styles.textInput, { borderColor: tc.border, color: tc.text }]}
                                placeholder="https://..."
                                placeholderTextColor={tc.secondaryText}
                                autoCapitalize="none"
                                autoCorrect={false}
                                value={newCalendarUrl}
                                onChangeText={setNewCalendarUrl}
                            />

                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: newCalendarUrl.trim() ? tc.tint : tc.filterBg },
                                    ]}
                                    onPress={handleAddCalendar}
                                    disabled={!newCalendarUrl.trim()}
                                >
                                    <Text style={[styles.backendOptionText, { color: newCalendarUrl.trim() ? '#FFFFFF' : tc.secondaryText }]}>
                                        {t('settings.externalCalendarAdd')}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.backendOption, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                                    onPress={handleTestFetch}
                                >
                                    <Text style={[styles.backendOptionText, { color: tc.text }]}>
                                        {localize('Test', '测试')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {externalCalendars.length > 0 && (
                        <View style={{ marginTop: 16 }}>
                            <Text style={[styles.sectionTitle, { color: tc.secondaryText }]}>{t('settings.externalCalendars')}</Text>
                            <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                                {externalCalendars.map((calendar, idx) => (
                                    <View
                                        key={calendar.id}
                                        style={[
                                            styles.settingRow,
                                            idx > 0 && { borderTopWidth: 1, borderTopColor: tc.border },
                                        ]}
                                    >
                                        <View style={styles.settingInfo}>
                                            <Text style={[styles.settingLabel, { color: tc.text }]} numberOfLines={1}>
                                                {calendar.name}
                                            </Text>
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]} numberOfLines={1}>
                                                {maskCalendarUrl(calendar.url)}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end', gap: 10 }}>
                                            <Switch
                                                value={calendar.enabled}
                                                onValueChange={(value) => handleToggleCalendar(calendar.id, value)}
                                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                                            />
                                            <TouchableOpacity onPress={() => handleRemoveCalendar(calendar.id)}>
                                                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>
                                                    {t('settings.externalCalendarRemove')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (currentScreen === 'advanced') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.advanced')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <View style={[styles.menuCard, { backgroundColor: tc.cardBg }]}>
                        <MenuItem title={t('settings.ai')} onPress={() => setCurrentScreen('ai')} />
                        <MenuItem title={t('settings.calendar')} onPress={() => setCurrentScreen('calendar')} />
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ SYNC SCREEN ============
    if (currentScreen === 'sync') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.dataSync')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginBottom: 12 }]}>
                        <View style={styles.settingRowColumn}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.syncBackend')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {syncBackend === 'off'
                                        ? t('settings.syncBackendOff')
                                        : syncBackend === 'webdav'
                                            ? t('settings.syncBackendWebdav')
                                            : syncBackend === 'cloud'
                                                ? t('settings.syncBackendCloud')
                                                : t('settings.syncBackendFile')}
                                </Text>
                            </View>
                            <View style={[styles.backendToggle, { marginTop: 8, width: '100%' }]}>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: syncBackend === 'off' ? tc.filterBg : 'transparent' },
                                    ]}
                                    onPress={() => {
                                        AsyncStorage.setItem(SYNC_BACKEND_KEY, 'off').catch(logSettingsError);
                                        setSyncBackend('off');
                                    }}
                                >
                                    <Text style={[styles.backendOptionText, { color: syncBackend === 'off' ? tc.tint : tc.secondaryText }]}>
                                        {t('settings.syncBackendOff')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: syncBackend === 'file' ? tc.filterBg : 'transparent' },
                                    ]}
                                    onPress={() => {
                                        AsyncStorage.setItem(SYNC_BACKEND_KEY, 'file').catch(logSettingsError);
                                        setSyncBackend('file');
                                    }}
                                >
                                    <Text style={[styles.backendOptionText, { color: syncBackend === 'file' ? tc.tint : tc.secondaryText }]}>
                                        {t('settings.syncBackendFile')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: syncBackend === 'webdav' ? tc.filterBg : 'transparent' },
                                    ]}
                                    onPress={() => {
                                        setSyncBackend('webdav');
                                    }}
                                >
                                    <Text style={[styles.backendOptionText, { color: syncBackend === 'webdav' ? tc.tint : tc.secondaryText }]}>
                                        {t('settings.syncBackendWebdav')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.backendOption,
                                        { borderColor: tc.border, backgroundColor: syncBackend === 'cloud' ? tc.filterBg : 'transparent' },
                                    ]}
                                    onPress={() => {
                                        AsyncStorage.setItem(SYNC_BACKEND_KEY, 'cloud').catch(logSettingsError);
                                        setSyncBackend('cloud');
                                    }}
                                >
                                    <Text style={[styles.backendOptionText, { color: syncBackend === 'cloud' ? tc.tint : tc.secondaryText }]}>
                                        {t('settings.syncBackendCloud')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {syncBackend === 'off' && (
                        <View style={[styles.helpBox, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>
                            <Text style={[styles.helpTitle, { color: tc.text }]}>
                                {localize('Sync is off', '同步已关闭')}
                            </Text>
                            <Text style={[styles.helpText, { color: tc.secondaryText }]}>
                                {localize('Turn sync back on anytime from this screen.', '您可以随时在此页面重新开启同步。')}
                            </Text>
                        </View>
                    )}

                    {syncBackend === 'file' && (
                        <>
                            {/* Step-by-step instructions */}
                            <View style={[styles.helpBox, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>
                                <Text style={[styles.helpTitle, { color: tc.text }]}>
                                    {localize('How to Sync', '如何同步')}
                                </Text>
                                <Text style={[styles.helpText, { color: tc.secondaryText }]}>
                                    {language === 'zh'
                                        ? '1. 先点击"导出备份"保存文件到同步文件夹（如 Google Drive）\n2. 点击"选择文件夹"授权该文件夹\n3. 之后点击"同步"即可合并数据'
                                        : translateText('1. First, tap "Export Backup" and save to your sync folder (e.g., Google Drive)\n2. Tap "Select Folder" to grant access to that folder\n3. Then tap "Sync" to merge data', language)}
                                </Text>
                            </View>

                            <Text style={[styles.sectionTitle, { color: tc.text, marginTop: 16 }]}>
                                {localize('Sync Settings', '同步设置')}
                            </Text>
                            <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                                {/* Sync File Path */}
                                <View style={styles.settingRow}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>
                                            {localize('Sync Folder', '同步文件夹')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]} numberOfLines={1}>
                                            {syncPath ? syncPath.split('/').pop() : localize('Not set', '未设置')}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={handleSetSyncPath}>
                                        <Text style={styles.linkText}>{localize('Select Folder', '选择文件夹')}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Sync Now */}
                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={handleSync}
                                    disabled={isSyncing || !syncPath}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: syncPath ? '#3B82F6' : tc.secondaryText }]}>
                                            {localize('Sync', '同步')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {language === 'zh' ? '读取并合并同步文件夹' : translateText('Read and merge sync folder', language)}
                                        </Text>
                                    </View>
                                    {isSyncing && <ActivityIndicator size="small" color="#3B82F6" />}
                                </TouchableOpacity>

                                {/* Last Sync Status */}
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>
                                            {localize('Last Sync', '上次同步')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {settings.lastSyncAt
                                                ? new Date(settings.lastSyncAt).toLocaleString()
                                                : localize('Never', '从未同步')}
                                            {settings.lastSyncStatus === 'error' && localize(' (failed)', '（失败）')}
                                            {settings.lastSyncStatus === 'conflict' && localize(' (conflicts)', '（有冲突）')}
                                        </Text>
                                        {lastSyncStats && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Conflicts', '冲突')}: {syncConflictCount}
                                            </Text>
                                        )}
                                        {lastSyncStats && maxClockSkewMs > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Clock skew', '时钟偏差')}: {formatClockSkew(maxClockSkewMs)}
                                            </Text>
                                        )}
                                        {lastSyncStats && timestampAdjustments > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Timestamp fixes', '时间修正')}: {timestampAdjustments}
                                            </Text>
                                        )}
                                        {lastSyncStats && conflictIds.length > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Conflict IDs', '冲突 ID')}: {conflictIds.join(', ')}
                                            </Text>
                                        )}
                                        {settings.lastSyncStatus === 'error' && settings.lastSyncError && (
                                            <Text style={[styles.settingDescription, { color: '#EF4444' }]}>
                                                {settings.lastSyncError}
                                            </Text>
                                        )}
                                        {renderSyncHistory()}
                                    </View>
                                </View>
                            </View>
                        </>
                    )}

                    {syncBackend === 'webdav' && (
                        <>
                            <Text style={[styles.sectionTitle, { color: tc.text, marginTop: 16 }]}>
                                {t('settings.syncBackendWebdav')}
                            </Text>
                            <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                                <View style={styles.inputGroup}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.webdavUrl')}</Text>
                                    <TextInput
                                        value={webdavUrl}
                                        onChangeText={setWebdavUrl}
                                        placeholder="https://example.com/remote.php/dav/files/user/mindwtr"
                                        placeholderTextColor={tc.secondaryText}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        style={[styles.textInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                    />
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.webdavHint')}
                                    </Text>
                                    {webdavUrlError && (
                                        <Text style={[styles.settingDescription, { color: '#EF4444' }]}>
                                            {localize('Invalid URL. Use http/https.', '地址无效，请使用 http/https。')}
                                        </Text>
                                    )}
                                </View>

                                <View style={[styles.inputGroup, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.webdavUsername')}</Text>
                                    <TextInput
                                        value={webdavUsername}
                                        onChangeText={setWebdavUsername}
                                        placeholder="user"
                                        placeholderTextColor={tc.secondaryText}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        style={[styles.textInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                    />
                                </View>

                                <View style={[styles.inputGroup, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.webdavPassword')}</Text>
                                    <TextInput
                                        value={webdavPassword}
                                        onChangeText={setWebdavPassword}
                                        placeholder="••••••••"
                                        placeholderTextColor={tc.secondaryText}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        secureTextEntry
                                        style={[styles.textInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                    />
                                </View>
                                {Platform.OS === 'web' && (
                                    <Text style={[styles.settingDescription, { color: '#F59E0B' }]}>
                                        {localize(
                                            'Web warning: WebDAV passwords are stored in browser storage. Use only on trusted devices.',
                                            'Web 提示：WebDAV 密码会保存在浏览器本地存储中，请仅在可信设备使用。'
                                        )}
                                    </Text>
                                )}

                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={() => {
                                        if (webdavUrlError || !webdavUrl.trim()) {
                                            Alert.alert(
                                                localize('Invalid URL', '地址无效'),
                                                localize('Please enter a valid WebDAV URL (http/https).', '请输入有效的 WebDAV 地址（http/https）。')
                                            );
                                            return;
                                        }
                                        AsyncStorage.multiSet([
                                            [SYNC_BACKEND_KEY, 'webdav'],
                                            [WEBDAV_URL_KEY, webdavUrl.trim()],
                                            [WEBDAV_USERNAME_KEY, webdavUsername.trim()],
                                            [WEBDAV_PASSWORD_KEY, webdavPassword],
                                        ]).then(() => {
                                            Alert.alert(localize('Success', '成功'), t('settings.webdavSave'));
                                        }).catch(logSettingsError);
                                    }}
                                    disabled={webdavUrlError || !webdavUrl.trim()}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: webdavUrlError || !webdavUrl.trim() ? tc.secondaryText : tc.tint }]}>
                                            {t('settings.webdavSave')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.webdavUrl')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={handleSync}
                                    disabled={isSyncing || !webdavUrl.trim() || webdavUrlError}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: webdavUrl.trim() && !webdavUrlError ? tc.tint : tc.secondaryText }]}>
                                            {localize('Sync', '同步')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {language === 'zh' ? '读取并合并 WebDAV 数据' : translateText('Read and merge WebDAV data', language)}
                                        </Text>
                                    </View>
                                    {isSyncing && <ActivityIndicator size="small" color={tc.tint} />}
                                </TouchableOpacity>

                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>
                                            {localize('Last Sync', '上次同步')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {settings.lastSyncAt
                                                ? new Date(settings.lastSyncAt).toLocaleString()
                                                : localize('Never', '从未同步')}
                                            {settings.lastSyncStatus === 'error' && localize(' (failed)', '（失败）')}
                                            {settings.lastSyncStatus === 'conflict' && localize(' (conflicts)', '（有冲突）')}
                                        </Text>
                                        {lastSyncStats && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Conflicts', '冲突')}: {syncConflictCount}
                                            </Text>
                                        )}
                                        {lastSyncStats && maxClockSkewMs > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Clock skew', '时钟偏差')}: {formatClockSkew(maxClockSkewMs)}
                                            </Text>
                                        )}
                                        {lastSyncStats && timestampAdjustments > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Timestamp fixes', '时间修正')}: {timestampAdjustments}
                                            </Text>
                                        )}
                                        {lastSyncStats && conflictIds.length > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Conflict IDs', '冲突 ID')}: {conflictIds.join(', ')}
                                            </Text>
                                        )}
                                        {settings.lastSyncStatus === 'error' && settings.lastSyncError && (
                                            <Text style={[styles.settingDescription, { color: '#EF4444' }]}>
                                                {settings.lastSyncError}
                                            </Text>
                                        )}
                                        {renderSyncHistory()}
                                    </View>
                                </View>
                            </View>
                        </>
                    )}

                    {syncBackend === 'cloud' && (
                        <>
                            <Text style={[styles.sectionTitle, { color: tc.text, marginTop: 16 }]}>
                                {t('settings.syncBackendCloud')}
                            </Text>
                            <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                                <View style={styles.inputGroup}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.cloudUrl')}</Text>
                                    <TextInput
                                        value={cloudUrl}
                                        onChangeText={setCloudUrl}
                                        placeholder="https://example.com/v1"
                                        placeholderTextColor={tc.secondaryText}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        style={[styles.textInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                    />
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {t('settings.cloudHint')}
                                    </Text>
                                    <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                        {localize('Use the base URL — Mindwtr will append /data.', '填写基础地址，Mindwtr 会自动加上 /data。')}
                                    </Text>
                                    {cloudUrlError && (
                                        <Text style={[styles.settingDescription, { color: '#EF4444' }]}>
                                            {localize('Invalid URL. Use http/https.', '地址无效，请使用 http/https。')}
                                        </Text>
                                    )}
                                </View>

                                <View style={[styles.inputGroup, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.cloudToken')}</Text>
                                    <TextInput
                                        value={cloudToken}
                                        onChangeText={setCloudToken}
                                        placeholder="••••••••"
                                        placeholderTextColor={tc.secondaryText}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        secureTextEntry
                                        style={[styles.textInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={() => {
                                        if (cloudUrlError || !cloudUrl.trim()) {
                                            Alert.alert(
                                                localize('Invalid URL', '地址无效'),
                                                localize('Please enter a valid self-hosted URL (http/https).', '请输入有效的自托管地址（http/https）。')
                                            );
                                            return;
                                        }
                                        AsyncStorage.multiSet([
                                            [SYNC_BACKEND_KEY, 'cloud'],
                                            [CLOUD_URL_KEY, cloudUrl.trim()],
                                            [CLOUD_TOKEN_KEY, cloudToken],
                                        ]).then(() => {
                                            Alert.alert(localize('Success', '成功'), t('settings.cloudSave'));
                                        }).catch(logSettingsError);
                                    }}
                                    disabled={cloudUrlError || !cloudUrl.trim()}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: cloudUrlError || !cloudUrl.trim() ? tc.secondaryText : tc.tint }]}>
                                            {t('settings.cloudSave')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.cloudUrl')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={handleSync}
                                    disabled={isSyncing || !cloudUrl.trim() || cloudUrlError}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: cloudUrl.trim() && !cloudUrlError ? tc.tint : tc.secondaryText }]}>
                                            {localize('Sync', '同步')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {language === 'zh' ? '读取并合并自托管数据' : translateText('Read and merge self-hosted data', language)}
                                        </Text>
                                    </View>
                                    {isSyncing && <ActivityIndicator size="small" color={tc.tint} />}
                                </TouchableOpacity>

                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>
                                            {localize('Last Sync', '上次同步')}
                                        </Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {settings.lastSyncAt
                                                ? new Date(settings.lastSyncAt).toLocaleString()
                                                : localize('Never', '从未同步')}
                                            {settings.lastSyncStatus === 'error' && localize(' (failed)', '（失败）')}
                                            {settings.lastSyncStatus === 'conflict' && localize(' (conflicts)', '（有冲突）')}
                                        </Text>
                                        {lastSyncStats && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Conflicts', '冲突')}: {syncConflictCount}
                                            </Text>
                                        )}
                                        {lastSyncStats && maxClockSkewMs > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Clock skew', '时钟偏差')}: {formatClockSkew(maxClockSkewMs)}
                                            </Text>
                                        )}
                                        {lastSyncStats && timestampAdjustments > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Timestamp fixes', '时间修正')}: {timestampAdjustments}
                                            </Text>
                                        )}
                                        {lastSyncStats && conflictIds.length > 0 && (
                                            <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                                {localize('Conflict IDs', '冲突 ID')}: {conflictIds.join(', ')}
                                            </Text>
                                        )}
                                        {settings.lastSyncStatus === 'error' && settings.lastSyncError && (
                                            <Text style={[styles.settingDescription, { color: '#EF4444' }]}>
                                                {settings.lastSyncError}
                                            </Text>
                                        )}
                                        {renderSyncHistory()}
                                    </View>
                                </View>
                            </View>
                        </>
                    )}


                    {/* Backup Section */}
                    <Text style={[styles.sectionTitle, { color: tc.text, marginTop: 24 }]}>
                        {localize('Backup', '备份')}
                    </Text>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <TouchableOpacity
                            style={styles.settingRow}
                            onPress={handleBackup}
                            disabled={isSyncing}
                        >
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: '#3B82F6' }]}>
                                    {localize('Export Backup', '导出备份')}
                                </Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {localize('Save to sync folder', '保存到同步文件夹')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg, marginTop: 16 }]}>
                        <TouchableOpacity
                            style={styles.settingRow}
                            onPress={() => setSyncOptionsOpen((prev) => !prev)}
                        >
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.syncPreferences')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.syncPreferencesDesc')}
                                </Text>
                            </View>
                            <Text style={[styles.chevron, { color: tc.secondaryText }]}>
                                {syncOptionsOpen ? '▾' : '▸'}
                            </Text>
                        </TouchableOpacity>
                        {syncOptionsOpen && (
                            <>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.syncPreferenceAppearance')}</Text>
                                    </View>
                                    <Switch
                                        value={syncAppearanceEnabled}
                                        onValueChange={(value) => updateSyncPreferences({ appearance: value })}
                                        trackColor={{ false: '#767577', true: '#3B82F6' }}
                                    />
                                </View>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.syncPreferenceLanguage')}</Text>
                                    </View>
                                    <Switch
                                        value={syncLanguageEnabled}
                                        onValueChange={(value) => updateSyncPreferences({ language: value })}
                                        trackColor={{ false: '#767577', true: '#3B82F6' }}
                                    />
                                </View>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.syncPreferenceExternalCalendars')}</Text>
                                    </View>
                                    <Switch
                                        value={syncExternalCalendarsEnabled}
                                        onValueChange={(value) => updateSyncPreferences({ externalCalendars: value })}
                                        trackColor={{ false: '#767577', true: '#3B82F6' }}
                                    />
                                </View>
                                <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.syncPreferenceAi')}</Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.syncPreferenceAiHint')}
                                        </Text>
                                    </View>
                                    <Switch
                                        value={syncAiEnabled}
                                        onValueChange={(value) => updateSyncPreferences({ ai: value })}
                                        trackColor={{ false: '#767577', true: '#3B82F6' }}
                                    />
                                </View>
                            </>
                        )}
                    </View>

                    <Text style={[styles.sectionTitle, { color: tc.text, marginTop: 24 }]}>
                        {t('settings.diagnostics')}
                    </Text>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.debugLogging')}</Text>
                                <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                    {t('settings.debugLoggingDesc')}
                                </Text>
                            </View>
                            <Switch
                                value={loggingEnabled}
                                onValueChange={toggleDebugLogging}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                            />
                        </View>
                        {loggingEnabled && (
                            <>
                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={handleShareLog}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.tint }]}>{t('settings.shareLog')}</Text>
                                        <Text style={[styles.settingDescription, { color: tc.secondaryText }]}>
                                            {t('settings.logFile')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                                    onPress={handleClearLog}
                                >
                                    <View style={styles.settingInfo}>
                                        <Text style={[styles.settingLabel, { color: tc.secondaryText }]}>{t('settings.clearLog')}</Text>
                                    </View>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ ABOUT SCREEN ============
    if (currentScreen === 'about') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
                <SubHeader title={t('settings.about')} />
                <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                    <View style={[styles.settingCard, { backgroundColor: tc.cardBg }]}>
                        <View style={styles.settingRow}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{t('settings.version')}</Text>
                            <Text style={[styles.settingValue, { color: tc.secondaryText }]}>
                                {Constants.expoConfig?.version ?? '0.1.0'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => openLink('https://github.com/dongdongbh/Mindwtr/wiki')}
                        >
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{localize('Documentation', '文档')}</Text>
                            <Text style={styles.linkText}>GitHub Wiki</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => openLink('https://ko-fi.com/dongdongbh')}
                        >
                            <Text style={[styles.settingLabel, { color: tc.text }]}>
                                {localize('Support Project', '支持项目')}
                            </Text>
                            <Text style={styles.linkText}>Ko-fi</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => openLink('https://github.com/dongdongbh/Mindwtr')}
                        >
                            <Text style={[styles.settingLabel, { color: tc.text }]}>GitHub</Text>
                            <Text style={styles.linkText}>Mindwtr</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={() => openLink('https://dongdongbh.tech')}
                        >
                            <Text style={[styles.settingLabel, { color: tc.text }]}>
                                {localize('Developer Website', '开发者网站')}
                            </Text>
                            <Text style={styles.linkText}>dongdongbh.tech</Text>
                        </TouchableOpacity>
                        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}>
                            <Text style={[styles.settingLabel, { color: tc.text }]}>{localize('License', '许可证')}</Text>
                            <Text style={[styles.settingValue, { color: tc.secondaryText }]}>AGPL-3.0</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: tc.border }]}
                            onPress={handleCheckUpdates}
                            disabled={isCheckingUpdate}
                        >
                            <Text style={[styles.settingLabel, { color: tc.text }]}>
                                {localize('Check for Updates', '检查更新')}
                            </Text>
                            {isCheckingUpdate ? (
                                <ActivityIndicator size="small" color="#3B82F6" />
                            ) : (
                                <Text style={styles.linkText}>
                                    {localize('Tap to check', '点击检查')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ============ MAIN SETTINGS SCREEN ============
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['bottom']}>
            <ScrollView style={styles.scrollView} contentContainerStyle={scrollContentStyle}>
                <View style={[styles.menuCard, { backgroundColor: tc.cardBg, marginTop: 16 }]}>
                    <MenuItem title={t('settings.general')} onPress={() => setCurrentScreen('general')} />
                    <MenuItem title={t('settings.gtd')} onPress={() => setCurrentScreen('gtd')} />
                    <MenuItem title={t('settings.notifications')} onPress={() => setCurrentScreen('notifications')} />
                    <MenuItem title={t('settings.dataSync')} onPress={() => setCurrentScreen('sync')} />
                    <MenuItem title={t('settings.advanced')} onPress={() => setCurrentScreen('advanced')} />
                    <MenuItem title={t('settings.about')} onPress={() => setCurrentScreen('about')} showIndicator={hasUpdateBadge} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16 },
    subHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    backButton: { fontSize: 16, fontWeight: '500' },
    subHeaderTitle: { fontSize: 18, fontWeight: '600' },
    description: { fontSize: 13, marginBottom: 12, paddingHorizontal: 4, lineHeight: 18 },
    sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
    menuCard: { borderRadius: 12, overflow: 'hidden' },
    menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
    menuLabel: { fontSize: 17, fontWeight: '400' },
    chevron: { fontSize: 24, fontWeight: '300' },
    menuRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    updateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
    settingCard: { borderRadius: 12, overflow: 'hidden' },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    settingRowColumn: { padding: 16 },
    sectionHeaderText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
    taskEditorRow: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 16, position: 'relative' },
    taskEditorRowBorder: { borderTopWidth: 1 },
    taskEditorRowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    taskEditorCheckSlot: { width: 28, alignItems: 'center', marginRight: 12 },
    taskEditorDragHandle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    settingInfo: { flex: 1, marginRight: 16 },
    settingLabel: { fontSize: 16, fontWeight: '500' },
    settingDescription: { fontSize: 13, marginTop: 2 },
    settingValue: { fontSize: 16 },
    linkText: { fontSize: 16, color: '#3B82F6' },
    helpBox: { borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1 },
    helpTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    helpText: { fontSize: 13, lineHeight: 20 },
    backendToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    backendOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    backendOptionText: { fontSize: 13, fontWeight: '700' },
    dropdownButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 8,
    },
    dropdownValue: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
    },
    dropdownChevron: {
        fontSize: 14,
        fontWeight: '600',
    },
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        padding: 20,
    },
    pickerCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        maxHeight: '70%',
    },
    pickerTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 12,
    },
    pickerList: {
        flexGrow: 0,
    },
    pickerListContent: {
        gap: 8,
    },
    pickerOption: {
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    pickerOptionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    inputGroup: { padding: 16 },
    textInput: { marginTop: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});
