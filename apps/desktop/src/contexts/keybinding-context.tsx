import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskStore } from '@mindwtr/core';
import { useLanguage } from './language-context';
import { KeybindingHelpModal } from '../components/KeybindingHelpModal';

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

function triggerGlobalSearch() {
    const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
    });
    window.dispatchEvent(event);
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
    const store = useTaskStore();
    const settings = store.settings || {};
    const updateSettings = store.updateSettings || (async () => {});
    const { t } = useLanguage();

    const [style, setStyleState] = useState<KeybindingStyle>('vim');
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    const isSidebarCollapsed = settings.sidebarCollapsed ?? false;
    const toggleSidebar = useCallback(() => {
        updateSettings({ sidebarCollapsed: !isSidebarCollapsed }).catch(console.error);
    }, [updateSettings, isSidebarCollapsed]);

    const scopeRef = useRef<TaskListScope | null>(null);
    const pendingRef = useRef<{ key: string | null; timestamp: number }>({ key: null, timestamp: 0 });

    useEffect(() => {
        if (settings.keybindingStyle === 'vim' || settings.keybindingStyle === 'emacs') {
            setStyleState(settings.keybindingStyle);
        }
    }, [settings.keybindingStyle]);

    const setStyle = useCallback((next: KeybindingStyle) => {
        setStyleState(next);
        updateSettings({ keybindingStyle: next }).catch(console.error);
    }, [updateSettings]);

    const registerTaskListScope = useCallback((scope: TaskListScope | null) => {
        scopeRef.current = scope;
    }, []);

    const openHelp = useCallback(() => setIsHelpOpen(true), []);

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
                    e.preventDefault();
                    scope?.selectNext();
                    break;
                case 'k':
                    e.preventDefault();
                    scope?.selectPrev();
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
    }, [style, vimGoMap, emacsAltMap, onNavigate, isHelpOpen, toggleSidebar]);

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
