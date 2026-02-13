import { describe, expect, it } from 'vitest';
import { isAllowedInsecureUrl } from './http-utils';

describe('isAllowedInsecureUrl', () => {
    it('allows HTTPS URLs', () => {
        expect(isAllowedInsecureUrl('https://example.com/data.json')).toBe(true);
    });

    it('allows loopback hosts for HTTP', () => {
        expect(isAllowedInsecureUrl('http://localhost/data.json')).toBe(true);
        expect(isAllowedInsecureUrl('http://127.0.0.1/data.json')).toBe(true);
        expect(isAllowedInsecureUrl('http://127.255.255.254/data.json')).toBe(true);
        expect(isAllowedInsecureUrl('http://[::1]/data.json')).toBe(true);
    });

    it('blocks private ranges unless explicitly enabled', () => {
        expect(isAllowedInsecureUrl('http://10.1.2.3/data.json')).toBe(false);
        expect(isAllowedInsecureUrl('http://172.16.5.9/data.json')).toBe(false);
        expect(isAllowedInsecureUrl('http://192.168.1.50/data.json')).toBe(false);
        expect(isAllowedInsecureUrl('http://100.64.10.2/data.json')).toBe(false);
    });

    it('allows RFC1918 and CGNAT ranges when enabled', () => {
        const options = { allowPrivateIpRanges: true };
        expect(isAllowedInsecureUrl('http://10.1.2.3/data.json', options)).toBe(true);
        expect(isAllowedInsecureUrl('http://172.16.0.1/data.json', options)).toBe(true);
        expect(isAllowedInsecureUrl('http://172.31.255.255/data.json', options)).toBe(true);
        expect(isAllowedInsecureUrl('http://192.168.1.50/data.json', options)).toBe(true);
        expect(isAllowedInsecureUrl('http://100.64.0.1/data.json', options)).toBe(true);
        expect(isAllowedInsecureUrl('http://100.127.255.255/data.json', options)).toBe(true);
    });

    it('keeps private range boundaries strict', () => {
        const options = { allowPrivateIpRanges: true };
        expect(isAllowedInsecureUrl('http://172.15.255.255/data.json', options)).toBe(false);
        expect(isAllowedInsecureUrl('http://172.32.0.1/data.json', options)).toBe(false);
        expect(isAllowedInsecureUrl('http://100.63.255.255/data.json', options)).toBe(false);
        expect(isAllowedInsecureUrl('http://100.128.0.1/data.json', options)).toBe(false);
    });

    it('preserves Android emulator override behavior', () => {
        expect(isAllowedInsecureUrl('http://10.0.2.2/data.json')).toBe(false);
        expect(isAllowedInsecureUrl('http://10.0.2.2/data.json', { allowAndroidEmulator: true })).toBe(true);
    });
});
