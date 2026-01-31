import { create } from 'zustand';
import type { TaskPriority, TimeEstimate } from '@mindwtr/core';

const toastTimeouts = new Map<string, number>();

interface UiState {
    isFocusMode: boolean;
    setFocusMode: (value: boolean) => void;
    toggleFocusMode: () => void;
    toasts: Array<{ id: string; message: string; tone: 'success' | 'error' | 'info' }>;
    showToast: (message: string, tone?: 'success' | 'error' | 'info', durationMs?: number) => void;
    dismissToast: (id: string) => void;
    listFilters: {
        tokens: string[];
        priorities: TaskPriority[];
        estimates: TimeEstimate[];
        open: boolean;
    };
    setListFilters: (partial: Partial<UiState['listFilters']>) => void;
    resetListFilters: () => void;
    listOptions: {
        showDetails: boolean;
    };
    setListOptions: (partial: Partial<UiState['listOptions']>) => void;
    editingTaskId: string | null;
    setEditingTaskId: (value: string | null) => void;
    boardFilters: {
        selectedProjectIds: string[];
        open: boolean;
    };
    setBoardFilters: (partial: Partial<UiState['boardFilters']>) => void;
    projectView: {
        selectedProjectId: string | null;
    };
    setProjectView: (partial: Partial<UiState['projectView']>) => void;
}

export const useUiStore = create<UiState>((set) => ({
    isFocusMode: false,
    setFocusMode: (value) => set({ isFocusMode: value }),
    toggleFocusMode: () => set((state) => ({ isFocusMode: !state.isFocusMode })),
    toasts: [],
    showToast: (message, tone = 'info', durationMs = 3000) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
        const timeoutId = window.setTimeout(() => {
            toastTimeouts.delete(id);
            set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
        }, durationMs);
        toastTimeouts.set(id, timeoutId);
    },
    dismissToast: (id) => {
        const timeoutId = toastTimeouts.get(id);
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            toastTimeouts.delete(id);
        }
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    },
    listFilters: {
        tokens: [],
        priorities: [],
        estimates: [],
        open: false,
    },
    setListFilters: (partial) =>
        set((state) => ({ listFilters: { ...state.listFilters, ...partial } })),
    resetListFilters: () =>
        set((state) => ({
            listFilters: {
                ...state.listFilters,
                tokens: [],
                priorities: [],
                estimates: [],
            },
        })),
    listOptions: {
        showDetails: true,
    },
    setListOptions: (partial) =>
        set((state) => ({ listOptions: { ...state.listOptions, ...partial } })),
    editingTaskId: null,
    setEditingTaskId: (value) => set({ editingTaskId: value }),
    boardFilters: {
        selectedProjectIds: [],
        open: false,
    },
    setBoardFilters: (partial) =>
        set((state) => ({ boardFilters: { ...state.boardFilters, ...partial } })),
    projectView: {
        selectedProjectId: null,
    },
    setProjectView: (partial) =>
        set((state) => ({ projectView: { ...state.projectView, ...partial } })),
}));
