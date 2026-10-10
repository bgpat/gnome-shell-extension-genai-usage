import { describe, expect, test } from 'bun:test';

import { remainingFromUsed, selectQuota, windowLabel } from '../src/lib/quota.js';
import type { QuotaWindow } from '../src/lib/model.js';

const windows: QuotaWindow[] = [
    { id: 'primary', label: 'Five-hour', remainingPercent: 80, usedPercent: 20, windowDurationMins: 300 },
    { id: 'secondary', label: 'Weekly', remainingPercent: 40, usedPercent: 60, windowDurationMins: 10080 },
];

describe('quota selection', () => {
    test('does not turn a missing percentage into zero', () => {
        expect(remainingFromUsed(undefined)).toBeUndefined();
        expect(selectQuota([{ id: 'primary', label: 'Quota' }], 'lowest')).toBeUndefined();
    });

    test('keeps a real zero', () => {
        expect(remainingFromUsed(100)).toBe(0);
    });

    test('selects five-hour, weekly, and the lowest remaining window', () => {
        expect(selectQuota(windows, 'five-hour')?.id).toBe('primary');
        expect(selectQuota(windows, 'weekly')?.id).toBe('secondary');
        expect(selectQuota(windows, 'lowest')?.remainingPercent).toBe(40);
    });

    test('does not substitute another window when the requested one is absent', () => {
        expect(selectQuota([windows[1]!], 'five-hour')).toBeUndefined();
    });

    test('labels known Codex windows and leaves other durations generic', () => {
        expect(windowLabel(300)).toBe('Five-hour');
        expect(windowLabel(10080)).toBe('Weekly');
        expect(windowLabel(15)).toBe('15 min');
        expect(windowLabel(null)).toBe('Quota');
    });
});
