type InsecureUrlOptions = {
    allowAndroidEmulator?: boolean;
    allowAndroidEmulatorInDev?: boolean;
    allowPrivateIpRanges?: boolean;
};

export const DEFAULT_TIMEOUT_MS = 30_000;

type Ipv4Octets = [number, number, number, number];

export const isAbortError = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null || !('name' in error)) return false;
    const name = (error as { name?: unknown }).name;
    return name === 'AbortError';
};

const parseIpv4Host = (host: string): Ipv4Octets | null => {
    const parts = host.split('.');
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const part of parts) {
        if (!/^\d+$/.test(part)) return null;
        const value = Number(part);
        if (!Number.isInteger(value) || value < 0 || value > 255) return null;
        octets.push(value);
    }
    return [octets[0], octets[1], octets[2], octets[3]];
};

export const isAllowedInsecureUrl = (rawUrl: string, options: InsecureUrlOptions = {}): boolean => {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'https:') return true;
        if (parsed.protocol !== 'http:') return false;
        const rawHost = parsed.hostname.toLowerCase();
        const host =
            rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
        if (host === 'localhost' || host === '::1') return true;
        const ipv4 = parseIpv4Host(host);
        if (ipv4 && ipv4[0] === 127) return true;
        if (options.allowPrivateIpRanges && ipv4) {
            const [first, second] = ipv4;
            if (first === 10) return true;
            if (first === 172 && second >= 16 && second <= 31) return true;
            if (first === 192 && second === 168) return true;
            if (first === 100 && second >= 64 && second <= 127) return true;
        }
        if (host === '10.0.2.2') {
            if (options.allowAndroidEmulator) return true;
            if (options.allowAndroidEmulatorInDev) {
                const isDev =
                    typeof globalThis !== 'undefined' && (globalThis as { __DEV__?: boolean }).__DEV__ === true;
                return isDev;
            }
        }
        return false;
    } catch {
        return false;
    }
};

export const assertSecureUrl = (url: string, message: string, options?: InsecureUrlOptions) => {
    if (!isAllowedInsecureUrl(url, options)) {
        throw new Error(message);
    }
};

export const toUint8Array = async (
    data: ArrayBuffer | Uint8Array | Blob
): Promise<Uint8Array<ArrayBuffer>> => {
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(await data.arrayBuffer());
};

export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    if (bytes.buffer instanceof ArrayBuffer) {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    return new Uint8Array(bytes).buffer;
};

export const concatChunks = (chunks: Uint8Array[], total: number): Uint8Array => {
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

export const createProgressStream = (bytes: Uint8Array, onProgress: (loaded: number, total: number) => void) => {
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

export const fetchWithTimeout = async (
    url: string,
    init: RequestInit,
    timeoutMs: number,
    fetcher: typeof fetch,
    timeoutMessage: string,
): Promise<Response> => {
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
            throw new Error(timeoutMessage);
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};
