import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemedText } from './themed-text';

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: any) => styles },
  Text: (props: any) => React.createElement('span', props, props.children),
}));

vi.mock('@/hooks/use-theme-color', () => ({
  useThemeColor: () => '#ff0000',
}));

describe('ThemedText', () => {
  it('renders with themed color and type styles', () => {
    const html = renderToStaticMarkup(<ThemedText type="title">Hello</ThemedText>);
    expect(html).toContain('Hello');
  });
});
