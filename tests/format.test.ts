import { describe, expect, test } from 'bun:test';

import { displayPlan, formatLastRefresh, formatRemaining, formatResetCountdown } from '../src/lib/format.js';

describe('format', () => {
    test('omits missing percentages', () => {
        expect(formatRemaining(undefined)).toBeUndefined();
        expect(formatRemaining(76.4)).toBe('76%');
    });

    test('counts down locally from a reset timestamp', () => {
        const now = Date.parse('2026-10-10T00:00:00Z');
        const resetsAt = Date.parse('2026-10-10T02:30:00Z') / 1000;
        expect(formatResetCountdown(resetsAt, now)).toBe('2h 30m');
        expect(formatResetCountdown(undefined, now)).toBeUndefined();
    });

    test('formats the last refresh without treating it as quota', () => {
        const now = Date.parse('2026-10-10T00:10:00Z');
        const then = Date.parse('2026-10-10T00:00:00Z');
        expect(formatLastRefresh(then, now)).toBe('10 min ago');
    });

    test('does not invent a plan label for unknown or empty values', () => {
        expect(displayPlan(undefined)).toBeUndefined();
        expect(displayPlan('unknown')).toBeUndefined();
        expect(displayPlan('plus')).toBe('Plus');
        expect(displayPlan('pro_plus')).toBe('Pro Plus');
    });
});
