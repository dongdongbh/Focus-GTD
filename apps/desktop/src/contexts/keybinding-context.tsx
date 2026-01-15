import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { shallow, useTaskStore } from '@mindwtr/core';
import { useLanguage } from './language-context';
import { KeybindingHelpModal } from '../components/KeybindingHelpModal';
import { isTauriRuntime } from '../lib/runtime';
import { reportError } from '../lib/report-error';
import { useUiStore } from '../store/ui-store';

export type KeybindingStyle = 'vim' | 'emacs';

export interface TaskListScope {
    kind: 'taskList';
    selectNext: () => void;
    selectPrev: () => void;
    selectFirst: () => void;
    selectLast: () => void;
    editSelected: () => void;
    toggleDoneSelected: () => void;
    deleteSelected: () => void;
    focusAddInput?: () => void;
}

interface KeybindingContextType {
    style: KeybindingStyle;
    setStyle: (style: KeybindingStyle) => void;
    registerTaskListScope: (scope: TaskListScope | null) => void;
    openHelp: () => void;
}

const KeybindingContext = createContext<KeybindingContextType | undefined>(undefined);

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function moveSidebarFocus(target: EventTarget | null, direction: 'next' | 'prev'): boolean {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const origin = active ?? (target instanceof HTMLElement ? target : null);
    if (!origin) return false;
    const sidebar = origin.closest('[data-sidebar-nav]');
    if (!sidebar) return false;
    const items = Array.from(sidebar.querySelectorAll<HTMLElement>('[data-sidebar-item]'));
    if (items.length === 0) return false;
    const currentIndex = active ? items.findIndex((item) => item === active) : -1;
    const nextIndex = currentIndex >= 0
        ? direction === 'next'
            ? Math.min(items.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1)
        : direction === 'next'
            ? 0
            : items.length - 1;
    items[nextIndex]?.focus();
    return true;
}

function focusSidebarCurrentView(view: string): boolean {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-item]'));
    if (items.length === 0) return false;
    const match = items.find((item) => item.dataset.view === view) ?? items[0];
    match?.focus();
    return Boolean(match);
}

function focusMainContent(): boolean {
    const main = document.querySelector<HTMLElement>('[data-main-content]');
    if (!main) return false;
    main.focus();
    return true;
}

function triggerGlobalSearch() {
    const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
    });
    window.dispatchEvent(event);
}

function triggerQuickAdd() {
    window.dispatchEvent(new Event('mindwtr:quick-add'));
}

