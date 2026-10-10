import { formatRemaining, usedPercent } from './format.js';
import type { QuotaWindow, UsageSnapshot } from './model.js';
import { catalogEntry } from './providers/catalog.js';
import { selectQuota } from './quota.js';

export type UnavailableDisplay = 'hide' | 'placeholder' | 'icon-only';
export type CachedDataMode = 'show' | 'hide';
export type QuotaPercentMode = 'remaining' | 'used';

export function quotaBarText(quota: QuotaWindow | undefined, mode: QuotaPercentMode): string | undefined {
    if (!quota)
        return undefined;
    if (mode === 'used')
        return formatRemaining(usedPercent(quota.usedPercent, quota.remainingPercent));
    return formatRemaining(quota.remainingPercent);
}

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
    percentMode: QuotaPercentMode = 'remaining',
): BarEntry[] {
    const entries: BarEntry[] = [];
    for (const id of ids) {
        const snapshot = snapshots.get(id);
        const name = snapshot?.displayName ?? catalogEntry(id)?.displayName ?? id;
        const quota = snapshot?.availability.state === 'available'
            ? selectQuota(snapshot.quotas, quotaMode(id))
            : undefined;
        const text = quotaBarText(quota, percentMode);
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
