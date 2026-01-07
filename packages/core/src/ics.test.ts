import { describe, it, expect } from 'vitest';
import { parseIcs } from './ics';

describe('ics', () => {
    it('parses a simple timed event', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:event-1',
            'SUMMARY:Team Meeting',
            'DTSTART:20250101T090000Z',
            'DTEND:20250101T100000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const events = parseIcs(ics, {
            sourceId: 'cal',
            rangeStart: new Date('2025-01-01T00:00:00Z'),
            rangeEnd: new Date('2025-01-02T00:00:00Z'),
        });

        expect(events).toHaveLength(1);
        expect(events[0].title).toBe('Team Meeting');
        expect(events[0].allDay).toBe(false);
        expect(events[0].start).toBe('2025-01-01T09:00:00.000Z');
        expect(events[0].end).toBe('2025-01-01T10:00:00.000Z');
        expect(events[0].id).toBe('cal:event-1:2025-01-01T09:00:00.000Z');
    });

    it('parses all-day date events', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:event-2',
            'SUMMARY:Holiday',
            'DTSTART;VALUE=DATE:20250102',
            'DTEND;VALUE=DATE:20250103',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const rangeStart = new Date(2025, 0, 2, 0, 0, 0, 0);
        const rangeEnd = new Date(2025, 0, 4, 0, 0, 0, 0);
        const events = parseIcs(ics, { sourceId: 'cal', rangeStart, rangeEnd });

        expect(events).toHaveLength(1);
        expect(events[0].title).toBe('Holiday');
        expect(events[0].allDay).toBe(true);
    });

    it('unfolds folded lines', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:event-3',
            'SUMMARY:LongTitle',
            'DESCRIPTION:Line1\\n',
            ' Line2',
            'DTSTART:20250101T090000Z',
            'DTEND:20250101T100000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const events = parseIcs(ics, {
            sourceId: 'cal',
            rangeStart: new Date('2025-01-01T00:00:00Z'),
            rangeEnd: new Date('2025-01-02T00:00:00Z'),
        });

        expect(events).toHaveLength(1);
        expect(events[0].description).toBe('Line1\nLine2');
    });

    it('expands weekly recurrence with BYDAY and COUNT', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:event-4',
            'SUMMARY:Standup',
            'DTSTART:20250107T090000Z',
            'DTEND:20250107T093000Z',
            'RRULE:FREQ=WEEKLY;BYDAY=MO,TU;COUNT=4',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const events = parseIcs(ics, {
            sourceId: 'cal',
            rangeStart: new Date('2025-01-01T00:00:00Z'),
            rangeEnd: new Date('2025-02-01T00:00:00Z'),
        });

        expect(events.map((e) => e.start)).toEqual([
            '2025-01-07T09:00:00.000Z',
            '2025-01-13T09:00:00.000Z',
            '2025-01-14T09:00:00.000Z',
            '2025-01-20T09:00:00.000Z',
        ]);
    });

    it('does not surface COUNT-limited recurrences long after they ended', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:event-5',
            'SUMMARY:Old Standup',
            'DTSTART:20121001T083000Z',
            'DTEND:20121001T090000Z',
            'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=66',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const events = parseIcs(ics, {
            sourceId: 'cal',
            rangeStart: new Date('2026-01-01T00:00:00Z'),
            rangeEnd: new Date('2026-02-01T00:00:00Z'),
        });

        expect(events).toHaveLength(0);
    });
});