export function KeybindingProvider({
    children,
    currentView,
    onNavigate,
}: {
    children: React.ReactNode;
    currentView: string;
    onNavigate: (view: string) => void;
}) {
    const isTest = import.meta.env.MODE === 'test' || import.meta.env.VITEST || process.env.NODE_ENV === 'test';
    const { settings, updateSettings } = useTaskStore(
        (state) => ({
            settings: state.settings,
            updateSettings: state.updateSettings,
        }),
        shallow
    );
    const { t } = useLanguage();
    const toggleFocusMode = useUiStore((state) => state.toggleFocusMode);

    const initialStyle: KeybindingStyle =
        settings.keybindingStyle === 'vim' || settings.keybindingStyle === 'emacs'
            ? settings.keybindingStyle
            : 'vim';
    const [style, setStyleState] = useState<KeybindingStyle>(initialStyle);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    const isSidebarCollapsed = settings.sidebarCollapsed ?? false;
    const toggleSidebar = useCallback(() => {
        updateSettings({ sidebarCollapsed: !isSidebarCollapsed }).catch((error) => reportError('Failed to update settings', error));
    }, [updateSettings, isSidebarCollapsed]);

    const scopeRef = useRef<TaskListScope | null>(null);
    const pendingRef = useRef<{ key: string | null; timestamp: number }>({ key: null, timestamp: 0 });

    useEffect(() => {
        if (isTest) return;
        const nextStyle = settings.keybindingStyle;
        if (nextStyle === 'vim' || nextStyle === 'emacs') {
            setStyleState((prev) => (prev === nextStyle ? prev : nextStyle));
        }
    }, [isTest, settings.keybindingStyle]);

    const setStyle = useCallback((next: KeybindingStyle) => {
        setStyleState(next);
        updateSettings({ keybindingStyle: next }).catch((error) => reportError('Failed to update settings', error));
    }, [updateSettings]);

    const registerTaskListScope = useCallback((scope: TaskListScope | null) => {
        scopeRef.current = scope;
    }, []);

    const openHelp = useCallback(() => setIsHelpOpen(true), []);
    const toggleFullscreen = useCallback(async () => {
        if (!isTauriRuntime()) return;
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const current = getCurrentWindow();
            const isFullscreen = await current.isFullscreen();
            await current.setFullscreen(!isFullscreen);
        } catch (error) {
            console.warn('Failed to toggle fullscreen', error);
        }
    }, []);

    const vimGoMap = useMemo<Record<string, string>>(() => ({
        i: 'inbox',
        n: 'next',
        a: 'agenda',
        p: 'projects',
        c: 'contexts',
        r: 'review',
        w: 'waiting',
        s: 'someday',
        l: 'calendar',
        b: 'board',
        d: 'done',
        A: 'archived',
    }), []);

    const emacsAltMap = vimGoMap;

    useEffect(() => {
        const handleVim = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'F11') {
                if (isTauriRuntime()) {
                    e.preventDefault();
                    void toggleFullscreen();
                }
                return;
            }
            if (isEditableTarget(e.target)) return;

            const scope = scopeRef.current;
            const now = Date.now();
            if (pendingRef.current.key && now - pendingRef.current.timestamp > 700) {
                pendingRef.current.key = null;
            }

            const pending = pendingRef.current.key;
            if (pending) {
                e.preventDefault();
                if (pending === 'g') {
                    if (e.key === 'g') {
                        scope?.selectFirst();
                    } else if (vimGoMap[e.key]) {
                        onNavigate(vimGoMap[e.key]);
                    }
                } else if (pending === 'd') {
                    if (e.key === 'd') {
                        scope?.deleteSelected();
                    }
                }
                pendingRef.current.key = null;
                return;
            }

            switch (e.key) {
                case 'j':
                    if (moveSidebarFocus(e.target, 'next')) {
                        e.preventDefault();
                        break;
                    }
                    e.preventDefault();
                    scope?.selectNext();
                    break;
                case 'k':
                    if (moveSidebarFocus(e.target, 'prev')) {
                        e.preventDefault();
                        break;
                    }
                    e.preventDefault();
                    scope?.selectPrev();
                    break;
                case 'h':
                    if (focusSidebarCurrentView(currentView)) {
                        e.preventDefault();
                    }
                    break;
                case 'l':
                    if (focusMainContent()) {
                        e.preventDefault();
                    }
                    break;
                case 'G':
                    e.preventDefault();
                    scope?.selectLast();
                    break;
                case 'e':
                    e.preventDefault();
                    scope?.editSelected();
                    break;
                case 'x':
                    e.preventDefault();
                    scope?.toggleDoneSelected();
                    break;
                case 'o':
                    e.preventDefault();
                    scope?.focusAddInput?.();
                    break;
                case '/':
                    e.preventDefault();
                    triggerGlobalSearch();
                    break;
                case '?':
                    e.preventDefault();
                    setIsHelpOpen(true);
                    break;
                case 'g':
                case 'd':
                    e.preventDefault();
                    pendingRef.current = { key: e.key, timestamp: now };
                    break;
                default:
                    break;
            }
        };

        const handleEmacs = (e: KeyboardEvent) => {
            if (e.key === 'F11') {
                if (isTauriRuntime()) {
                    e.preventDefault();
                    void toggleFullscreen();
                }
                return;
            }
            if (isEditableTarget(e.target)) return;
            const scope = scopeRef.current;

            if (e.altKey && !e.ctrlKey && !e.metaKey) {
                const view = emacsAltMap[e.key];
                if (view) {
                    e.preventDefault();
                    onNavigate(view);
                }
                return;
            }

            if (e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key) {
                    case 'n':
                        e.preventDefault();
                        scope?.selectNext();
                        break;
                    case 'p':
                        e.preventDefault();
                        scope?.selectPrev();
                        break;
                    case 'e':
                        e.preventDefault();
                        scope?.editSelected();
                        break;
                    case 't':
                        e.preventDefault();
                        scope?.toggleDoneSelected();
                        break;
                    case 'd':
                        e.preventDefault();
                        scope?.deleteSelected();
                        break;
                    case 'o':
                        e.preventDefault();
                        scope?.focusAddInput?.();
                        break;
                    case 's':
                        e.preventDefault();
                        triggerGlobalSearch();
                        break;
                    case 'h':
                    case '?':
                        e.preventDefault();
                        setIsHelpOpen(true);
                        break;
                    default:
                        break;
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isHelpOpen && e.key === 'Escape') {
                e.preventDefault();
                setIsHelpOpen(false);
                return;
            }
            if (!e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
                if (e.key === 'ArrowDown') {
                    if (moveSidebarFocus(e.target, 'next')) {
                        e.preventDefault();
                        return;
                    }
                    const scope = scopeRef.current;
                    if (scope) {
                        e.preventDefault();
                        scope.selectNext();
                        return;
                    }
                }
                if (e.key === 'ArrowUp') {
                    if (moveSidebarFocus(e.target, 'prev')) {
                        e.preventDefault();
                        return;
                    }
                    const scope = scopeRef.current;
                    if (scope) {
                        e.preventDefault();
                        scope.selectPrev();
                        return;
                    }
                }
                if (style === 'vim' && e.key === 'ArrowLeft') {
                    if (focusSidebarCurrentView(currentView)) {
                        e.preventDefault();
                        return;
                    }
                }
                if (style === 'vim' && e.key === 'ArrowRight') {
                    if (focusMainContent()) {
                        e.preventDefault();
                        return;
                    }
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyA' && !isEditableTarget(e.target)) {
                e.preventDefault();
                triggerQuickAdd();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'Backslash' && !isEditableTarget(e.target)) {
                e.preventDefault();
                toggleFocusMode();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'Backslash' && !isEditableTarget(e.target)) {
                e.preventDefault();
                toggleSidebar();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b' && !isEditableTarget(e.target)) {
                e.preventDefault();
                toggleSidebar();
                return;
            }
            if (style === 'emacs') {
                handleEmacs(e);
            } else {
                handleVim(e);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [style, vimGoMap, emacsAltMap, onNavigate, isHelpOpen, toggleSidebar, toggleFocusMode, currentView]);

    const contextValue = useMemo<KeybindingContextType>(() => ({
        style,
        setStyle,
        registerTaskListScope,
        openHelp,
    }), [style, setStyle, registerTaskListScope, openHelp]);

    return (
        <KeybindingContext.Provider value={contextValue}>
            {children}
            {isHelpOpen && (
                <KeybindingHelpModal
                    style={style}
                    onClose={() => setIsHelpOpen(false)}
                    currentView={currentView}
                    t={t}
                />
            )}
        </KeybindingContext.Provider>
    );
}

export function useKeybindings(): KeybindingContextType {
    const context = useContext(KeybindingContext);
    if (!context) {
        throw new Error('useKeybindings must be used within a KeybindingProvider');
    }
    return context;
}
