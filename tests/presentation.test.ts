import { describe, expect, test } from 'bun:test';

import type { UsageSnapshot } from '../src/lib/model.js';
import { barEntries } from '../src/lib/presentation.js';

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
        expect(entries).toEqual([{ providerId: 'chatgpt', text: '76%', accessible: 'ChatGPT 76%' }]);
    });

    test('follows the unavailable-data setting instead of showing zero', () => {
        const snapshots = new Map([['chatgpt', snapshot()]]);
        expect(barEntries(['chatgpt'], snapshots, () => 'five-hour', 'hide')).toEqual([]);
        expect(barEntries(['chatgpt'], snapshots, () => 'five-hour', 'placeholder')[0]?.text).toBe('—');
        expect(barEntries(['chatgpt'], snapshots, () => 'icon-only', 'icon-only')[0]?.text).toBeUndefined();
    });
});
