import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React, { useCallback, useEffect, useState } from 'react';
import { LanguageProvider } from './language-context';
import { KeybindingProvider } from './keybinding-context';
import { useKeybindings } from './keybinding-context';

const DummyList = () => {
    const { registerTaskListScope } = useKeybindings();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const ids = ['1', '2'];

    const selectNext = useCallback(() => {
        setSelectedIndex((i) => Math.min(i + 1, ids.length - 1));
    }, [ids.length]);

    const selectPrev = useCallback(() => {
        setSelectedIndex((i) => Math.max(i - 1, 0));
    }, []);

    const selectFirst = useCallback(() => setSelectedIndex(0), []);
    const selectLast = useCallback(() => setSelectedIndex(ids.length - 1), [ids.length]);

    useEffect(() => {
        registerTaskListScope({
            kind: 'taskList',
            selectNext,
            selectPrev,
            selectFirst,
            selectLast,
            editSelected: vi.fn(),
            toggleDoneSelected: vi.fn(),
            deleteSelected: vi.fn(),
        });
        return () => registerTaskListScope(null);
    }, [registerTaskListScope, selectNext, selectPrev, selectFirst, selectLast]);

    return (
        <div>
            {ids.map((id, index) => (
                <div key={id} data-task-id={id} className={index === selectedIndex ? 'ring-2' : ''}>
                    Task {id}
                </div>
            ))}
        </div>
    );
};

describe('KeybindingProvider (vim)', () => {
    it('moves selection with j/k', () => {
        render(
            <LanguageProvider>
                <KeybindingProvider currentView="inbox" onNavigate={vi.fn()}>
                    <DummyList />
                </KeybindingProvider>
            </LanguageProvider>
        );

        const first = document.querySelector('[data-task-id="1"]');
        const second = document.querySelector('[data-task-id="2"]');

        expect(first?.className).toMatch(/ring-2/);
        expect(second?.className).not.toMatch(/ring-2/);

        fireEvent.keyDown(window, { key: 'j' });

        expect(second?.className).toMatch(/ring-2/);
    });
});
