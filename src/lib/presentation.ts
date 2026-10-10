import { formatRemaining } from './format.js';
import type { UsageSnapshot } from './model.js';
import { catalogEntry } from './providers/catalog.js';
import { selectQuota } from './quota.js';

export type UnavailableDisplay = 'hide' | 'placeholder' | 'icon-only';
export type CachedDataMode = 'show' | 'hide';

export interface BarEntry {
    providerId: string;
    displayName: string;
    text?: string;
    accessible: string;
}

export function barItemLabel(entry: BarEntry, showProviderNames: boolean): string | undefined {
    if (!entry.text)
        return undefined;
    return showProviderNames ? `${entry.displayName} ${entry.text}` : entry.text;
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
        const name = snapshot?.displayName ?? catalogEntry(id)?.displayName ?? id;
        const quota = snapshot?.availability.state === 'available'
            ? selectQuota(snapshot.quotas, quotaMode(id))
            : undefined;
        const text = formatRemaining(quota?.remainingPercent);
        if (text) {
            entries.push({ providerId: id, displayName: name, text, accessible: `${name} ${text}` });
            continue;
        }
        if (unavailable === 'hide')
            continue;
        if (unavailable === 'icon-only') {
            entries.push({ providerId: id, displayName: name, accessible: name });
            continue;
        }
        entries.push({
            providerId: id,
            displayName: name,
            text: '—',
            accessible: `${name} unavailable`,
        });
    }
    return entries;
}
