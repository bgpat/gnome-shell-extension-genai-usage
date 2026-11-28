import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { snapshotFromCodex } from '../src/lib/providers/chatgpt/normalize.js';
import { normalizeJevBilling } from '../src/lib/providers/jev/normalize.js';
import { barEntries } from '../src/lib/presentation.js';
import {
    mergeCursorFailure,
    quotaOptionsFromSummary,
    snapshotFromOfficial,
    snapshotFromUsageSummary,
} from '../src/lib/providers/cursor/normalize.js';
import { cookieHeader, sessionFromAccessToken, tokenFromAuthJson } from '../src/lib/providers/cursor/session.js';

const limits = JSON.parse(readFileSync(new URL('./fixtures/codex-rate-limits.json', import.meta.url), 'utf8')) as unknown;
const summary = JSON.parse(readFileSync(new URL('./fixtures/cursor-usage-summary.json', import.meta.url), 'utf8')) as unknown;

function jwt(payload: object): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

describe('ChatGPT normalization', () => {
    test('maps Codex rate-limit windows without treating a missing window as zero', () => {
        const snapshot = snapshotFromCodex(
            { account: { type: 'chatgpt', planType: 'plus' }, requiresOpenaiAuth: false },
            limits,
            1_000,
        );
        expect(snapshot.availability.state).toBe('available');
        expect(snapshot.plan).toBe('Plus');
        expect(snapshot.quotas.map(quota => quota.remainingPercent)).toEqual([76, 45]);
        expect(snapshot.quotas.map(quota => quota.label)).toEqual(['Five-hour', 'Weekly']);
        expect(snapshot.credits?.balance).toBe('12.50');
        expect(snapshot.refreshedAt).toBe(1_000);
    });

    test('reports a signed-out Codex session instead of empty usage', () => {
        const snapshot = snapshotFromCodex({ account: null, requiresOpenaiAuth: true }, {}, 1);
        expect(snapshot.availability).toEqual({
            state: 'unavailable',
            reason: 'Codex is not signed in. Run codex login.',
        });
        expect(snapshot.quotas).toEqual([]);
    });
});

describe('Cursor normalization', () => {
    test('official CLI status does not invent quota', () => {
        const snapshot = snapshotFromOfficial(
            { isAuthenticated: true, status: 'authenticated' },
            { subscriptionTier: null },
            1,
        );
        expect(snapshot.quotas).toEqual([]);
        expect(snapshot.plan).toBeUndefined();
        expect(snapshot.notices?.[0]).toContain('does not report quota');
    });

    test('usage-summary percentages are remaining quota, not the mismatched remaining field', () => {
        const snapshot = snapshotFromUsageSummary(summary, 1);
        const total = snapshot.quotas.find(quota => quota.id === 'total');
        expect(total?.remainingPercent).toBeCloseTo(67.11771894093687);
        expect(snapshot.plan).toBe('Pro Plus');
        expect(snapshot.source).toBe('unofficial');
        expect(quotaOptionsFromSummary(summary).map(option => option.id)).toEqual(['total', 'auto', 'api', 'lowest']);
    });

    test('keeps the official snapshot when the unofficial request fails', () => {
        const official = snapshotFromOfficial({ isAuthenticated: true }, { subscriptionTier: 'pro' }, 1);
        const merged = mergeCursorFailure(official, 'Cursor rejected the local session. Sign in again.');
        expect(merged.plan).toBe('Pro');
        expect(merged.quotas).toEqual([]);
        expect(merged.error).toContain('rejected');
    });

    test('builds the session cookie from a usable JWT and ignores expired tokens', () => {
        const token = jwt({ sub: 'auth0|user_01ABC', exp: 2_000_000_000 });
        const session = sessionFromAccessToken(token, 1_700_000_000);
        expect(session?.userId).toBe('user_01ABC');
        expect(cookieHeader(session!)).toBe(`WorkosCursorSessionToken=user_01ABC%3A%3A${token}`);
        expect(sessionFromAccessToken(token, 1_999_999_990)).toBeUndefined();
        expect(tokenFromAuthJson(JSON.stringify({ accessToken: token }))).toBe(token);
        expect(tokenFromAuthJson(JSON.stringify({ access_token: token, refresh_token: 'unused' }))).toBe(token);
        expect(tokenFromAuthJson('{}')).toBeUndefined();
    });
});

