import { describe, expect, test } from 'bun:test';

import type { UsageSnapshot } from '../src/lib/model.js';
import { barEntries, barItemLabel, quotaMenuLineText } from '../src/lib/presentation.js';

function snapshot(remaining?: number): UsageSnapshot {
    return {
        providerId: 'chatgpt',
        displayName: 'ChatGPT',
        source: 'official',
        availability: { state: 'available' },
        quotas: remaining === undefined ? [] : [{
            id: 'primary',
            label: 'Five-hour',
            remainingPercent: remaining,
            windowDurationMins: 300,
        }],
    };
}

describe('top bar presentation', () => {
    test('shows the selected remaining percentage and never a timestamp', () => {
        const entries = barEntries(['chatgpt'], new Map([['chatgpt', snapshot(76)]]), () => 'five-hour', 'placeholder');
        expect(entries).toEqual([{
            providerId: 'chatgpt',
            displayName: 'ChatGPT',
            text: '76%',
            accessible: 'ChatGPT 76%',
        }]);
    });

    test('can show used quota instead of remaining', () => {
        const entries = barEntries(
            ['chatgpt'],
            new Map([['chatgpt', snapshot(76)]]),
            () => 'five-hour',
            'placeholder',
            'used',
        );
        expect(entries[0]?.text).toBe('24%');
    });

    test('menu quota lines follow the same used vs remaining mode', () => {
        const quota = snapshot(76).quotas[0]!;
        expect(quotaMenuLineText(quota, 'remaining')).toBe('Five-hour: 76% remaining');
        expect(quotaMenuLineText(quota, 'used')).toBe('Five-hour: 24% used');
    });

    test('can hide provider names in the top bar label', () => {
        const entries = barEntries(['chatgpt'], new Map([['chatgpt', snapshot(76)]]), () => 'five-hour', 'placeholder');
        const entry = entries[0]!;
        expect(barItemLabel(entry, true)).toBe('ChatGPT 76%');
        expect(barItemLabel(entry, false)).toBe('76%');
    });

    test('follows the unavailable-data setting instead of showing zero', () => {
        const snapshots = new Map([['chatgpt', snapshot()]]);
        expect(barEntries(['chatgpt'], snapshots, () => 'five-hour', 'hide')).toEqual([]);
        expect(barEntries(['chatgpt'], snapshots, () => 'five-hour', 'placeholder')[0]?.text).toBe('—');
        expect(barEntries(['chatgpt'], snapshots, () => 'icon-only', 'icon-only')[0]?.text).toBeUndefined();
    });
});
