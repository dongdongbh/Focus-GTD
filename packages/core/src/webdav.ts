import {
    DEFAULT_TIMEOUT_MS,
    assertSecureUrl,
    concatChunks,
    createProgressStream,
    fetchWithTimeout,
    toArrayBuffer,
    toUint8Array,
} from './http-utils';

export interface WebDavOptions {
    username?: string;
    password?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    fetcher?: typeof fetch;
    onProgress?: (loaded: number, total: number) => void;
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

const WEBDAV_HTTPS_ERROR = 'WebDAV requires HTTPS for public URLs (HTTP allowed for localhost/private IPs).';
const WEBDAV_INSECURE_OPTIONS = { allowAndroidEmulatorInDev: true, allowPrivateIpRanges: true };
const WEBDAV_TIMEOUT_ERROR = 'WebDAV request timed out';

export async function webdavGetJson<T>(
    url: string,
    options: WebDavOptions = {}
): Promise<T | null> {
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        {
            method: 'GET',
            headers: buildHeaders(options),
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
        WEBDAV_TIMEOUT_ERROR,
    );

    if (res.status === 404) return null;
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const error = new Error(`WebDAV GET failed (${res.status}): ${text || res.statusText}`);
        (error as { status?: number }).status = res.status;
        throw error;
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
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
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
        WEBDAV_TIMEOUT_ERROR,
    );

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const error = new Error(`WebDAV PUT failed (${res.status}): ${text || res.statusText}`);
        (error as { status?: number }).status = res.status;
        throw error;
    }
}

export async function webdavMakeDirectory(
    url: string,
    options: WebDavOptions = {}
): Promise<void> {
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        { method: 'MKCOL', headers: buildHeaders(options) },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
        WEBDAV_TIMEOUT_ERROR,
    );
    if (!res.ok && res.status !== 405) {
        throw new Error(`WebDAV MKCOL failed (${res.status})`);
    }
}

export async function webdavPutFile(
    url: string,
    data: ArrayBuffer | Uint8Array | Blob,
    contentType: string,
    options: WebDavOptions = {}
): Promise<void> {
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
    const fetcher = options.fetcher ?? fetch;
    const headers = buildHeaders(options);
    headers['Content-Type'] = contentType || 'application/octet-stream';

    let body: BodyInit = data instanceof Uint8Array ? new Uint8Array(data) : data;
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
        { method: 'PUT', headers, body },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
        WEBDAV_TIMEOUT_ERROR,
    );

    if (!res.ok) {
        const error = new Error(`WebDAV File PUT failed (${res.status})`);
        (error as { status?: number }).status = res.status;
        throw error;
    }
}

export async function webdavFileExists(
    url: string,
    options: WebDavOptions = {}
): Promise<boolean> {
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        { method: 'HEAD', headers: buildHeaders(options) },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
        WEBDAV_TIMEOUT_ERROR,
    );

    if (res.status === 404) return false;
    if (res.status === 405) return true;
    if (!res.ok) {
        const error = new Error(`WebDAV HEAD failed (${res.status})`);
        (error as { status?: number }).status = res.status;
        throw error;
    }
    return true;
}

export async function webdavGetFile(
    url: string,
    options: WebDavOptions = {}
): Promise<ArrayBuffer> {
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        { method: 'GET', headers: buildHeaders(options) },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
        WEBDAV_TIMEOUT_ERROR,
    );

    if (!res.ok) {
        const error = new Error(`WebDAV File GET failed (${res.status})`);
        (error as { status?: number }).status = res.status;
        throw error;
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
    return toArrayBuffer(merged);
}

export async function webdavDeleteFile(
    url: string,
    options: WebDavOptions = {}
): Promise<void> {
    assertSecureUrl(url, WEBDAV_HTTPS_ERROR, WEBDAV_INSECURE_OPTIONS);
    const fetcher = options.fetcher ?? fetch;
    const res = await fetchWithTimeout(
        url,
        { method: 'DELETE', headers: buildHeaders(options) },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetcher,
        WEBDAV_TIMEOUT_ERROR,
    );

    if (!res.ok && res.status !== 404) {
        throw new Error(`WebDAV DELETE failed (${res.status})`);
    }
}
