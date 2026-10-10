import { describe, expect, test } from 'bun:test';

import type { UsageSnapshot } from '../src/lib/model.js';
import { snapshotsFromJson, snapshotsToJson } from '../src/lib/snapshotJson.js';

const sample: UsageSnapshot = {
    providerId: 'cursor',
    displayName: 'Cursor',
    source: 'unofficial',
    availability: { state: 'available' },
    quotas: [{ id: 'total', label: 'Plan', remainingPercent: 42 }],
    refreshedAt: 1_700_000_000_000,
};

describe('snapshot JSON', () => {
    test('round-trips a snapshot map', () => {
        const map = new Map([['cursor', sample]]);
        const restored = snapshotsFromJson(snapshotsToJson(map));
        expect(restored.get('cursor')).toEqual(sample);
    });

    test('returns an empty map for invalid JSON', () => {
        expect(snapshotsFromJson('not json').size).toBe(0);
    });
});
