import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListView } from './ListView';

vi.mock('@mindwtr/core', () => ({
  useTaskStore: () => ({
    tasks: [],
    projects: [],
    settings: {},
    updateSettings: vi.fn(),
    addTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    moveTask: vi.fn(),
    batchMoveTasks: vi.fn(),
    batchDeleteTasks: vi.fn(),
    batchUpdateTasks: vi.fn(),
  }),
  PRESET_CONTEXTS: [],
  PRESET_TAGS: [],
  sortTasksBy: (tasks: any[]) => tasks,
  parseQuickAdd: (text: string) => ({ title: text, props: {} }),
  matchesHierarchicalToken: () => false,
  safeParseDate: () => null,
  createAIProvider: () => ({
    predictMetadata: async () => ({}),
  }),
}));

vi.mock('../../contexts/language-context', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('../../contexts/keybinding-context', () => ({
  useKeybindings: () => ({ registerTaskListScope: () => () => {} }),
}));

vi.mock('../PromptModal', () => ({
  PromptModal: () => null,
}));

vi.mock('../TaskItem', () => ({
  TaskItem: () => <div data-testid="task-item" />,
}));

vi.mock('../../lib/ai-config', () => ({
  buildCopilotConfig: () => ({}),
  loadAIKey: () => '',
}));

describe('ListView', () => {
  it('renders the view title', () => {
    const html = renderToStaticMarkup(<ListView title="Inbox" statusFilter="inbox" />);
    expect(html).toContain('Inbox');
  });
});
