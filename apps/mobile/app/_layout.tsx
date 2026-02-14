import '../polyfills';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'react-native';
import 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert, AppState, AppStateStatus, SafeAreaView, Text, View } from 'react-native';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QuickCaptureProvider, type QuickCaptureOptions } from '../contexts/quick-capture-context';

import { ThemeProvider, useTheme } from '../contexts/theme-context';
import { LanguageProvider, useLanguage } from '../contexts/language-context';
import { setStorageAdapter, useTaskStore, flushPendingSave, isSupportedLanguage } from '@mindwtr/core';
import { mobileStorage } from '../lib/storage-adapter';
import { setNotificationOpenHandler, startMobileNotifications, stopMobileNotifications } from '../lib/notification-service';
import { performMobileSync } from '../lib/sync-service';
import { isLikelyOfflineSyncError, resolveBackend, type SyncBackend } from '../lib/sync-service-utils';
import { SYNC_BACKEND_KEY } from '../lib/sync-constants';
import { updateAndroidWidgetFromStore } from '../lib/widget-service';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { verifyPolyfills } from '../utils/verify-polyfills';
import { logError, logWarn, setupGlobalErrorLogging } from '../lib/app-log';
import { useThemeColors } from '../hooks/use-theme-colors';

type AutoSyncCadence = {
  minIntervalMs: number;
  debounceFirstChangeMs: number;
  debounceContinuousChangeMs: number;
  foregroundMinIntervalMs: number;
};

const AUTO_SYNC_BACKEND_CACHE_TTL_MS = 5_000;
const AUTO_SYNC_CADENCE_FILE: AutoSyncCadence = {
  minIntervalMs: 30_000,
  debounceFirstChangeMs: 8_000,
  debounceContinuousChangeMs: 15_000,
  foregroundMinIntervalMs: 45_000,
};
const AUTO_SYNC_CADENCE_REMOTE: AutoSyncCadence = {
  minIntervalMs: 5_000,
  debounceFirstChangeMs: 2_000,
  debounceContinuousChangeMs: 5_000,
  foregroundMinIntervalMs: 30_000,
};
const AUTO_SYNC_CADENCE_OFF: AutoSyncCadence = {
  minIntervalMs: 60_000,
  debounceFirstChangeMs: 15_000,
  debounceContinuousChangeMs: 30_000,
  foregroundMinIntervalMs: 60_000,
};

const getCadenceForBackend = (backend: SyncBackend): AutoSyncCadence => {
  if (backend === 'file') return AUTO_SYNC_CADENCE_FILE;
  if (backend === 'webdav' || backend === 'cloud') return AUTO_SYNC_CADENCE_REMOTE;
  return AUTO_SYNC_CADENCE_OFF;
};

// Initialize storage for mobile
let storageInitError: Error | null = null;
const logAppError = (error: unknown) => {
  void logError(error, { scope: 'app' });
};

try {
  setStorageAdapter(mobileStorage);
} catch (e) {
  storageInitError = e as Error;
  void logError(e, { scope: 'app', extra: { message: 'Failed to initialize storage adapter' } });
}

