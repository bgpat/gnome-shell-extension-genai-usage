import { displayPlan, formatMoney } from '../../format.js';
import { billingOverview, billingText } from './billingOverview.js';
import { finiteNumber, isRecord, type UsageSnapshot } from '../../model.js';

export function normalizeJevBilling(response: unknown, refreshedAt: number): UsageSnapshot | undefined {
    if (!isRecord(response) || !isRecord(response.billing))
        return undefined;
    const balance = finiteNumber(response.billing.balance);
    if (balance === undefined || balance < 0)
        return undefined;
    const billing = response.billing;
    const remainingPercent = creditRemainingPercent(billing.credits, balance, refreshedAt);
    const plan = billingText(billing.plan);
    const cycle = billingText(billing.cycleLabel);
    const amounts = [
        { label: cycle ? `Spent (${cycle})` : 'Spent', amount: finiteNumber(billing.spent) },
        { label: 'Purchased credits', amount: finiteNumber(billing.purchased) },
        { label: 'Free credits remaining', amount: finiteNumber(billing.freeCreditsRemaining) },
    ].filter(row => row.amount !== undefined);
    return {
        providerId: 'jev',
        displayName: 'Jev',
        source: 'unofficial',
        availability: { state: 'available' },
        quotas: remainingPercent === undefined
            ? []
            : [{ id: 'credits', label: 'Credits', remainingPercent }],
        plan: displayPlan(plan === 'free_plan' ? 'free' : plan),
        credits: { balance: formatMoney(balance) },
        billing: amounts,
        billingOverview: billingOverview(response, billing),
        refreshedAt,
    };
}

function creditRemainingPercent(credits: unknown, balance: number, nowMs: number): number | undefined {
    if (!Array.isArray(credits))
        return undefined;

    let granted = 0;
    let remaining = 0;
    for (const credit of credits) {
        if (!isRecord(credit))
            return undefined;
        if (credit.expiresAt != null) {
            const deadline = typeof credit.expiresAt === 'string' ? Date.parse(credit.expiresAt) : NaN;
            if (!Number.isFinite(deadline))
                return undefined;
            if (deadline <= nowMs)
                continue;
        }
        const amount = finiteNumber(credit.amount);
        const unused = finiteNumber(credit.remaining);
        if (amount === undefined || unused === undefined || unused < 0 || unused > amount)
            return undefined;
        granted += amount;
        remaining += unused;
    }

    // Grant rows sometimes cover only part of the account balance.
    if (granted <= 0 || !Number.isFinite(granted) || Math.abs(balance - remaining) > 0.000001)
        return undefined;
    return (remaining / granted) * 100;
}
