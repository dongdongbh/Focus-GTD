import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BoardView } from './BoardView';
import { LanguageProvider } from '../../contexts/language-context';
import { useTaskStore } from '@mindwtr/core';
import { useUiStore } from '../../store/ui-store';

vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PointerSensor: class {},
    useDroppable: () => ({ setNodeRef: () => {} }),
    useDraggable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        transform: null,
        isDragging: false,
    }),
    useSensor: () => ({}),
    useSensors: () => ([]),
    closestCorners: () => null,
}));

const renderWithProviders = () => {
    return render(
        <LanguageProvider>
            <BoardView />
        </LanguageProvider>
    );
};

describe('BoardView', () => {
    beforeEach(() => {
        useTaskStore.setState({
            tasks: [],
            projects: [],
            areas: [],
            settings: {},
        });
        useUiStore.setState({
            boardFilters: { selectedProjectIds: [], open: false },
        });
    });

    it('renders the column headers', () => {
        const { getByText } = renderWithProviders();
        expect(getByText('list.inbox')).toBeInTheDocument();
        expect(getByText('list.next')).toBeInTheDocument();
    });
});
