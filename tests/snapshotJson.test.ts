import { describe, expect, test } from 'bun:test';

import type { UsageSnapshot } from '../src/lib/model.js';
import { previewSnapshotsToJson, snapshotsFromJson, snapshotsToJson } from '../src/lib/snapshotJson.js';

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

    test('keeps billing contact details and history out of the preview payload', () => {
        const overview = { details: [{ label: 'Billing email', value: 'billing@example.test' }], history: [], hasMore: false };
        const json = previewSnapshotsToJson(new Map([['cursor', { ...sample, billingOverview: overview }]]));
        expect(snapshotsFromJson(json).get('cursor')).toEqual(sample);
        expect(json).not.toContain('billing@example.test');
    });

    test('returns an empty map for invalid JSON', () => {
        expect(snapshotsFromJson('not json').size).toBe(0);
    });
});
