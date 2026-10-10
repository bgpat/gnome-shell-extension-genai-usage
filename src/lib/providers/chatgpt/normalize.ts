import { displayPlan } from '../../format.js';
import {
    finiteNumber,
    isRecord,
    unavailableSnapshot,
    type CreditBalance,
    type QuotaWindow,
    type UsageSnapshot,
} from '../../model.js';
import { remainingFromUsed, windowLabel } from '../../quota.js';

const PROVIDER_ID = 'chatgpt';
const DISPLAY_NAME = 'ChatGPT';

interface WindowInput {
    usedPercent?: number;
    windowDurationMins?: number;
    resetsAt?: number;
}

function readWindow(value: unknown): WindowInput | undefined {
    if (!isRecord(value))
        return undefined;
    const usedPercent = finiteNumber(value['usedPercent']);
    if (usedPercent === undefined)
        return undefined;
    const duration = finiteNumber(value['windowDurationMins']);
    const resetsAt = finiteNumber(value['resetsAt']);
    return {
        usedPercent,
        windowDurationMins: duration,
        resetsAt,
    };
}

function pushWindow(quotas: QuotaWindow[], id: string, value: unknown): void {
    const window = readWindow(value);
    if (!window || window.usedPercent === undefined)
        return;
    const remaining = remainingFromUsed(window.usedPercent);
    quotas.push({
        id,
        label: windowLabel(window.windowDurationMins),
        usedPercent: window.usedPercent,
        remainingPercent: remaining,
        resetsAt: window.resetsAt,
        windowDurationMins: window.windowDurationMins,
    });
}

function readCredits(value: unknown): CreditBalance | undefined {
    if (!isRecord(value))
        return undefined;
    const balance = typeof value['balance'] === 'string' && value['balance'].trim() !== ''
        ? value['balance']
        : undefined;
    const unlimited = value['unlimited'] === true;
    const hasCredits = value['hasCredits'] === true;
    if (balance === undefined && !unlimited && !hasCredits)
        return undefined;
    return { balance, unlimited, hasCredits };
}

function windowsFromLimits(limits: Record<string, unknown>): { quotas: QuotaWindow[]; credits?: CreditBalance; plan?: string } {
    const quotas: QuotaWindow[] = [];
    pushWindow(quotas, 'primary', limits['primary']);
    pushWindow(quotas, 'secondary', limits['secondary']);
    return {
        quotas,
        credits: readCredits(limits['credits']),
        plan: displayPlan(typeof limits['planType'] === 'string' ? limits['planType'] : undefined),
    };
}

function accountPlan(account: unknown): string | undefined {
    if (!isRecord(account))
        return undefined;
    if (account['type'] === 'apiKey')
        return 'API key';
    if (account['type'] !== 'chatgpt')
        return undefined;
    return displayPlan(typeof account['planType'] === 'string' ? account['planType'] : undefined);
}

export function snapshotFromCodex(accountResult: unknown, limitsResult: unknown, nowMs: number): UsageSnapshot {
    if (!isRecord(accountResult))
        return unavailableSnapshot(PROVIDER_ID, DISPLAY_NAME, 'official', 'Codex account response was not an object');

    const account = accountResult['account'];
    if (accountResult['requiresOpenaiAuth'] === true && !isRecord(account)) {
        return unavailableSnapshot(
            PROVIDER_ID,
            DISPLAY_NAME,
            'official',
            'Codex is not signed in. Run codex login.',
        );
    }

    let quotas: QuotaWindow[] = [];
    let credits: CreditBalance | undefined;
    let plan = accountPlan(account);

    if (isRecord(limitsResult)) {
        const primaryView = isRecord(limitsResult['rateLimits']) ? limitsResult['rateLimits'] : undefined;
        const parsed = primaryView ? windowsFromLimits(primaryView) : { quotas: [] };
        quotas = parsed.quotas;
        credits = parsed.credits;
        plan = plan ?? parsed.plan;

        if (quotas.length === 0 && isRecord(limitsResult['rateLimitsByLimitId'])) {
            for (const value of Object.values(limitsResult['rateLimitsByLimitId'])) {
                if (!isRecord(value))
                    continue;
                const bucket = windowsFromLimits(value);
                if (bucket.quotas.length === 0)
                    continue;
                quotas = bucket.quotas;
                credits = credits ?? bucket.credits;
                plan = plan ?? bucket.plan;
                break;
            }
        }
    }

    const notices: string[] = [];
    if (quotas.length === 0)
        notices.push('Codex did not return a quota window.');

    return {
        providerId: PROVIDER_ID,
        displayName: DISPLAY_NAME,
        source: 'official',
        availability: { state: 'available' },
        plan,
        quotas,
        credits,
        refreshedAt: nowMs,
        notices: notices.length > 0 ? notices : undefined,
    };
}
