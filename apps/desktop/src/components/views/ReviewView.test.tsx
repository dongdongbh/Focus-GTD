import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewView } from './ReviewView';
import { LanguageProvider } from '../../contexts/language-context';

const renderWithProviders = (ui: React.ReactElement) => {
    return render(
        <LanguageProvider>
            {ui}
        </LanguageProvider>
    );
};

// Mock store - use vi.hoisted for proper hoisting
const mockUseTaskStore = vi.hoisted(() => vi.fn(() => ({
    tasks: [],
    projects: [],
})));

vi.mock('@mindwtr/core', () => ({
    useTaskStore: mockUseTaskStore,
    Task: {},
    Project: {},
    TaskStatus: {},
    translations: {
        en: {
            'review.timeFor': 'Time for your Weekly Review',
            'review.startReview': 'Start Review',
            'review.inboxStep': 'Process Inbox',
            'review.inboxZero': 'Inbox Zero Goal',
            'review.calendarStep': 'Review Calendar',
            'review.past14': 'Past 14 Days',
            'review.waitingStep': 'Waiting For',
            'review.projectsStep': 'Review Projects',
            'review.somedayStep': 'Someday/Maybe',
            'review.allDone': 'Review Complete!',
            'review.finish': 'Finish'
        }
    }
}));

// Mock TaskItem to simplify testing
vi.mock('../TaskItem', () => ({
    TaskItem: ({ task }: { task: { title: string } }) => <div data-testid="task-item">{task.title}</div>,
}));

describe('ReviewView', () => {
    it('starts at the intro step', () => {
        renderWithProviders(<ReviewView />);
        expect(screen.getByText('Time for your Weekly Review')).toBeInTheDocument();
        expect(screen.getByText('Start Review')).toBeInTheDocument();
    });

    it('navigates through the wizard steps', () => {
        renderWithProviders(<ReviewView />);

        // Intro -> Inbox
        fireEvent.click(screen.getByText('Start Review'));
        expect(screen.getByText('Process Inbox')).toBeInTheDocument();
        expect(screen.getByText('Inbox Zero Goal')).toBeInTheDocument();

        // Inbox -> Calendar
        fireEvent.click(screen.getByText('Next Step'));
        expect(screen.getByText('Review Calendar')).toBeInTheDocument();
        expect(screen.getByText('Past 14 Days')).toBeInTheDocument();

        // Calendar -> Waiting For
        fireEvent.click(screen.getByText('Next Step'));
        expect(screen.getByText('Waiting For')).toBeInTheDocument();

        // Waiting For -> Projects
        fireEvent.click(screen.getByText('Next Step'));
        expect(screen.getByText('Review Projects')).toBeInTheDocument();

        // Projects -> Someday/Maybe
        fireEvent.click(screen.getByText('Next Step'));
        expect(screen.getByText('Someday/Maybe')).toBeInTheDocument();

        // Someday/Maybe -> Completed
        fireEvent.click(screen.getByText('Next Step'));
        expect(screen.getByText('Review Complete!')).toBeInTheDocument();
        expect(screen.getByText('Finish')).toBeInTheDocument();
    });

    it('can navigate back', () => {
        renderWithProviders(<ReviewView />);

        // Go to Inbox
        fireEvent.click(screen.getByText('Start Review'));
        expect(screen.getByText('Process Inbox')).toBeInTheDocument();

        // Go back to Intro
        fireEvent.click(screen.getByText('Back'));
        expect(screen.getByText('Time for your Weekly Review')).toBeInTheDocument();
    });
});
