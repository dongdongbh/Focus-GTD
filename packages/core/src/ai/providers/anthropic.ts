import type {
    AIProvider,
    AIProviderConfig,
    BreakdownInput,
    BreakdownResponse,
    ClarifyInput,
    ClarifyResponse,
    CopilotInput,
    CopilotResponse,
    ReviewAnalysisInput,
    ReviewAnalysisResponse,
    AIRequestOptions,
} from '../types';
import { buildBreakdownPrompt, buildClarifyPrompt, buildCopilotPrompt, buildReviewAnalysisPrompt } from '../prompts';
import { normalizeTags, normalizeTimeEstimate, parseJson } from '../utils';
import { isBreakdownResponse, isClarifyResponse, isCopilotResponse, isReviewAnalysisResponse } from '../validators';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_TOKENS = 1024;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const resolveTimeoutMs = (value?: number) => (Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS);

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal
): Promise<Response> {
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
                throw new Error('Anthropic request aborted');
            }
            throw new Error('Anthropic request timed out');
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (removeExternalListener) removeExternalListener();
    }
}

async function requestAnthropic(
    config: AIProviderConfig,
    prompt: { system: string; user: string },
    options?: AIRequestOptions
) {
    if (!config.apiKey) {
        throw new Error('Anthropic API key is required.');
    }
    const url = config.endpoint || ANTHROPIC_BASE_URL;
    const thinkingBudget = typeof config.thinkingBudget === 'number' ? config.thinkingBudget : 0;
    const maxTokens =
        thinkingBudget > 0 ? Math.max(DEFAULT_MAX_TOKENS, thinkingBudget + 256) : DEFAULT_MAX_TOKENS;

    const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: maxTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        temperature: 0.2,
    };

    if (thinkingBudget > 0) {
        body.thinking = {
            type: 'enabled',
            budget_tokens: thinkingBudget,
        };
    }

    let response: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            response = await fetchWithTimeout(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': config.apiKey,
                        'anthropic-version': '2023-06-01',
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
            throw new Error(`Anthropic error: ${response.status} ${statusText}`);
        }
        break;
    }

    if (!response) {
        throw new Error('Anthropic request failed to start.');
    }

    const result = await response.json() as {
        content?: Array<{ type?: string; text?: string }>;
    };

    const textBlocks = (result.content || []).filter(
        (block) => block.type === 'text' && typeof block.text === 'string'
    ) as Array<{ text: string }>;

    const text = textBlocks.map((block) => block.text).join('\n').trim();
    if (!text) {
        throw new Error('Anthropic returned no content.');
    }
    return text;
}

export function createAnthropicProvider(config: AIProviderConfig): AIProvider {
    return {
        clarifyTask: async (input: ClarifyInput, options?: AIRequestOptions): Promise<ClarifyResponse> => {
            const prompt = buildClarifyPrompt(input);
            const text = await requestAnthropic(config, prompt, options);
            try {
                return parseJson<ClarifyResponse>(text, isClarifyResponse);
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestAnthropic(config, retryPrompt, options);
                return parseJson<ClarifyResponse>(retryText, isClarifyResponse);
            }
        },
        breakDownTask: async (input: BreakdownInput, options?: AIRequestOptions): Promise<BreakdownResponse> => {
            const prompt = buildBreakdownPrompt(input);
            const text = await requestAnthropic(config, prompt, options);
            try {
                return parseJson<BreakdownResponse>(text, isBreakdownResponse);
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestAnthropic(config, retryPrompt, options);
                return parseJson<BreakdownResponse>(retryText, isBreakdownResponse);
            }
        },
        analyzeReview: async (input: ReviewAnalysisInput, options?: AIRequestOptions): Promise<ReviewAnalysisResponse> => {
            const prompt = buildReviewAnalysisPrompt(input.items);
            const text = await requestAnthropic(config, prompt, options);
            try {
                return parseJson<ReviewAnalysisResponse>(text, isReviewAnalysisResponse);
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestAnthropic(config, retryPrompt, options);
                return parseJson<ReviewAnalysisResponse>(retryText, isReviewAnalysisResponse);
            }
        },
        predictMetadata: async (input: CopilotInput, options?: AIRequestOptions): Promise<CopilotResponse> => {
            const prompt = buildCopilotPrompt(input);
            const text = await requestAnthropic(config, prompt, options);
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
            } catch {
                const retryPrompt = {
                    system: prompt.system,
                    user: `${prompt.user}\n\nReturn ONLY valid JSON. Do not include any extra text.`,
                };
                const retryText = await requestAnthropic(config, retryPrompt, options);
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
