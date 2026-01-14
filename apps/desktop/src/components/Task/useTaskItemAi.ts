import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    type AppData,
    type AIProviderId,
    type ClarifyResponse,
    type TimeEstimate,
    PRESET_CONTEXTS,
    createAIProvider,
} from '@mindwtr/core';
import { isTauriRuntime } from '../../lib/runtime';
import { buildAIConfig, buildCopilotConfig, loadAIKey } from '../../lib/ai-config';

type TaskItemAiContext = {
    projectTitle: string;
    projectTasks: string[];
} | null;

type UseTaskItemAiArgs = {
    taskId: string;
    settings: AppData['settings'] | undefined;
    t: (key: string) => string;
    editTitle: string;
    editDescription: string;
    editContexts: string;
    editTags: string;
    tagOptions: string[];
    projectContext: TaskItemAiContext;
    timeEstimatesEnabled: boolean;
    setEditTitle: (value: string) => void;
    setEditContexts: (value: string) => void;
    setEditTags: (value: string) => void;
    setEditTimeEstimate: (value: TimeEstimate | '') => void;
};

export function useTaskItemAi({
    taskId,
    settings,
    t,
    editTitle,
    editDescription,
    editContexts,
    editTags,
    tagOptions,
    projectContext,
    timeEstimatesEnabled,
    setEditTitle,
    setEditContexts,
    setEditTags,
    setEditTimeEstimate,
}: UseTaskItemAiArgs) {
    const aiEnabled = settings?.ai?.enabled === true;
    const aiProvider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
    const copilotModel = settings?.ai?.copilotModel;
    const copilotSettings = useMemo(() => ({
        ai: { provider: aiProvider, copilotModel },
    }), [aiProvider, copilotModel]);

    const [aiKey, setAiKey] = useState('');
    const [aiClarifyResponse, setAiClarifyResponse] = useState<ClarifyResponse | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiBreakdownSteps, setAiBreakdownSteps] = useState<string[] | null>(null);
    const [copilotSuggestion, setCopilotSuggestion] = useState<{ context?: string; timeEstimate?: TimeEstimate; tags?: string[] } | null>(null);
    const [copilotApplied, setCopilotApplied] = useState(false);
    const [copilotContext, setCopilotContext] = useState<string | undefined>(undefined);
    const [copilotEstimate, setCopilotEstimate] = useState<TimeEstimate | undefined>(undefined);
    const [isAIWorking, setIsAIWorking] = useState(false);
    const copilotInputRef = useRef<string>('');
    const copilotAbortRef = useRef<AbortController | null>(null);
    const copilotMountedRef = useRef(true);

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
        const title = editTitle.trim();
        const description = editDescription.trim();
        const input = [title, description].filter(Boolean).join('\n');
        if (input.length < 4) {
            setCopilotSuggestion(null);
            return;
        }
        const signature = JSON.stringify({
            input,
            contexts: editContexts,
            provider: aiProvider,
            model: copilotModel ?? '',
            tags: tagOptions,
            timeEstimatesEnabled,
        });
        if (signature === copilotInputRef.current) {
            return;
        }
        copilotInputRef.current = signature;
        let cancelled = false;
        let localAbort: AbortController | null = null;
        const handle = setTimeout(async () => {
            try {
                const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
                const provider = createAIProvider(buildCopilotConfig(copilotSettings as AppData['settings'], aiKey));
                const abortController = typeof AbortController === 'function' ? new AbortController() : null;
                localAbort = abortController;
                const previousController = copilotAbortRef.current;
                if (abortController) {
                    copilotAbortRef.current = abortController;
                }
                if (previousController) {
                    previousController.abort();
                }
                const suggestion = await provider.predictMetadata(
                    {
                        title: input,
                        contexts: Array.from(new Set([...PRESET_CONTEXTS, ...currentContexts])),
                        tags: tagOptions,
                    },
                    abortController ? { signal: abortController.signal } : undefined
                );
                if (cancelled || !copilotMountedRef.current) return;
                if (!suggestion.context && (!timeEstimatesEnabled || !suggestion.timeEstimate) && !suggestion.tags?.length) {
                    setCopilotSuggestion(null);
                } else {
                    setCopilotSuggestion(suggestion);
                }
            } catch {
                if (!cancelled && copilotMountedRef.current) {
                    setCopilotSuggestion(null);
                }
            }
        }, 800);
        return () => {
            cancelled = true;
            clearTimeout(handle);
            if (copilotAbortRef.current && copilotAbortRef.current === localAbort) {
                copilotAbortRef.current.abort();
                copilotAbortRef.current = null;
            }
        };
    }, [aiEnabled, aiKey, editTitle, editDescription, editContexts, aiProvider, copilotModel, copilotSettings, timeEstimatesEnabled, tagOptions]);

    useEffect(() => {
        copilotMountedRef.current = true;
        return () => {
            copilotMountedRef.current = false;
            if (copilotAbortRef.current) {
                copilotAbortRef.current.abort();
                copilotAbortRef.current = null;
            }
        };
    }, []);

    const logAIDebug = useCallback(async (context: string, message: string) => {
        if (!isTauriRuntime()) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('log_ai_debug', {
                context,
                message,
                provider: aiProvider,
                model: settings?.ai?.model ?? '',
                taskId,
            });
        } catch (error) {
            console.warn('AI debug log failed', error);
        }
    }, [aiProvider, settings?.ai?.model, taskId]);

    const getAIProvider = useCallback(() => {
        if (!aiEnabled) {
            setAiError(t('ai.disabledBody'));
            return null;
        }
        if (!aiKey) {
            setAiError(t('ai.missingKeyBody'));
            return null;
        }
        return createAIProvider(buildAIConfig(settings, aiKey));
    }, [aiEnabled, aiKey, settings, t]);

    const resetCopilotDraft = useCallback(() => {
        setCopilotApplied(false);
        setCopilotContext(undefined);
        setCopilotEstimate(undefined);
    }, []);

    const resetAiState = useCallback(() => {
        setAiClarifyResponse(null);
        setAiError(null);
        setAiBreakdownSteps(null);
        setCopilotSuggestion(null);
        setCopilotApplied(false);
        setCopilotContext(undefined);
        setCopilotEstimate(undefined);
    }, []);

    const clearAiBreakdown = useCallback(() => {
        setAiBreakdownSteps(null);
    }, []);

    const clearAiClarify = useCallback(() => {
        setAiClarifyResponse(null);
    }, []);

    const applyCopilotSuggestion = useCallback(() => {
        if (!copilotSuggestion) return;
        if (copilotSuggestion.context) {
            const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
            const nextContexts = Array.from(new Set([...currentContexts, copilotSuggestion.context]));
            setEditContexts(nextContexts.join(', '));
            setCopilotContext(copilotSuggestion.context);
        }
        if (copilotSuggestion.tags?.length) {
            const currentTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
            const nextTags = Array.from(new Set([...currentTags, ...copilotSuggestion.tags]));
            setEditTags(nextTags.join(', '));
        }
        if (copilotSuggestion.timeEstimate && timeEstimatesEnabled) {
            setEditTimeEstimate(copilotSuggestion.timeEstimate);
            setCopilotEstimate(copilotSuggestion.timeEstimate);
        }
        setCopilotApplied(true);
    }, [copilotSuggestion, editContexts, editTags, setEditContexts, setEditTags, setEditTimeEstimate, timeEstimatesEnabled]);

    const applyAISuggestion = useCallback((suggested: { title?: string; context?: string; timeEstimate?: TimeEstimate }) => {
        if (suggested.title) setEditTitle(suggested.title);
        if (suggested.timeEstimate && timeEstimatesEnabled) setEditTimeEstimate(suggested.timeEstimate);
        if (suggested.context) {
            const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
            const nextContexts = Array.from(new Set([...currentContexts, suggested.context]));
            setEditContexts(nextContexts.join(', '));
        }
        setAiClarifyResponse(null);
    }, [editContexts, setEditContexts, setEditTimeEstimate, setEditTitle, timeEstimatesEnabled]);

    const handleAIClarify = useCallback(async () => {
        if (isAIWorking) return;
        const title = editTitle.trim();
        if (!title) return;
        const provider = getAIProvider();
        if (!provider) return;
        setIsAIWorking(true);
        setAiError(null);
        setAiBreakdownSteps(null);
        try {
            const currentContexts = editContexts.split(',').map((c) => c.trim()).filter(Boolean);
            const response = await provider.clarifyTask({
                title,
                contexts: Array.from(new Set([...PRESET_CONTEXTS, ...currentContexts])),
                ...(projectContext ?? {}),
            });
            setAiClarifyResponse(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setAiError(message);
            await logAIDebug('clarify', message);
            console.warn(error);
        } finally {
            setIsAIWorking(false);
        }
    }, [editContexts, editTitle, getAIProvider, isAIWorking, logAIDebug, projectContext]);

    const handleAIBreakdown = useCallback(async () => {
        if (isAIWorking) return;
        const title = editTitle.trim();
        if (!title) return;
        const provider = getAIProvider();
        if (!provider) return;
        setIsAIWorking(true);
        setAiError(null);
        setAiBreakdownSteps(null);
        try {
            const response = await provider.breakDownTask({
                title,
                description: editDescription,
                ...(projectContext ?? {}),
            });
            const steps = response.steps.map((step) => step.trim()).filter(Boolean).slice(0, 8);
            if (steps.length === 0) return;
            setAiBreakdownSteps(steps);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setAiError(message);
            await logAIDebug('breakdown', message);
            console.warn(error);
        } finally {
            setIsAIWorking(false);
        }
    }, [editDescription, editTitle, getAIProvider, isAIWorking, logAIDebug, projectContext]);

    return {
        aiEnabled,
        isAIWorking,
        aiClarifyResponse,
        aiError,
        aiBreakdownSteps,
        copilotSuggestion,
        copilotApplied,
        copilotContext,
        copilotEstimate,
        resetCopilotDraft,
        resetAiState,
        clearAiBreakdown,
        clearAiClarify,
        applyCopilotSuggestion,
        applyAISuggestion,
        handleAIClarify,
        handleAIBreakdown,
    };
}
