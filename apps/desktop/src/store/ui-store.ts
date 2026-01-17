import { create } from 'zustand';
import type { TaskPriority, TimeEstimate } from '@mindwtr/core';

interface UiState {
    isFocusMode: boolean;
    setFocusMode: (value: boolean) => void;
    toggleFocusMode: () => void;
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
