import { formatRemaining } from './format.js';
import type { UsageSnapshot } from './model.js';
import { selectQuota } from './quota.js';

export type UnavailableDisplay = 'hide' | 'placeholder' | 'icon-only';
export type CachedDataMode = 'show' | 'hide';

export interface BarEntry {
    providerId: string;
    text?: string;
    accessible: string;
}

export function barEntries(
    ids: readonly string[],
    snapshots: ReadonlyMap<string, UsageSnapshot>,
    quotaMode: (id: string) => string,
    unavailable: UnavailableDisplay,
): BarEntry[] {
    const entries: BarEntry[] = [];
    for (const id of ids) {
        const snapshot = snapshots.get(id);
        const name = snapshot?.displayName ?? id;
        const quota = snapshot?.availability.state === 'available'
            ? selectQuota(snapshot.quotas, quotaMode(id))
            : undefined;
        const text = formatRemaining(quota?.remainingPercent);
        if (text) {
            entries.push({ providerId: id, text, accessible: `${name} ${text}` });
            continue;
        }
        if (unavailable === 'hide')
            continue;
        if (unavailable === 'icon-only') {
            entries.push({ providerId: id, accessible: name });
            continue;
        }
        entries.push({ providerId: id, text: '—', accessible: `${name} unavailable` });
    }
    return entries;
}
