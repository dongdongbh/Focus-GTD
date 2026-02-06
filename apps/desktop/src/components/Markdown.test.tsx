import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
    it('renders list blocks after plain text without requiring a blank line', () => {
        const { container, getByText } = render(
            <Markdown markdown={'Intro line\n- item one\n- item two'} />
        );
        expect(getByText('item one')).toBeInTheDocument();
        expect(container.querySelectorAll('ul').length).toBe(1);
    });

    it('renders task list checkboxes when immediately following text', () => {
        const { getAllByRole } = render(
            <Markdown markdown={'Notes\n- [x] done\n- [ ] todo'} />
        );
        const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
        expect(checkboxes).toHaveLength(2);
        expect(checkboxes[0]?.checked).toBe(true);
        expect(checkboxes[1]?.checked).toBe(false);
    });

    it('renders horizontal separator from markdown hr syntax', () => {
        const { container } = render(
            <Markdown markdown={'Top\n---\nBottom'} />
        );
        expect(container.querySelector('hr')).not.toBeNull();
    });
});