// Keep splash visible until app is ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutContent() {
  const router = useRouter();
  const { isDark, isReady: themeReady } = useTheme();
  const tc = useThemeColors();
  const { language, setLanguage, isReady: languageReady } = useLanguage();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [storageWarningShown, setStorageWarningShown] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const settingsLanguage = useTaskStore((state) => state.settings?.language);
  const appState = useRef(AppState.currentState);
  const lastAutoSyncAt = useRef(0);
  const syncDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncThrottleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widgetRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlight = useRef<Promise<void> | null>(null);
  const syncPending = useRef(false);
  const backgroundSyncPending = useRef(false);
  const isActive = useRef(true);
  const loadAttempts = useRef(0);
  const lastSyncErrorShown = useRef<string | null>(null);
  const lastSyncErrorAt = useRef(0);
  const syncCadenceRef = useRef<AutoSyncCadence>(AUTO_SYNC_CADENCE_REMOTE);
  const syncBackendCacheRef = useRef<{ backend: SyncBackend; readAt: number }>({
    backend: 'off',
    readAt: 0,
  });

  const refreshSyncCadence = useCallback(async (): Promise<AutoSyncCadence> => {
    const now = Date.now();
    const cached = syncBackendCacheRef.current;
    if (now - cached.readAt <= AUTO_SYNC_BACKEND_CACHE_TTL_MS) {
      syncCadenceRef.current = getCadenceForBackend(cached.backend);
      return syncCadenceRef.current;
    }
    const rawBackend = await AsyncStorage.getItem(SYNC_BACKEND_KEY);
    const backend = resolveBackend(rawBackend);
    syncBackendCacheRef.current = { backend, readAt: now };
    syncCadenceRef.current = getCadenceForBackend(backend);
    return syncCadenceRef.current;
  }, []);

  const runSync = useCallback((minIntervalMs = syncCadenceRef.current.minIntervalMs) => {
    if (!isActive.current) return;
    if (syncInFlight.current && appState.current !== 'active') {
      backgroundSyncPending.current = true;
      syncPending.current = true;
      return;
    }
    if (syncInFlight.current) {
      return;
    }
    const now = Date.now();
    if (now - lastAutoSyncAt.current < minIntervalMs) {
      if (!syncThrottleTimer.current) {
        const waitMs = Math.max(0, minIntervalMs - (now - lastAutoSyncAt.current));
        syncThrottleTimer.current = setTimeout(() => {
          syncThrottleTimer.current = null;
          runSync(0);
        }, waitMs);
      }
      return;
    }
    lastAutoSyncAt.current = now;
    syncPending.current = false;

    syncInFlight.current = (async () => {
      await flushPendingSave().catch(logAppError);
      const result = await performMobileSync().catch((error) => ({ success: false, error: String(error) }));
      if (!result.success && result.error) {
        if (isLikelyOfflineSyncError(result.error)) {
          return;
        }
        const nowMs = Date.now();
        const shouldShow = result.error !== lastSyncErrorShown.current && nowMs - lastSyncErrorAt.current > 10 * 60 * 1000;
        if (shouldShow) {
          lastSyncErrorShown.current = result.error;
          lastSyncErrorAt.current = nowMs;
          Alert.alert('Sync failed', 'Please check your sync settings and try again.');
        }
      }
    })().finally(() => {
      syncInFlight.current = null;
      if (appState.current !== 'active' && backgroundSyncPending.current) {
        backgroundSyncPending.current = false;
        syncPending.current = true;
        return;
      }
      if (syncPending.current && isActive.current) {
        // Avoid immediate back-to-back sync loops while user is actively editing.
        runSync(syncCadenceRef.current.minIntervalMs);
      }
    });
  }, []);

  useEffect(() => {
    setNotificationOpenHandler((payload) => {
      const taskId = typeof payload?.taskId === 'string' ? payload.taskId : undefined;
      const projectId = typeof payload?.projectId === 'string' ? payload.projectId : undefined;
      const kind = typeof payload?.kind === 'string' ? payload.kind : undefined;
      if (taskId) {
        useTaskStore.getState().setHighlightTask(taskId);
        const openToken = typeof payload?.notificationId === 'string' ? payload.notificationId : String(Date.now());
        router.push({ pathname: '/focus', params: { taskId, openToken } });
        return;
      }
      if (projectId) {
        router.push({ pathname: '/projects-screen', params: { projectId } });
        return;
      }
      if (kind === 'daily-digest' || kind === 'weekly-review') {
        router.push('/review');
      }
    });
    return () => {
      setNotificationOpenHandler(null);
    };
  }, [router]);

  const requestSync = useCallback((minIntervalMs?: number) => {
    syncPending.current = true;
    if (typeof minIntervalMs === 'number') {
      runSync(minIntervalMs);
      return;
    }
    void refreshSyncCadence()
      .then((cadence) => runSync(cadence.minIntervalMs))
      .catch(logAppError);
  }, [refreshSyncCadence, runSync]);

  // Auto-sync on data changes with debounce
  useEffect(() => {
    setupGlobalErrorLogging();
    void refreshSyncCadence().catch(logAppError);
    const unsubscribe = useTaskStore.subscribe((state, prevState) => {
      if (state.lastDataChangeAt === prevState.lastDataChangeAt) return;
      // Debounce sync to batch frequent edits and avoid UI jank from constant sync churn.
      const cadence = syncCadenceRef.current;
      const hadTimer = !!syncDebounceTimer.current;
      if (syncDebounceTimer.current) {
        clearTimeout(syncDebounceTimer.current);
      }
      const debounceMs = hadTimer ? cadence.debounceContinuousChangeMs : cadence.debounceFirstChangeMs;
      syncDebounceTimer.current = setTimeout(() => {
        if (!isActive.current) return;
        requestSync();
      }, debounceMs);
    });

    return () => {
      unsubscribe();
      if (syncDebounceTimer.current) {
        clearTimeout(syncDebounceTimer.current);
      }
      if (syncThrottleTimer.current) {
        clearTimeout(syncThrottleTimer.current);
      }
    };
  }, [requestSync]);

  useEffect(() => {
    if (!settingsLanguage || !isSupportedLanguage(settingsLanguage)) return;
    if (settingsLanguage === language) return;
    void setLanguage(settingsLanguage);
  }, [language, settingsLanguage, setLanguage]);

  useEffect(() => {
    if (!hasShareIntent) return;
    const sharedText =
      typeof shareIntent?.text === 'string'
        ? shareIntent.text
        : typeof shareIntent?.webUrl === 'string'
          ? shareIntent.webUrl
          : '';
    if (sharedText.trim()) {
      router.replace({
        pathname: '/capture',
        params: { text: encodeURIComponent(sharedText.trim()) },
      });
    } else {
      void logError(new Error('Share intent payload missing text'), { scope: 'share-intent' });
      router.replace('/capture');
    }
    resetShareIntent();
  }, [hasShareIntent, resetShareIntent, router, shareIntent?.text, shareIntent?.webUrl]);

  // Sync on foreground/background transitions
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (!isActive.current) return;
      const previousState = appState.current;
      const wasInactiveOrBackground = previousState === 'inactive' || previousState === 'background';
      const nextInactiveOrBackground = nextAppState === 'inactive' || nextAppState === 'background';
      if (wasInactiveOrBackground && nextAppState === 'active') {
        // Coming back to foreground - sync to get latest data
        void refreshSyncCadence()
          .then((cadence) => {
            const now = Date.now();
            if (now - lastAutoSyncAt.current > cadence.foregroundMinIntervalMs) {
              requestSync(0);
            }
          })
          .catch(logAppError);
        updateAndroidWidgetFromStore().catch(logAppError);
        if (widgetRefreshTimer.current) {
          clearTimeout(widgetRefreshTimer.current);
        }
        widgetRefreshTimer.current = setTimeout(() => {
          if (!isActive.current) return;
          updateAndroidWidgetFromStore().catch(logAppError);
        }, 800);
      }
      if (previousState === 'active' && nextInactiveOrBackground) {
        // Going to background - flush saves and sync
        if (syncDebounceTimer.current) {
          clearTimeout(syncDebounceTimer.current);
          syncDebounceTimer.current = null;
        }
        requestSync(0);
      }
      if (wasInactiveOrBackground && nextAppState === 'active') {
        if (backgroundSyncPending.current) {
          backgroundSyncPending.current = false;
          requestSync(0);
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription?.remove();
      isActive.current = false;
      if (syncDebounceTimer.current) {
        clearTimeout(syncDebounceTimer.current);
      }
      if (syncThrottleTimer.current) {
        clearTimeout(syncThrottleTimer.current);
      }
      if (widgetRefreshTimer.current) {
        clearTimeout(widgetRefreshTimer.current);
      }
      if (retryLoadTimer.current) {
        clearTimeout(retryLoadTimer.current);
      }
      syncInFlight.current = null;
      // Flush on unmount/reload as well
      flushPendingSave().catch(logAppError);
    };
  }, [requestSync]);

  useEffect(() => {
    // Show storage error alert if initialization failed
    if (storageInitError && !storageWarningShown) {
      setStorageWarningShown(true);
      Alert.alert(
        '⚠️ Storage Error',
        'Failed to initialize storage. Your data will NOT be saved. Please restart the app.\n\nError: ' + storageInitError.message,
        [{ text: 'OK' }]
      );
    }

    // Load data from storage
    let cancelled = false;
    const loadData = async () => {
      try {
        loadAttempts.current += 1;
        if (retryLoadTimer.current) {
          clearTimeout(retryLoadTimer.current);
          retryLoadTimer.current = null;
        }
        if (cancelled) return;
        if (storageInitError) {
          return;
        }
        // Verify critical polyfills
        verifyPolyfills();

        const store = useTaskStore.getState();
        await store.fetchData();
        if (cancelled) return;
        if (store.settings.notificationsEnabled !== false) {
          startMobileNotifications().catch(logAppError);
        }
        updateAndroidWidgetFromStore().catch(logAppError);
        if (widgetRefreshTimer.current) {
          clearTimeout(widgetRefreshTimer.current);
        }
        widgetRefreshTimer.current = setTimeout(() => {
          if (!isActive.current) return;
          updateAndroidWidgetFromStore().catch(logAppError);
        }, 800);
        // Initial sync after cold start
        if (!cancelled && isActive.current) {
          requestSync(0);
        }
      } catch (e) {
        void logError(e, { scope: 'app', extra: { message: 'Failed to load data' } });
        if (cancelled) return;
        if (loadAttempts.current < 3 && isActive.current) {
          if (retryLoadTimer.current) {
            clearTimeout(retryLoadTimer.current);
          }
          retryLoadTimer.current = setTimeout(() => {
            if (isActive.current) {
              loadData();
            }
          }, 2000);
          return;
        }
        Alert.alert(
          '⚠️ Data Load Error',
          'Failed to load your data. Some tasks may be missing.\n\nError: ' + (e as Error).message,
          [{ text: 'OK' }]
        );
      } finally {
        if (!cancelled) {
          setIsDataLoaded(true);
        }
      }
    };

    if (storageInitError) {
      setIsDataLoaded(true);
      return;
    }
    loadData();
    return () => {
      cancelled = true;
      if (retryLoadTimer.current) {
        clearTimeout(retryLoadTimer.current);
        retryLoadTimer.current = null;
      }
      if (widgetRefreshTimer.current) {
        clearTimeout(widgetRefreshTimer.current);
        widgetRefreshTimer.current = null;
      }
    };
  }, [storageWarningShown, storageInitError, requestSync]);

  useEffect(() => {
    let previousEnabled = useTaskStore.getState().settings.notificationsEnabled;
    const unsubscribe = useTaskStore.subscribe((state) => {
      const enabled = state.settings.notificationsEnabled;
      if (enabled === previousEnabled) return;
      previousEnabled = enabled;

      if (enabled === false) {
        stopMobileNotifications().catch(logAppError);
      } else {
        startMobileNotifications().catch(logAppError);
      }
    });

    return () => unsubscribe();
  }, []);

  const isAppReady = isDataLoaded && themeReady && languageReady;

  useEffect(() => {
    if (!isAppReady) return;
    if (typeof SplashScreen?.hideAsync === 'function') {
      SplashScreen.hideAsync().catch((error) => {
        void logWarn('Failed to hide splash screen', {
          scope: 'app',
          extra: { error: error instanceof Error ? error.message : String(error) },
        });
      });
    }
  }, [isAppReady]);

  if (storageInitError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tc.bg }}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: isDark ? '#e2e8f0' : '#0f172a', marginBottom: 12 }}>
            Storage unavailable
          </Text>
          <Text style={{ fontSize: 14, color: isDark ? '#94a3b8' : '#475569', lineHeight: 20 }}>
            Mindwtr could not initialize local storage, so changes won&apos;t be saved. Please restart the app or reinstall if the problem persists.
          </Text>
          <Text style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', marginTop: 16 }}>
            {storageInitError.message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAppReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tc.bg }}>
      <QuickCaptureProvider
        value={{
          openQuickCapture: (options?: QuickCaptureOptions) => {
            const params = new URLSearchParams();
            if (options?.initialValue) {
              params.set('initialValue', options.initialValue);
            }
            if (options?.initialProps) {
              params.set('initialProps', encodeURIComponent(JSON.stringify(options.initialProps)));
            }
            const query = params.toString();
            router.push(query ? `/capture?${query}` : '/capture');
          },
        }}
      >
        <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
            <Stack.Screen
              name="daily-review"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="global-search"
              options={{
                headerShown: false,
                presentation: 'modal',
                animation: 'slide_from_bottom'
              }}
            />
            <Stack.Screen
              name="capture"
              options={{
                headerShown: false,
                presentation: 'modal',
                animation: 'slide_from_bottom'
              }}
            />
            <Stack.Screen
              name="check-focus"
              options={{
                headerShown: false,
              }}
            />
          </Stack>
          <StatusBar
            barStyle={isDark ? 'light-content' : 'dark-content'}
            backgroundColor={tc.cardBg}
            translucent={false}
          />
        </NavigationThemeProvider>
      </QuickCaptureProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <LanguageProvider>
          <ErrorBoundary>
            <RootLayoutContent />
          </ErrorBoundary>
        </LanguageProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
