import { formatMoney } from '../../format.js';
import { finiteNumber, isRecord, type UsageSnapshot } from '../../model.js';

export function normalizeJevBilling(response: unknown, refreshedAt: number): UsageSnapshot | undefined {
    if (!isRecord(response) || !isRecord(response.billing))
        return undefined;
    const balance = formatMoney(finiteNumber(response.billing.balance));
    if (balance === undefined)
        return undefined;
    return {
        providerId: 'jev',
        displayName: 'Jev',
        source: 'unofficial',
        availability: { state: 'available' },
        quotas: [],
        credits: { balance },
        refreshedAt,
    };
}
