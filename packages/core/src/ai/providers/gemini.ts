import type { AIProvider, AIProviderConfig, BreakdownInput, BreakdownResponse, ClarifyInput, ClarifyResponse, CopilotInput, CopilotResponse, ReviewAnalysisInput, ReviewAnalysisResponse, AIRequestOptions } from '../types';
import { buildBreakdownPrompt, buildClarifyPrompt, buildCopilotPrompt, buildReviewAnalysisPrompt } from '../prompts';
import { normalizeTags, normalizeTimeEstimate, parseJson } from '../utils';
import { isBreakdownResponse, isClarifyResponse, isCopilotResponse, isReviewAnalysisResponse } from '../validators';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type GeminiSchema = {
    type: 'object' | 'array';
    properties?: Record<string, unknown>;
    required?: string[];
    items?: Record<string, unknown>;
};

interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const resolveTimeoutMs = (value?: number) => (Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS);

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    let removeExternalListener: (() => void) | null = null;
    if (abortController && externalSignal) {
        const onAbort = () => abortController.abort();
        if (externalSignal.aborted) {
            abortController.abort();
        } else {
            externalSignal.addEventListener('abort', onAbort);
            removeExternalListener = () => externalSignal.removeEventListener('abort', onAbort);
        }
    }
    const timeoutId = abortController ? setTimeout(() => abortController.abort(), timeoutMs) : null;
    try {
        return await fetch(url, { ...init, signal: abortController?.signal ?? init.signal });
    } catch (error) {
        if (abortController?.signal.aborted) {
            if (externalSignal?.aborted) {
                throw new Error('Gemini request aborted');
            }
            throw new Error('Gemini request timed out');
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (removeExternalListener) removeExternalListener();
    }
}

const CLARIFY_SCHEMA: GeminiSchema = {
    type: 'object',
    required: ['question', 'options'],
    properties: {
        question: { type: 'string' },
        options: {
            type: 'array',
            items: {
                type: 'object',
                required: ['label', 'action'],
                properties: {
                    label: { type: 'string' },
                    action: { type: 'string' },
                },
            },
        },
        suggestedAction: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                timeEstimate: { type: 'string' },
                context: { type: 'string' },
                isProject: { type: 'boolean' },
            },
        },
    },
};

const BREAKDOWN_SCHEMA: GeminiSchema = {
    type: 'object',
    required: ['steps'],
    properties: {
        steps: {
            type: 'array',
            items: { type: 'string' },
        },
    },
};

const REVIEW_SCHEMA: GeminiSchema = {
    type: 'object',
    required: ['suggestions'],
    properties: {
        suggestions: {
            type: 'array',
            items: {
                type: 'object',
                required: ['id', 'action', 'reason'],
                properties: {
                    id: { type: 'string' },
                    action: { type: 'string' },
                    reason: { type: 'string' },
                },
            },
        },
    },
};

const COPILOT_SCHEMA: GeminiSchema = {
    type: 'object',
    properties: {
        context: { type: 'string' },
        timeEstimate: { type: 'string' },
        tags: {
            type: 'array',
            items: { type: 'string' },
        },
    },
};

async function requestGemini(config: AIProviderConfig, prompt: { system: string; user: string }, schema?: GeminiSchema, options?: AIRequestOptions) {
    const endpoint = config.endpoint || GEMINI_BASE_URL;
    if (!config.apiKey) {
        throw new Error('Gemini API key is required.');
    }
    const rawUrl = `${endpoint.replace(/\/+$/, '')}/${config.model}:generateContent`;
    let url = rawUrl;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.searchParams.has('key')) {
            parsed.searchParams.delete('key');
        }
        url = parsed.toString();
    } catch {
        // If URL parsing fails, fall back to the raw string.
    }
    const thinkingBudget = typeof config.thinkingBudget === 'number' && config.thinkingBudget > 0
        ? Math.floor(config.thinkingBudget)
        : undefined;
    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: `${prompt.system}\n\n${prompt.user}` },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.15,
            topP: 0.8,
            topK: 20,
            candidateCount: 1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
            ...(schema ? { responseSchema: schema } : {}),
            ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
        },
    };

    let response: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            response = await fetchWithTimeout(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': config.apiKey,
                    },
                    body: JSON.stringify(body),
                },
                resolveTimeoutMs(config.timeoutMs),
                options?.signal
            );
        } catch (error) {
            if (attempt < MAX_RETRIES) {
                await sleep(400 * Math.pow(2, attempt));
                continue;
            }
            throw error;
        }

        if (!response.ok) {
            if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
                await sleep(400 * Math.pow(2, attempt));
                continue;
            }
            const statusText = response.statusText || 'Request failed';
            throw new Error(`Gemini error: ${response.status} ${statusText}`);
        }
        break;
    }

    if (!response) {
        throw new Error('Gemini request failed to start.');
    }

    const result = await response.json() as GeminiResponse;

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('Gemini returned no content.');
    }
    return text;
}