describe('Jev billing normalization', () => {
    test('shows the remaining or used share of active grants, including exhausted grants', () => {
        const snapshot = normalizeJevBilling({
            billing: {
                balance: 3,
                credits: [
                    { amount: 5, remaining: 3, expiresAt: '2026-12-21T00:00:00Z' },
                    { amount: 5, remaining: 0, expiresAt: null },
                    { amount: 20, remaining: 8, expiresAt: '2026-11-01T00:00:00Z' },
                ],
            },
        }, Date.parse('2026-11-27T00:00:00Z'));
        expect(snapshot?.credits?.balance).toBe('$3.00');
        const snapshots = new Map([['jev', snapshot!]]);
        expect(barEntries(['jev'], snapshots, () => 'lowest', 'hide')[0]?.text).toBe('30%');
        expect(barEntries(['jev'], snapshots, () => 'lowest', 'hide', 'used')[0]?.text).toBe('70%');
    });

    test('keeps the dollar balance when credits do not explain the whole balance', () => {
        const snapshot = normalizeJevBilling({ billing: {
            balance: 5,
            credits: [{ amount: 2, remaining: 1 }],
        } }, 1_000);
        expect(snapshot?.credits?.balance).toBe('$5.00');
        expect(snapshot?.quotas).toEqual([]);
    });

    test('shows zero remaining when active credit is fully spent', () => {
        const snapshot = normalizeJevBilling({ billing: {
            balance: 0,
            credits: [{ amount: 5, remaining: 0 }],
        } }, 1_000);
        expect(snapshot?.quotas[0]?.remainingPercent).toBe(0);
    });

    test('preserves available billing information and the reported history', () => {
        const grant = {
            amount: 5, remaining: 5, reason: 'free_tier_credit',
            createdAt: '2026-11-21T00:00:00Z', expiresAt: '2026-12-21T00:00:00Z',
        };
        const snapshot = normalizeJevBilling({
            billing: {
                plan: 'free_plan', balance: 5, spent: 0, purchased: 0, freeCreditsRemaining: 5,
                cycleLabel: 'November', resetsInDays: 2, autoPay: null, paymentMethod: null,
                invoiceEmail: 'billing@example.test', billingAddressValid: false, taxId: null,
                credits: [grant],
            },
            credits: [grant],
            payments: [{ amount: 10, status: 'Paid', createdAt: '2026-11-22T00:00:00Z' }],
            budgetAlerts: { ok: true, data: null },
            spendLimit: { ok: true, data: null },
            hasMore: true,
        }, Date.parse('2026-11-28T00:00:00Z'));
        expect(snapshot?.plan).toBe('Free');
        expect(snapshot?.billing).toEqual([
            { label: 'Spent (November)', amount: 0 },
            { label: 'Purchased credits', amount: 0 },
            { label: 'Free credits remaining', amount: 5 },
        ]);
        expect(snapshot?.billingOverview?.details).toContainEqual({ label: 'Auto-recharge', value: 'Off' });
        expect(snapshot?.billingOverview?.details).toContainEqual({ label: 'Billing email', value: 'billing@example.test' });
        expect(snapshot?.billingOverview?.details).toContainEqual({ label: 'Billing address', value: 'Not set' });
        expect(snapshot?.billingOverview?.history).toEqual([
            { label: 'Payment', value: '$10.00 · 2026-11-22 00:00 UTC · Paid' },
            { label: 'Monthly credit', value: '$5.00 · $5.00 remaining · Expires 2026-12-21 00:00 UTC · 2026-11-21 00:00 UTC' },
        ]);
        expect(snapshot?.billingOverview?.hasMore).toBe(true);
    });

    test('keeps a missing or invalid balance unavailable', () => {
        for (const billing of [{}, { balance: null }, { balance: Number.NaN }])
            expect(normalizeJevBilling({ billing }, 1_000)).toBeUndefined();
    });
});
