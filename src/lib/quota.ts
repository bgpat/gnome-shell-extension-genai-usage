import type { QuotaWindow } from './model.js';

export const FIVE_HOUR_MINS = 300;
export const WEEKLY_MINS = 10080;

export function remainingFromUsed(usedPercent: number | undefined): number | undefined {
    if (usedPercent === undefined || !Number.isFinite(usedPercent))
        return undefined;
    return Math.min(100, Math.max(0, 100 - usedPercent));
}

export function windowLabel(mins: number | null | undefined): string {
    if (mins === FIVE_HOUR_MINS)
        return 'Five-hour';
    if (mins === WEEKLY_MINS)
        return 'Weekly';
    if (mins === undefined || mins === null || !Number.isFinite(mins) || mins <= 0)
        return 'Quota';
    if (mins % (60 * 24) === 0) {
        const days = mins / (60 * 24);
        return days === 1 ? '1 day' : `${days} days`;
    }
    if (mins % 60 === 0) {
        const hours = mins / 60;
        return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    return `${mins} min`;
}

export function selectQuota(quotas: QuotaWindow[], mode: string): QuotaWindow | undefined {
    if (quotas.length === 0)
        return undefined;

    if (mode === 'lowest' || mode === '') {
        const known = quotas.filter(quota => quota.remainingPercent !== undefined);
        if (known.length === 0)
            return undefined;
        return known.reduce((best, item) => {
            if (item.remainingPercent! < best.remainingPercent!)
                return item;
            return best;
        });
    }

    if (mode === 'five-hour')
        return quotas.find(quota => quota.windowDurationMins === FIVE_HOUR_MINS);

    if (mode === 'weekly')
        return quotas.find(quota => quota.windowDurationMins === WEEKLY_MINS);

    return quotas.find(quota => quota.id === mode);
}
