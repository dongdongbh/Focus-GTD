import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '@mindwtr/core';
import { createAIProvider, type AIProviderId } from '@mindwtr/core';
import { buildCopilotConfig, loadAIKey } from '../../../lib/ai-config';

type CopilotSuggestion = { context?: string; tags?: string[] };

type UseListCopilotArgs = {
    settings: AppData['settings'] | undefined;
    newTaskTitle: string;
    allContexts: string[];
    allTags: string[];
};

export function useListCopilot({ settings, newTaskTitle, allContexts, allTags }: UseListCopilotArgs) {
    const aiEnabled = settings?.ai?.enabled === true;
    const aiProvider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
    const [aiKey, setAiKey] = useState('');
    const [copilotSuggestion, setCopilotSuggestion] = useState<CopilotSuggestion | null>(null);
    const [copilotApplied, setCopilotApplied] = useState(false);
    const [copilotContext, setCopilotContext] = useState<string | null>(null);
    const [copilotTags, setCopilotTags] = useState<string[]>([]);
    const copilotAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        let active = true;
        loadAIKey(aiProvider)
            .then((key) => {
                if (active) setAiKey(key);
            })
            .catch(() => {
                if (active) setAiKey('');
            });
        return () => {
            active = false;
        };
    }, [aiProvider]);

    useEffect(() => {
        if (!aiEnabled || !aiKey) {
            setCopilotSuggestion(null);
            return;
        }
        const title = newTaskTitle.trim();
        if (title.length < 4) {
            setCopilotSuggestion(null);
            return;
        }
        let cancelled = false;
        const handle = setTimeout(async () => {
            try {
                const provider = createAIProvider(buildCopilotConfig(settings, aiKey));
                if (copilotAbortRef.current) copilotAbortRef.current.abort();
                const abortController = typeof AbortController === 'function' ? new AbortController() : null;
                copilotAbortRef.current = abortController;
                const suggestion = await provider.predictMetadata(
                    { title, contexts: allContexts, tags: allTags },
                    abortController ? { signal: abortController.signal } : undefined
                );
                if (cancelled) return;
                if (!suggestion.context && !suggestion.tags?.length) {
                    setCopilotSuggestion(null);
                } else {
                    setCopilotSuggestion({ context: suggestion.context, tags: suggestion.tags });
                }
            } catch {
                if (!cancelled) setCopilotSuggestion(null);
            }
        }, 800);
        return () => {
            cancelled = true;
            clearTimeout(handle);
            if (copilotAbortRef.current) {
                copilotAbortRef.current.abort();
                copilotAbortRef.current = null;
            }
        };
    }, [aiEnabled, aiKey, newTaskTitle, allContexts, allTags, settings]);

    const applyCopilotSuggestion = useCallback((suggestion: CopilotSuggestion | null) => {
        if (!suggestion) return;
        setCopilotApplied(true);
        setCopilotContext(suggestion.context ?? null);
        setCopilotTags(suggestion.tags ?? []);
    }, []);

    const resetCopilot = useCallback(() => {
        setCopilotSuggestion(null);
        setCopilotApplied(false);
        setCopilotContext(null);
        setCopilotTags([]);
    }, []);

    return {
        aiEnabled,
        copilotSuggestion,
        copilotApplied,
        copilotContext,
        copilotTags,
        applyCopilotSuggestion,
        resetCopilot,
    };
}
