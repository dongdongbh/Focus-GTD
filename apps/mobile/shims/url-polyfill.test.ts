import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import shim from './url-polyfill';

describe('URL Polyfill Shim', () => {
    // Save original console.warn
    const originalWarn = console.warn;
    let warnMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        warnMock = vi.fn();
        console.warn = warnMock as any;
    });

    afterEach(() => {
        console.warn = originalWarn;
    });

    test('exports URL and URLSearchParams', () => {
        expect(shim.URL).toBeDefined();
        expect(shim.URLSearchParams).toBeDefined();
    });

    test('shimmed URL has createObjectURL that is safe (mocked environment)', async () => {
        // 1. Reset modules to ensure fresh execution of shim logic
        vi.resetModules();

        // 2. Mock global URL to simulate Hermes (no createObjectURL)
        const OriginalURL = globalThis.URL;

        // We need a class that extends or mimics URL but definitely has no createObjectURL static method
        // @ts-ignore - MockURL matching OriginalURL structure for tests
        class MockURL extends OriginalURL {
            // @ts-ignore - Intentionally removing static method to simulate Hermes
            static createObjectURL = undefined;
            // @ts-ignore - Intentionally removing static method to simulate Hermes
            static revokeObjectURL = undefined;
        }

        // Temporarily replace global URL
        globalThis.URL = MockURL as unknown as typeof URL;

        // 3. Re-import and call setupURLPolyfill
        const shim = await import('./url-polyfill');
        shim.setupURLPolyfill();

        // 4. Verify it was patched on globalThis
        expect(typeof globalThis.URL.createObjectURL).toBe('function');

        // 5. Test safety behavior (returns string, warns)
        const result = globalThis.URL.createObjectURL({} as any);
        expect(result).toBe('');

        expect(warnMock).toHaveBeenCalledWith(
            expect.stringContaining('not supported')
        );

        // Cleanup
        globalThis.URL = OriginalURL;
    });

    test('shimmed URL has revokeObjectURL', () => {
        expect(typeof shim.URL.revokeObjectURL).toBe('function');
        // Should not throw
        shim.URL.revokeObjectURL('some-url');
    });

    test('URLSearchParams basic functionality', () => {
        const params = new shim.URLSearchParams!('foo=1&bar=2');
        expect(params.get('foo')).toBe('1');
        expect(params.get('bar')).toBe('2');
        expect(params.has('foo')).toBe(true);
        expect(params.has('baz')).toBe(false);
    });
});
