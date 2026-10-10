import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { snapshotFromCodex } from '../src/lib/providers/chatgpt/normalize.js';
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
        expect(tokenFromAuthJson('{}')).toBeUndefined();
    });
});
