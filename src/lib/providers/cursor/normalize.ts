import { displayPlan } from '../../format.js';
import {
    finiteNumber,
    isRecord,
    unavailableSnapshot,
    type BillingAmount,
    type QuotaWindow,
    type UsageSnapshot,
} from '../../model.js';
import { remainingFromUsed } from '../../quota.js';

const PROVIDER_ID = 'cursor';
const DISPLAY_NAME = 'Cursor';

export interface CursorQuotaOption {
    id: string;
    label: string;
}

function isoToUnix(value: unknown): number | undefined {
    if (typeof value !== 'string')
        return undefined;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms))
        return undefined;
    return Math.floor(ms / 1000);
}

function addPercentQuota(
    quotas: QuotaWindow[],
    id: string,
    label: string,
    usedPercent: number | undefined,
    resetsAt: number | undefined,
): void {
    const remaining = remainingFromUsed(usedPercent);
    if (usedPercent === undefined || remaining === undefined)
        return;
    quotas.push({
        id,
        label,
        usedPercent,
        remainingPercent: remaining,
        resetsAt,
    });
}

function cents(value: unknown): number | undefined {
    const amount = finiteNumber(value);
    if (amount === undefined)
        return undefined;
    return amount / 100;
}

function billingFrom(value: unknown, label: string): BillingAmount | undefined {
    if (!isRecord(value))
        return undefined;
    const amount = cents(value['used']);
    if (amount === undefined)
        return undefined;
    return {
        label,
        amount,
        limit: cents(value['limit']),
        currency: 'USD',
    };
}

export function snapshotFromOfficial(status: unknown, about: unknown, nowMs: number): UsageSnapshot {
    if (!isRecord(status))
        return unavailableSnapshot(PROVIDER_ID, DISPLAY_NAME, 'official', 'Cursor status response was not an object');

    if (status['isAuthenticated'] === false) {
        const message = typeof status['message'] === 'string' && status['message'].trim() !== ''
            ? status['message']
            : 'Cursor CLI is not signed in. Run cursor-agent login.';
        return unavailableSnapshot(PROVIDER_ID, DISPLAY_NAME, 'official', message);
    }

    const tier = isRecord(about) && typeof about['subscriptionTier'] === 'string'
        ? about['subscriptionTier']
        : undefined;

    return {
        providerId: PROVIDER_ID,
        displayName: DISPLAY_NAME,
        source: 'official',
        availability: { state: 'available' },
        plan: displayPlan(tier),
        quotas: [],
        refreshedAt: nowMs,
        notices: ['The official Cursor CLI does not report quota or billing.'],
    };
}

export function quotasFromUsageSummary(summary: unknown): { quotas: QuotaWindow[]; plan?: string; billing?: BillingAmount[]; resetsAt?: number } {
    if (!isRecord(summary))
        return { quotas: [] };

    const resetsAt = isoToUnix(summary['billingCycleEnd']);
    const plan = displayPlan(typeof summary['membershipType'] === 'string' ? summary['membershipType'] : undefined);
    const quotas: QuotaWindow[] = [];
    const individual = isRecord(summary['individualUsage']) ? summary['individualUsage'] : undefined;
    const planBlock = individual && isRecord(individual['plan']) ? individual['plan'] : undefined;

    if (planBlock) {
        addPercentQuota(quotas, 'total', 'Plan', finiteNumber(planBlock['totalPercentUsed']), resetsAt);
        addPercentQuota(quotas, 'auto', 'Auto', finiteNumber(planBlock['autoPercentUsed']), resetsAt);
        addPercentQuota(quotas, 'api', 'API', finiteNumber(planBlock['apiPercentUsed']), resetsAt);
    }

    if (quotas.length === 0 && isRecord(summary['teamUsage'])) {
        const pooled = isRecord(summary['teamUsage']['pooled']) ? summary['teamUsage']['pooled'] : undefined;
        const used = pooled ? finiteNumber(pooled['used']) : undefined;
        const limit = pooled ? finiteNumber(pooled['limit']) : undefined;
        if (used !== undefined && limit !== undefined && limit > 0) {
            addPercentQuota(quotas, 'pooled', 'Pooled', (used / limit) * 100, resetsAt);
        }
    }

    const billing: BillingAmount[] = [];
    const onDemand = individual ? billingFrom(individual['onDemand'], 'On-demand') : undefined;
    if (onDemand)
        billing.push(onDemand);
    else if (isRecord(summary['teamUsage'])) {
        const teamOnDemand = billingFrom(summary['teamUsage']['onDemand'], 'Team on-demand');
        if (teamOnDemand)
            billing.push(teamOnDemand);
    }

    return {
        quotas,
        plan,
        billing: billing.length > 0 ? billing : undefined,
        resetsAt,
    };
}

export function quotaModesFromQuotas(quotas: QuotaWindow[]): CursorQuotaOption[] {
    const options = quotas.map(quota => ({ id: quota.id, label: quota.label }));
    if (options.length > 1)
        options.push({ id: 'lowest', label: 'Lowest remaining quota' });
    return options;
}

export function quotaOptionsFromSummary(summary: unknown): CursorQuotaOption[] {
    return quotaModesFromQuotas(quotasFromUsageSummary(summary).quotas);
}

export function snapshotFromUsageSummary(summary: unknown, nowMs: number, officialPlan?: string): UsageSnapshot {
    const parsed = quotasFromUsageSummary(summary);
    if (parsed.quotas.length === 0) {
        return {
            providerId: PROVIDER_ID,
            displayName: DISPLAY_NAME,
            source: 'unofficial',
            availability: { state: 'available' },
            plan: parsed.plan ?? officialPlan,
            quotas: [],
            billing: parsed.billing,
            refreshedAt: nowMs,
            notices: ['Cursor did not return a usable quota percentage.'],
        };
    }
    return {
        providerId: PROVIDER_ID,
        displayName: DISPLAY_NAME,
        source: 'unofficial',
        availability: { state: 'available' },
        plan: parsed.plan ?? officialPlan,
        quotas: parsed.quotas,
        billing: parsed.billing,
        refreshedAt: nowMs,
    };
}

export function mergeCursorFailure(official: UsageSnapshot, reason: string): UsageSnapshot {
    return {
        ...official,
        error: reason,
    };
}