export function createGeminiProvider(config: AIProviderConfig): AIProvider {
    return {
        clarifyTask: async (input: ClarifyInput, options?: AIRequestOptions): Promise<ClarifyResponse> => {
            const prompt = buildClarifyPrompt(input);
            const text = await requestGemini(config, prompt, CLARIFY_SCHEMA, options);
            try {
                return parseJson<ClarifyResponse>(text, isClarifyResponse);
            } catch (error) {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestGemini(config, retryPrompt, CLARIFY_SCHEMA, options);
                return parseJson<ClarifyResponse>(retryText, isClarifyResponse);
            }
        },
        breakDownTask: async (input: BreakdownInput, options?: AIRequestOptions): Promise<BreakdownResponse> => {
            const prompt = buildBreakdownPrompt(input);
            const text = await requestGemini(config, prompt, BREAKDOWN_SCHEMA, options);
            try {
                return parseJson<BreakdownResponse>(text, isBreakdownResponse);
            } catch (error) {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestGemini(config, retryPrompt, BREAKDOWN_SCHEMA, options);
                return parseJson<BreakdownResponse>(retryText, isBreakdownResponse);
            }
        },
        analyzeReview: async (input: ReviewAnalysisInput, options?: AIRequestOptions): Promise<ReviewAnalysisResponse> => {
            const prompt = buildReviewAnalysisPrompt(input.items);
            const text = await requestGemini(config, prompt, REVIEW_SCHEMA, options);
            try {
                return parseJson<ReviewAnalysisResponse>(text, isReviewAnalysisResponse);
            } catch (error) {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestGemini(config, retryPrompt, REVIEW_SCHEMA, options);
                return parseJson<ReviewAnalysisResponse>(retryText, isReviewAnalysisResponse);
            }
        },
        predictMetadata: async (input: CopilotInput, options?: AIRequestOptions): Promise<CopilotResponse> => {
            const prompt = buildCopilotPrompt(input);
            const text = await requestGemini(config, prompt, COPILOT_SCHEMA, options);
            try {
                const parsed = parseJson<CopilotResponse>(text, isCopilotResponse);
                const context = typeof parsed.context === 'string' ? parsed.context : undefined;
                const timeEstimate = typeof parsed.timeEstimate === 'string' ? parsed.timeEstimate : undefined;
                const tags = Array.isArray(parsed.tags) ? normalizeTags(parsed.tags) : [];
                return {
                    context,
                    timeEstimate: normalizeTimeEstimate(timeEstimate) as CopilotResponse['timeEstimate'],
                    tags,
                };
            } catch (error) {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestGemini(config, retryPrompt, COPILOT_SCHEMA, options);
                const parsed = parseJson<CopilotResponse>(retryText, isCopilotResponse);
                const context = typeof parsed.context === 'string' ? parsed.context : undefined;
                const timeEstimate = typeof parsed.timeEstimate === 'string' ? parsed.timeEstimate : undefined;
                const tags = Array.isArray(parsed.tags) ? normalizeTags(parsed.tags) : [];
                return {
                    context,
                    timeEstimate: normalizeTimeEstimate(timeEstimate) as CopilotResponse['timeEstimate'],
                    tags,
                };
            }
        },
    };
}
