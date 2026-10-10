export type DataSource = 'official' | 'unofficial';

export type Availability =
    | { state: 'available' }
    | { state: 'unavailable'; reason: string };

export interface QuotaWindow {
    id: string;
    label: string;
    remainingPercent?: number;
    usedPercent?: number;
    resetsAt?: number;
    windowDurationMins?: number;
}

export interface CreditBalance {
    balance?: string;
    unlimited?: boolean;
    hasCredits?: boolean;
}

export interface BillingAmount {
    label: string;
    amount?: number;
    limit?: number;
    currency?: string;
}

export interface UsageSnapshot {
    providerId: string;
    displayName: string;
    source: DataSource;
    availability: Availability;
    plan?: string;
    quotas: QuotaWindow[];
    credits?: CreditBalance;
    billing?: BillingAmount[];
    refreshedAt?: number;
    notices?: string[];
    error?: string;
}

export function unavailableSnapshot(
    providerId: string,
    displayName: string,
    source: DataSource,
    reason: string,
): UsageSnapshot {
    return {
        providerId,
        displayName,
        source,
        availability: { state: 'unavailable', reason },
        quotas: [],
    };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function finiteNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return undefined;
    return value;
}

export function publicError(message: string): string {
    return message.replace(/eyJ[A-Za-z0-9_-]{10,}/g, '[redacted]').slice(0, 300);
}
