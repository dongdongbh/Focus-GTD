import { useEffect, useState, useRef, useTransition, useCallback, Suspense, lazy } from 'react';
import { Layout } from './components/Layout';
import { ListView } from './components/views/ListView';
import { CalendarView } from './components/views/CalendarView';
const BoardView = lazy(() => import('./components/views/BoardView').then((m) => ({ default: m.BoardView })));
const ProjectsView = lazy(() => import('./components/views/ProjectsView').then((m) => ({ default: m.ProjectsView })));
import { ContextsView } from './components/views/ContextsView';
const ReviewView = lazy(() => import('./components/views/ReviewView').then((m) => ({ default: m.ReviewView })));
import { TutorialView } from './components/views/TutorialView';
const SettingsView = lazy(() => import('./components/views/SettingsView').then((m) => ({ default: m.SettingsView })));
import { ArchiveView } from './components/views/ArchiveView';
import { TrashView } from './components/views/TrashView';
import { AgendaView } from './components/views/AgendaView';
import { SearchView } from './components/views/SearchView';
import { useTaskStore, flushPendingSave } from '@mindwtr/core';
import { GlobalSearch } from './components/GlobalSearch';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useLanguage } from './contexts/language-context';
import { KeybindingProvider } from './contexts/keybinding-context';
import { QuickAddModal } from './components/QuickAddModal';
import { CloseBehaviorModal } from './components/CloseBehaviorModal';
import { startDesktopNotifications, stopDesktopNotifications } from './lib/notification-service';
import { SyncService } from './lib/sync-service';
import { isFlatpakRuntime, isTauriRuntime } from './lib/runtime';
import { logError } from './lib/app-log';
import { useUiStore } from './store/ui-store';

