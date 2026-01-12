const toHex = (bytes: Uint8Array): string => {
    let out = '';
    for (const byte of bytes) {
        out += byte.toString(16).padStart(2, '0');
    }
    return out;
};

export async function computeSha256Hex(data: ArrayBuffer | Uint8Array): Promise<string | null> {
    const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
    const subtle = typeof crypto === 'object' && crypto?.subtle ? crypto.subtle : null;
    if (!subtle) return null;
    const hash = await subtle.digest('SHA-256', bytes.buffer);
    return toHex(new Uint8Array(hash));
}
