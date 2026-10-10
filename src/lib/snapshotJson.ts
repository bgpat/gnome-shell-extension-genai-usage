import type { UsageSnapshot } from './model.js';

export function snapshotsToJson(snapshots: ReadonlyMap<string, UsageSnapshot>): string {
    const record: Record<string, UsageSnapshot> = {};
    for (const [id, snapshot] of snapshots)
        record[id] = snapshot;
    return JSON.stringify(record);
}

export function snapshotsFromJson(text: string): Map<string, UsageSnapshot> {
    const map = new Map<string, UsageSnapshot>();
    if (text.trim() === '')
        return map;
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return map;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return map;
    for (const [id, snapshot] of Object.entries(parsed)) {
        if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot))
            map.set(id, snapshot as UsageSnapshot);
    }
    return map;
}
