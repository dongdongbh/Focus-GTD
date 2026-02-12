import { describe, expect, it } from 'vitest';
import {
    buildCaptureExtra,
    getCaptureFileExtension,
    getCaptureMimeType,
} from './quick-capture-sheet.utils';

describe('quick-capture utils', () => {
    it('extracts file extension with fallback', () => {
        expect(getCaptureFileExtension('/tmp/clip.wav')).toBe('.wav');
        expect(getCaptureFileExtension('/tmp/clip')).toBe('.m4a');
    });

    it('maps mime types for supported extensions', () => {
        expect(getCaptureMimeType('.wav')).toBe('audio/wav');
        expect(getCaptureMimeType('.mp3')).toBe('audio/mpeg');
        expect(getCaptureMimeType('.unknown')).toBe('audio/mp4');
    });

    it('builds structured capture error metadata', () => {
        const error = new Error('boom');
        const extra = buildCaptureExtra('Failed capture', error);
        expect(extra).toMatchObject({
            message: 'Failed capture',
            error: 'boom',
        });
        expect(buildCaptureExtra()).toBeUndefined();
    });
});
