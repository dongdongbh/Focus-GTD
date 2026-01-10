export interface WebDavOptions {
    username?: string;
    password?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    fetcher?: typeof fetch;
}

function bytesToBase64(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i] ?? 0;
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];

        const hasB1 = typeof b1 === 'number';
        const hasB2 = typeof b2 === 'number';

        const triplet = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);

        out += alphabet[(triplet >> 18) & 0x3f];
        out += alphabet[(triplet >> 12) & 0x3f];
        out += hasB1 ? alphabet[(triplet >> 6) & 0x3f] : '=';
        out += hasB2 ? alphabet[triplet & 0x3f] : '=';
    }
    return out;
}

function encodeBase64Utf8(value: string): string {
    const Encoder = typeof TextEncoder === 'function' ? TextEncoder : undefined;
    if (Encoder) {
        return bytesToBase64(new Encoder().encode(value));
    }

    try {
        const encoded = encodeURIComponent(value);
        const bytes: number[] = [];
        for (let i = 0; i < encoded.length; i++) {
            const ch = encoded[i];
            if (ch === '%') {
                const hex = encoded.slice(i + 1, i + 3);
                bytes.push(Number.parseInt(hex, 16));
                i += 2;
            } else {
                bytes.push(ch.charCodeAt(0));
            }
        }
        return bytesToBase64(new Uint8Array(bytes));
    } catch {
        const bytes = new Uint8Array(value.split('').map((c) => c.charCodeAt(0) & 0xff));
        return bytesToBase64(bytes);
    }
}

function buildHeaders(options: WebDavOptions): Record<string, string> {
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.username && typeof options.password === 'string') {
        headers.Authorization = `Basic ${encodeBase64Utf8(`${options.username}:${options.password}`)}`;
    }
    return headers;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function isAbortError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('name' in error)) return false;
    const name = (error as { name?: unknown }).name;
    return name === 'AbortError';
}

function isAllowedInsecureUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'https:') return true;
        if (parsed.protocol !== 'http:') return false;
        const host = parsed.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
        if (host === '10.0.2.2') {
            const isDev = typeof globalThis !== 'undefined' && (globalThis as { __DEV__?: boolean }).__DEV__ === true;
            return isDev;
        }
        return false;
    } catch {
        return false;
    }
}

function assertSecureUrl(url: string) {
    if (!isAllowedInsecureUrl(url)) {
        throw new Error('WebDAV requires HTTPS for non-local URLs (HTTP allowed only for localhost).');
    }
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    fetcher: typeof fetch,
): Promise<Response> {
    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = abortController ? setTimeout(() => abortController.abort(), timeoutMs) : null;

    const signal = abortController ? abortController.signal : init.signal;
    const externalSignal = init.signal;
    if (abortController && externalSignal) {
        if (externalSignal.aborted) {
            abortController.abort();
        } else {
            externalSignal.addEventListener('abort', () => abortController.abort(), { once: true });
        }
    }

    try {
        return await fetcher(url, { ...init, signal });
    } catch (error) {
        if (isAbortError(error)) {
            throw new Error('WebDAV request timed out');
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export async function webdavGetJson<T>(
    url: string,
    options: WebDavOptions = {}
): Promise<T | null> {
    assertSecureUrl(url);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        {
            method: 'GET',
            headers: buildHeaders(options),
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
    );

    if (res.status === 404) return null;
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`WebDAV GET failed (${res.status}): ${text || res.statusText}`);
    }

    const text = await res.text();
    try {
        return JSON.parse(text) as T;
    } catch (error) {
        throw new Error(`WebDAV GET failed: invalid JSON (${(error as Error).message})`);
    }
}

export async function webdavPutJson(
    url: string,
    data: unknown,
    options: WebDavOptions = {}
): Promise<void> {
    assertSecureUrl(url);
    const fetcher = options.fetcher ?? fetch;
    const headers = buildHeaders(options);
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';

    const res = await fetchWithTimeout(
        url,
        {
            method: 'PUT',
            headers,
            body: JSON.stringify(data, null, 2),
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`WebDAV PUT failed (${res.status}): ${text || res.statusText}`);
    }
}
