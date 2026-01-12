export interface CloudOptions {
    token?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    fetcher?: typeof fetch;
    onProgress?: (loaded: number, total: number) => void;
}

function buildHeaders(options: CloudOptions): Record<string, string> {
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
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
        return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '10.0.2.2';
    } catch {
        return false;
    }
}

function assertSecureUrl(url: string) {
    if (!isAllowedInsecureUrl(url)) {
        throw new Error('Cloud sync requires HTTPS (except localhost).');
    }
}

const toUint8Array = async (data: ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> => {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(await data.arrayBuffer());
};

const concatChunks = (chunks: Uint8Array[], total: number): Uint8Array => {
    if (total <= 0) {
        total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return merged;
};

const createProgressStream = (bytes: Uint8Array, onProgress: (loaded: number, total: number) => void) => {
    if (typeof ReadableStream !== 'function') return null;
    const total = bytes.length;
    const chunkSize = 64 * 1024;
    let offset = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (offset >= total) {
                controller.close();
                return;
            }
            const nextChunk = bytes.slice(offset, Math.min(total, offset + chunkSize));
            offset += nextChunk.length;
            controller.enqueue(nextChunk);
            onProgress(offset, total);
        },
    });
};

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
            throw new Error('Cloud request timed out');
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export async function cloudGetJson<T>(
    url: string,
    options: CloudOptions = {},
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
        throw new Error(`Cloud GET failed (${res.status}): ${res.statusText}`);
    }

    const text = await res.text();
    try {
        return JSON.parse(text) as T;
    } catch (error) {
        throw new Error(`Cloud GET failed: invalid JSON (${(error as Error).message})`);
    }
}

export async function cloudPutJson(
    url: string,
    data: unknown,
    options: CloudOptions = {},
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
        throw new Error(`Cloud PUT failed (${res.status}): ${res.statusText}`);
    }
}

export async function cloudPutFile(
    url: string,
    data: ArrayBuffer | Uint8Array | Blob,
    contentType: string,
    options: CloudOptions = {},
): Promise<void> {
    assertSecureUrl(url);
    const fetcher = options.fetcher ?? fetch;
    const headers = buildHeaders(options);
    headers['Content-Type'] = contentType || 'application/octet-stream';

    let body: BodyInit = data;
    if (options.onProgress) {
        const bytes = await toUint8Array(data);
        const stream = createProgressStream(bytes, options.onProgress);
        body = stream ?? bytes;
        if (!headers['Content-Length']) {
            headers['Content-Length'] = String(bytes.length);
        }
    }

    const res = await fetchWithTimeout(
        url,
        {
            method: 'PUT',
            headers,
            body,
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
    );

    if (!res.ok) {
        throw new Error(`Cloud File PUT failed (${res.status}): ${res.statusText}`);
    }
}

export async function cloudGetFile(
    url: string,
    options: CloudOptions = {},
): Promise<ArrayBuffer> {
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

    if (!res.ok) {
        throw new Error(`Cloud File GET failed (${res.status}): ${res.statusText}`);
    }

    const onProgress = options.onProgress;
    if (!onProgress || !res.body || typeof res.body.getReader !== 'function') {
        return await res.arrayBuffer();
    }

    const reader = res.body.getReader();
    const total = Number(res.headers.get('content-length') || 0);
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            received += value.length;
            onProgress(received, total);
        }
    }
    const merged = concatChunks(chunks, total || received);
    return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
}

export async function cloudDeleteFile(
    url: string,
    options: CloudOptions = {},
): Promise<void> {
    assertSecureUrl(url);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        {
            method: 'DELETE',
            headers: buildHeaders(options),
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
    );

    if (!res.ok && res.status !== 404) {
        throw new Error(`Cloud DELETE failed (${res.status}): ${res.statusText}`);
    }
}
