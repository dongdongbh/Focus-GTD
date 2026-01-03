import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TaskItem } from '../components/TaskItem';
import { Task } from '@mindwtr/core';
import { LanguageProvider } from '../contexts/language-context';

const mockTask: Task = {
    id: '1',
    title: 'Test Task',
    status: 'inbox',
    tags: [],
    contexts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe('TaskItem', () => {
    it('renders task title', () => {
        const { getByText } = render(
            <LanguageProvider>
                <TaskItem task={mockTask} />
            </LanguageProvider>
        );
        expect(getByText('Test Task')).toBeInTheDocument();
    });

    it('enters edit mode when Edit is clicked', () => {
        const { getAllByRole, getByDisplayValue } = render(
            <LanguageProvider>
                <TaskItem task={mockTask} />
            </LanguageProvider>
        );
        const editButtons = getAllByRole('button', { name: 'Edit' });
        fireEvent.click(editButtons[0]);
        expect(getByDisplayValue('Test Task')).toBeInTheDocument();
    });

    it('does not render checkbox when not in selection mode', () => {
        const { queryByRole } = render(
            <LanguageProvider>
                <TaskItem task={mockTask} />
            </LanguageProvider>
        );
        expect(queryByRole('checkbox')).toBeNull();
    });

    it('toggles selection when checkbox is clicked in selection mode', () => {
        const onToggleSelect = vi.fn();
        const { getByRole } = render(
            <LanguageProvider>
                <TaskItem
                    task={mockTask}
                    selectionMode
                    isMultiSelected={false}
                    onToggleSelect={onToggleSelect}
                />
            </LanguageProvider>
        );
        const checkbox = getByRole('checkbox', { name: 'Select task' });
        fireEvent.click(checkbox);
        expect(onToggleSelect).toHaveBeenCalledTimes(1);
    });
});
