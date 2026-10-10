export function formatRemaining(percent: number | undefined): string | undefined {
    if (percent === undefined || !Number.isFinite(percent))
        return undefined;
    return `${Math.round(percent)}%`;
}

export function formatResetCountdown(resetsAtSec: number | undefined, nowMs: number): string | undefined {
    if (resetsAtSec === undefined || !Number.isFinite(resetsAtSec))
        return undefined;
    const delta = resetsAtSec * 1000 - nowMs;
    if (delta <= 0)
        return 'Reset due';
    const totalMin = Math.floor(delta / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0)
        return `${days}d ${hours}h`;
    if (hours > 0)
        return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export function formatLastRefresh(unixMs: number | undefined, nowMs: number): string | undefined {
    if (unixMs === undefined || !Number.isFinite(unixMs))
        return undefined;
    const min = Math.floor(Math.max(0, nowMs - unixMs) / 60000);
    if (min < 1)
        return 'Just now';
    if (min < 60)
        return `${min} min ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24)
        return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
}

export function formatMoney(amount: number | undefined, currency = 'USD'): string | undefined {
    if (amount === undefined || !Number.isFinite(amount))
        return undefined;
    const rounded = Math.round(amount * 100) / 100;
    return `${currency} ${rounded.toFixed(2)}`;
}

const PLAN_LABELS: Record<string, string> = {
    free: 'Free',
    go: 'Go',
    plus: 'Plus',
    pro: 'Pro',
    prolite: 'Pro Lite',
    promax: 'Pro Max',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    edu: 'Edu',
    edu_plus: 'Edu Plus',
    edu_pro: 'Edu Pro',
    pro_plus: 'Pro Plus',
};

export function displayPlan(raw: string | null | undefined): string | undefined {
    if (raw === undefined || raw === null)
        return undefined;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === 'unknown')
        return undefined;
    const known = PLAN_LABELS[trimmed];
    if (known)
        return known;
    return trimmed
        .split('_')
        .filter(part => part.length > 0)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