function App() {
    const [currentView, setCurrentView] = useState('inbox');
    const [activeView, setActiveView] = useState('inbox');
    const [, startTransition] = useTransition();
    const fetchData = useTaskStore((state) => state.fetchData);
    const isLoading = useTaskStore((state) => state.isLoading);
    const setError = useTaskStore((state) => state.setError);
    const windowDecorations = useTaskStore((state) => state.settings?.window?.decorations);
    const closeBehavior = useTaskStore((state) => state.settings?.window?.closeBehavior ?? 'ask');
    const showTray = useTaskStore((state) => state.settings?.window?.showTray);
    const updateSettings = useTaskStore((state) => state.updateSettings);
    const showToast = useUiStore((state) => state.showToast);
    const isFlatpak = isFlatpakRuntime();
    const { t } = useLanguage();
    const isActiveRef = useRef(true);
    const lastAutoSyncRef = useRef(0);
    const syncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const syncInFlightRef = useRef<Promise<void> | null>(null);
    const syncQueuedRef = useRef(false);
    const lastSyncErrorRef = useRef<string | null>(null);
    const lastSyncErrorAtRef = useRef(0);
    const [closePromptOpen, setClosePromptOpen] = useState(false);
    const [closePromptRemember, setClosePromptRemember] = useState(false);

    const translateOrFallback = useCallback((key: string, fallback: string) => {
        const value = t(key);
        return value === key ? fallback : value;
    }, [t]);

    const hideToTray = useCallback(async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const window = getCurrentWindow();
        try {
            await window.setSkipTaskbar(true);
        } catch (error) {
            void logError(error, { scope: 'window', step: 'setSkipTaskbar' });
        }
        await window.hide();
    }, []);

    const quitApp = useCallback(async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('quit_app');
    }, []);

    useEffect(() => {
        if (import.meta.env.MODE === 'test' || import.meta.env.VITEST || process.env.NODE_ENV === 'test') return;
        fetchData();

        const reportError = (label: string, error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setError(`${label}: ${message}`);
            void logError(error, { scope: 'app', step: label });
        };

        const handleUnload = () => {
            flushPendingSave().catch((error) => reportError('Save failed', error));
        };
        window.addEventListener('beforeunload', handleUnload);
        let unlistenClose: (() => void) | null = null;
        let closingPromise: Promise<void> | null = null;
        let isClosing = false;
        let disposed = false;
        if (isTauriRuntime()) {
            import('@tauri-apps/api/window')
                .then(async ({ getCurrentWindow }) => {
                    const window = getCurrentWindow();
                    const unlisten = await window.onCloseRequested(async (event) => {
                        if (closingPromise || isClosing) return;
                        isClosing = true;
                        event.preventDefault();
                        closingPromise = flushPendingSave()
                            .catch((error) => reportError('Save failed', error))
                            .finally(() => {
                                closingPromise = null;
                                isClosing = false;
                            });
                        await closingPromise;
                    });
                    if (disposed) {
                        unlisten();
                    } else {
                        unlistenClose = unlisten;
                    }
                })
                .catch((error) => reportError('Window listener failed', error));
        }

        if (isTauriRuntime()) {
            startDesktopNotifications().catch((error) => reportError('Notifications failed', error));
            SyncService.startFileWatcher().catch((error) => reportError('File watcher failed', error));
        }

        isActiveRef.current = true;

        const canSync = async () => {
            const backend = await SyncService.getSyncBackend();
            if (backend === 'off') return false;
            if (backend === 'file') {
                const path = await SyncService.getSyncPath();
                return Boolean(path);
            }
            if (backend === 'webdav') {
                const { url } = await SyncService.getWebDavConfig();
                return Boolean(url);
            }
            if (backend === 'cloud') {
                const { url } = await SyncService.getCloudConfig();
                return Boolean(url);
            }
            return false;
        };

        const performSync = async () => {
            if (!isActiveRef.current || !isTauriRuntime()) return;
            const now = Date.now();
            if (now - lastAutoSyncRef.current < 5_000) return;
            if (!(await canSync())) return;

            lastAutoSyncRef.current = now;
            await flushPendingSave().catch((error) => reportError('Save failed', error));
            const result = await SyncService.performSync();
            if (!result.success && result.error) {
                const nowMs = Date.now();
                const shouldAlert = result.error !== lastSyncErrorRef.current || nowMs - lastSyncErrorAtRef.current > 10 * 60 * 1000;
                if (shouldAlert) {
                    lastSyncErrorRef.current = result.error;
                    lastSyncErrorAtRef.current = nowMs;
                    showToast(`Sync failed: ${result.error}`, 'error', 6000);
                }
            }
        };

        const queueSync = async () => {
            if (!isActiveRef.current || !isTauriRuntime()) return;
            if (syncInFlightRef.current) {
                syncQueuedRef.current = true;
                return;
            }
            syncInFlightRef.current = performSync()
                .catch((error) => reportError('Sync failed', error))
                .finally(() => {
                    const shouldQueue = syncQueuedRef.current;
                    syncQueuedRef.current = false;
                    syncInFlightRef.current = null;
                    if (shouldQueue && isActiveRef.current) {
                        void queueSync();
                    }
                });
            await syncInFlightRef.current;
        };

        const focusListener = () => {
            // On focus, use 30s throttle to avoid excessive syncs
            const now = Date.now();
            if (now - lastAutoSyncRef.current > 30_000) {
                queueSync().catch((error) => reportError('Sync failed', error));
            }
        };

        const blurListener = () => {
            // Sync when window loses focus
            flushPendingSave().catch((error) => reportError('Save failed', error));
            queueSync().catch((error) => reportError('Sync failed', error));
        };

        // Auto-sync on data changes with debounce
        const storeUnsubscribe = useTaskStore.subscribe((state, prevState) => {
            if (state.lastDataChangeAt === prevState.lastDataChangeAt) return;
            const hadTimer = !!syncDebounceTimerRef.current;
            if (syncDebounceTimerRef.current) {
                clearTimeout(syncDebounceTimerRef.current);
            }
            const debounceMs = hadTimer ? 5000 : 2000;
            syncDebounceTimerRef.current = setTimeout(() => {
                if (!isActiveRef.current) return;
                queueSync().catch((error) => reportError('Sync failed', error));
            }, debounceMs);
        });

        // Background/on-resume sync (focus/blur) and initial auto-sync
        window.addEventListener('focus', focusListener);
        window.addEventListener('blur', blurListener);
        initialSyncTimerRef.current = setTimeout(() => {
            if (!isActiveRef.current) return;
            queueSync().catch((error) => reportError('Sync failed', error));
        }, 1500);

        return () => {
            disposed = true;
            isActiveRef.current = false;
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('focus', focusListener);
            window.removeEventListener('blur', blurListener);
            if (unlistenClose) {
                unlistenClose();
            }
            storeUnsubscribe();
            if (syncDebounceTimerRef.current) {
                clearTimeout(syncDebounceTimerRef.current);
            }
            if (initialSyncTimerRef.current) {
                clearTimeout(initialSyncTimerRef.current);
            }
            stopDesktopNotifications();
            SyncService.stopFileWatcher().catch((error) => reportError('File watcher failed', error));
        };
    }, [fetchData, setError]);

    useEffect(() => {
        if (!isTauriRuntime()) return;
        let unlisten: (() => void) | undefined;
        const reportCloseError = (label: string, error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setError(`${label}: ${message}`);
            void logError(error, { scope: 'app', step: label });
        };

        const setup = async () => {
            const { listen } = await import('@tauri-apps/api/event');
            unlisten = await listen('close-requested', async () => {
                if (isFlatpak) {
                    await quitApp().catch((error) => reportCloseError('Quit failed', error));
                    return;
                }
                if (closeBehavior === 'quit') {
                    await quitApp().catch((error) => reportCloseError('Quit failed', error));
                    return;
                }
                if (closeBehavior === 'tray') {
                    // If tray is hidden, quit instead of trying to hide to an invisible tray
                    if (showTray === false) {
                        await quitApp().catch((error) => reportCloseError('Quit failed', error));
                        return;
                    }
                    await hideToTray().catch((error) => reportCloseError('Hide failed', error));
                    return;
                }
                if (!closePromptOpen) {
                    setClosePromptRemember(false);
                    setClosePromptOpen(true);
                }
            });
        };

        setup().catch((error) => reportCloseError('Close listener failed', error));

        return () => {
            if (unlisten) unlisten();
        };
    }, [closeBehavior, closePromptOpen, hideToTray, isFlatpak, quitApp, setError, showTray]);

    useEffect(() => {
        if (!isTauriRuntime()) return;
        if (windowDecorations === undefined) return;
        if (!/linux/i.test(navigator.userAgent || '')) return;
        let cancelled = false;
        import('@tauri-apps/api/window')
            .then(({ getCurrentWindow }) => {
                if (cancelled) return;
                return getCurrentWindow().setDecorations(windowDecorations);
            })
            .catch((error) => void logError(error, { scope: 'window', step: 'setDecorations' }));
        return () => {
            cancelled = true;
        };
    }, [windowDecorations]);

    useEffect(() => {
        if (!isTauriRuntime()) return;
        if (showTray === undefined) return;
        let cancelled = false;
        import('@tauri-apps/api/core')
            .then(async ({ invoke }) => {
                if (cancelled) return;
                await invoke('set_tray_visible', { visible: showTray !== false });
            })
            .catch((error) => void logError(error, { scope: 'tray', step: 'setVisible' }));
        return () => {
            cancelled = true;
        };
    }, [showTray]);

    useEffect(() => {
        if (import.meta.env.MODE === 'test' || import.meta.env.VITEST || process.env.NODE_ENV === 'test') return;
        const idleCallback =
            (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
            ?? ((cb: () => void) => window.setTimeout(cb, 200));
        const idleCancel =
            (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
            ?? ((id: number) => window.clearTimeout(id));
        const id = idleCallback(() => {
            void import('./components/views/SettingsView');
            void import('./components/views/BoardView');
            void import('./components/views/ProjectsView');
            void import('./components/views/ReviewView');
        });
        return () => idleCancel(id);
    }, []);

    const renderView = () => {
        if (activeView.startsWith('savedSearch:')) {
            const savedSearchId = activeView.replace('savedSearch:', '');
            return <SearchView savedSearchId={savedSearchId} />;
        }
        switch (activeView) {
            case 'inbox':
                return <ListView title={t('list.inbox')} statusFilter="inbox" />;
            case 'agenda':
                return <AgendaView />;
            case 'next':
                return <AgendaView />;
            case 'someday':
                return <ListView title={t('list.someday')} statusFilter="someday" />;
            case 'reference':
                return <ListView title={t('list.reference')} statusFilter="reference" />;
            case 'waiting':
                return <ListView title={t('list.waiting')} statusFilter="waiting" />;
            case 'done':
                return <ListView title={t('list.done')} statusFilter="done" />;
            case 'calendar':
                return <CalendarView />;
            case 'board':
                return <BoardView />;
            case 'projects':
                return <ProjectsView />;
            case 'contexts':
                return <ContextsView />;
            case 'review':
                return <ReviewView />;
            case 'tutorial':
                return <TutorialView />;
            case 'settings':
                return <SettingsView />;
            case 'archived':
                return <ArchiveView />;
            case 'trash':
                return <TrashView />;
            default:
                return <ListView title={t('list.inbox')} statusFilter="inbox" />;
        }
    };

    const handleViewChange = useCallback((view: string) => {
        setCurrentView(view);
        startTransition(() => {
            setActiveView(view);
        });
    }, [startTransition]);

    const LoadingFallback = () => (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <div className="w-full max-w-md space-y-3">
                <div className="h-4 w-2/3 rounded bg-muted/60 animate-pulse" />
                <div className="h-4 w-5/6 rounded bg-muted/50 animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-muted/40 animate-pulse" />
            </div>
        </div>
    );

    useEffect(() => {
        const handler: EventListener = (event) => {
            const detail = (event as CustomEvent<{ view?: string }>).detail;
            if (detail?.view) {
                handleViewChange(detail.view);
            }
        };
        window.addEventListener('mindwtr:navigate', handler);
        return () => window.removeEventListener('mindwtr:navigate', handler);
    }, [handleViewChange]);

    return (
        <ErrorBoundary>
            <KeybindingProvider currentView={currentView} onNavigate={handleViewChange}>
                <Layout currentView={currentView} onViewChange={handleViewChange}>
                    <Suspense
                        fallback={(
                            <LoadingFallback />
                        )}
                    >
                        {isLoading ? (
                            <LoadingFallback />
                        ) : (
                            renderView()
                        )}
                    </Suspense>
                    <GlobalSearch onNavigate={(view, _id) => handleViewChange(view)} />
                    <QuickAddModal />
                    <CloseBehaviorModal
                        isOpen={closePromptOpen}
                        title={translateOrFallback('settings.closeBehaviorPromptTitle', 'Close Mindwtr?')}
                        description={translateOrFallback(
                            'settings.closeBehaviorPromptBody',
                            'Do you want Mindwtr to stay running in the tray or quit completely?'
                        )}
                        rememberLabel={translateOrFallback('settings.closeBehaviorRemember', "Don't ask again")}
                        stayLabel={translateOrFallback('settings.closeBehaviorTray', 'Keep running in tray')}
                        quitLabel={translateOrFallback('settings.closeBehaviorQuit', 'Quit the app')}
                        cancelLabel={translateOrFallback('common.cancel', 'Cancel')}
                        remember={closePromptRemember}
                        onRememberChange={setClosePromptRemember}
                        onCancel={() => setClosePromptOpen(false)}
                        onStay={() => {
                            const apply = async () => {
                                if (closePromptRemember) {
                                    await updateSettings({
                                        window: {
                                            ...(useTaskStore.getState().settings?.window ?? {}),
                                            closeBehavior: 'tray',
                                        },
                                    });
                                    await flushPendingSave();
                                }
                                setClosePromptOpen(false);
                                await hideToTray();
                            };
                            apply().catch((error) => {
                                setClosePromptOpen(false);
                                void logError(error, { scope: 'app', step: 'close-tray' });
                            });
                        }}
                        onQuit={() => {
                            const apply = async () => {
                                if (closePromptRemember) {
                                    await updateSettings({
                                        window: {
                                            ...(useTaskStore.getState().settings?.window ?? {}),
                                            closeBehavior: 'quit',
                                        },
                                    });
                                    await flushPendingSave();
                                }
                                setClosePromptOpen(false);
                                await quitApp();
                            };
                            apply().catch((error) => {
                                setClosePromptOpen(false);
                                void logError(error, { scope: 'app', step: 'close-quit' });
                            });
                        }}
                    />
                </Layout>
            </KeybindingProvider>
        </ErrorBoundary>
    );
}

export default App;
