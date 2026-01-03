import { describe, it, expect } from 'vitest';
import { safeParseDate, safeFormatDate, isDueForReview } from './date';

describe('date utils', () => {
    it('parses date-only strings as local dates', () => {
        const parsed = safeParseDate('2025-01-02');
        expect(parsed).not.toBeNull();
        expect(parsed?.getFullYear()).toBe(2025);
        expect(parsed?.getMonth()).toBe(0);
        expect(parsed?.getDate()).toBe(2);
    });

    it('parses timezone-aware ISO strings', () => {
        const parsed = safeParseDate('2025-01-02T10:30:00.000Z');
        expect(parsed?.toISOString()).toBe('2025-01-02T10:30:00.000Z');
    });

    it('returns null for invalid dates', () => {
        expect(safeParseDate('not-a-date')).toBeNull();
    });

    it('formats valid dates and uses fallback for invalid', () => {
        const formatted = safeFormatDate('2025-01-02T10:30:00.000Z', 'yyyy-MM-dd');
        expect(formatted).toBe('2025-01-02');
        const fallback = safeFormatDate('bad-date', 'yyyy-MM-dd', 'n/a');
        expect(fallback).toBe('n/a');
    });

    it('checks due-for-review correctly', () => {
        const now = new Date('2025-01-05T12:00:00.000Z');
        expect(isDueForReview('2025-01-05T10:00:00.000Z', now)).toBe(true);
        expect(isDueForReview('2025-01-05T18:00:00.000Z', now)).toBe(false);
    });
});
