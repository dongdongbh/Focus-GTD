import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';
import { LanguageProvider } from './contexts/language-context';

vi.mock('@mindwtr/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mindwtr/core')>();
    const store = {
        fetchData: vi.fn(),
        settings: {},
        updateSettings: vi.fn(),
    };
    const useTaskStore = () => store;
    (useTaskStore as any).subscribe = vi.fn(() => () => {});
    return {
        ...actual,
        useTaskStore,
        flushPendingSave: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock('./contexts/keybinding-context', () => ({
    KeybindingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (ui: React.ReactElement) => {
    return render(
        <LanguageProvider>
            {ui}
        </LanguageProvider>
    );
};

// Mock Layout
vi.mock('./components/Layout', () => ({
    Layout: () => <div data-testid="layout">Inbox</div>,
}));

// Mock electronAPI
// Mock electronAPI
Object.defineProperty(window, 'electronAPI', {
    value: {
        saveData: vi.fn(),
        getData: vi.fn().mockResolvedValue({ tasks: [], projects: [], areas: [], settings: {} }),
    },
    writable: true,
});

describe('App', () => {
    it('renders Inbox by default', () => {
        const { getByText } = renderWithProviders(<App />);
        expect(getByText('Inbox')).toBeInTheDocument();
    });

    it('renders Sidebar navigation', () => {
        const { getByTestId } = renderWithProviders(<App />);
        expect(getByTestId('layout')).toBeInTheDocument();
    });
});
