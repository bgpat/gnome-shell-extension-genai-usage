import { formatMoney } from '../../format.js';
import { finiteNumber, isRecord, type BillingDetail, type BillingOverview } from '../../model.js';

const CREDIT_REASONS: Record<string, string> = {
    monthly: 'Monthly credit',
    monthly_credit: 'Monthly credit',
    free_tier_credit: 'Monthly credit',
    purchased: 'Purchased credit',
    promotional: 'Promotional credit',
    promo: 'Promotional credit',
};

export function billingText(value: unknown): string | undefined {
    if (typeof value !== 'string')
        return undefined;
    return value.trim().slice(0, 240) || undefined;
}

function paymentMethod(value: unknown): string | undefined {
    if (value === null)
        return 'None on file';
    if (!isRecord(value))
        return undefined;
    const card = isRecord(value.card) ? value.card : value;
    const brand = billingText(card.brand);
    const last4 = billingText(card.last4);
    return [brand, last4 && /^\d{4}$/.test(last4) ? `•••• ${last4}` : undefined]
        .filter(Boolean).join(' ') || 'On file';
}

function billingAddress(value: unknown, valid: unknown): string | undefined {
    if (value === null || valid === false)
        return 'Not set';
    if (!isRecord(value))
        return undefined;
    return ['name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country']
        .map(key => billingText(value[key])).filter(Boolean).join(', ') || undefined;
}

function configuration(value: unknown): string | undefined {
    if (!isRecord(value) || value.ok !== true)
        return undefined;
    return value.data === null ? 'Not set' : value.data === undefined ? undefined : 'Configured';
}

function utcDate(value: unknown): string | undefined {
    if (typeof value !== 'string')
        return undefined;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : undefined;
}

function historyEntry(value: unknown, isCredit: boolean): (BillingDetail & { date?: string }) | undefined {
    if (!isRecord(value))
        return undefined;
    const currency = billingText(value.currency)?.toUpperCase();
    const amount = formatMoney(finiteNumber(value.amount), currency);
    const remaining = formatMoney(finiteNumber(value.remaining), currency);
    const date = utcDate(value.createdAt);
    const expires = utcDate(value.expiresAt);
    const status = billingText(value.status);
    const reason = billingText(value.reason);
    const label = isCredit ? (reason && CREDIT_REASONS[reason]) || reason || 'Credit' : 'Payment';
    const parts = [
        amount,
        remaining ? `${remaining} remaining` : undefined,
        expires ? `Expires ${expires}` : undefined,
        date,
        status,
    ].filter(Boolean);
    return parts.length ? { label, value: parts.join(' · '), date } : undefined;
}

export function billingOverview(response: Record<string, unknown>, billing: Record<string, unknown>): BillingOverview {
    const details: BillingDetail[] = [];
    const add = (label: string, value: string | undefined) => {
        if (value !== undefined)
            details.push({ label, value });
    };
    const autoRecharge = isRecord(billing.autoPay) ? billing.autoPay.enabled : billing.autoPay;
    const resetsInDays = finiteNumber(billing.resetsInDays);
    add('Billing period', billingText(billing.cycleLabel));
    add('Billing period ends in', resetsInDays === undefined ? undefined : `${resetsInDays} days`);
    add('Auto-recharge', autoRecharge === true ? 'On' : autoRecharge === false || billing.autoPay === null ? 'Off' : undefined);
    add('Payment method', paymentMethod(billing.paymentMethod));
    add('Billing email', billingText(billing.invoiceEmail));
    add('Billing address', billingAddress(billing.billingAddress, billing.billingAddressValid));
    add('Tax ID', billing.taxId === null ? 'Not set' : billing.taxId === undefined ? undefined : 'On file');
    add('Budget alerts', configuration(response.budgetAlerts));
    add('Spend limit', configuration(response.spendLimit));

    const credits = response.credits ?? billing.credits;
    const history = [
        ...(Array.isArray(credits) ? credits.map(item => historyEntry(item, true)) : []),
        ...(Array.isArray(response.payments) ? response.payments.map(item => historyEntry(item, false)) : []),
    ].filter(item => item !== undefined);
    history.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return {
        details,
        history: history.map(({ label, value }) => ({ label, value })),
        hasMore: response.hasMore === true,
    };
}
