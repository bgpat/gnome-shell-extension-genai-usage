import { describe, expect, test } from 'bun:test';

import type { QuotaWindow } from '../src/lib/model.js';
import {
    deferMenuRebuildWhileOpen,
    MENU_QUOTA_BAR_FALLBACK_WIDTH,
    MENU_SECTION_HORIZONTAL_MARGIN,
    menuEnabledProviderIds,
    menuQuotaBarFillStyle,
    menuQuotaBarInnerWidth,
    menuQuotaBarSizes,
    menuRefreshLabelText,
    menuResetLabelText,
    quotaMenuLineText,
    tickMenuResetLabels,
} from '../src/lib/menuPresentation.js';

const quota: QuotaWindow = {
    id: 'primary',
    label: 'Five-hour',
    remainingPercent: 76,
    windowDurationMins: 300,
};

describe('top bar menu presentation', () => {
    test('defers menu rebuild while the popup is open', () => {
        expect(deferMenuRebuildWhileOpen(true)).toBe(true);
        expect(deferMenuRebuildWhileOpen(false)).toBe(false);
    });

    test('lists enabled providers in layout order', () => {
        const order = ['cursor', 'chatgpt', 'codex'];
        const enabled = new Set(['chatgpt', 'codex']);
        expect(menuEnabledProviderIds(order, enabled)).toEqual(['chatgpt', 'codex']);
    });

    test('formats quota lines for the dropdown', () => {
        expect(quotaMenuLineText(quota)).toBe('Five-hour: 76% remaining');
        expect(quotaMenuLineText({ ...quota, remainingPercent: undefined })).toBe('Unavailable');
    });

    test('sizes the quota bar from menu width minus section margins', () => {
        expect(menuQuotaBarInnerWidth(0)).toBeUndefined();
        expect(menuQuotaBarInnerWidth(MENU_SECTION_HORIZONTAL_MARGIN)).toBeUndefined();
        expect(menuQuotaBarInnerWidth(300)).toBe(300 - MENU_SECTION_HORIZONTAL_MARGIN);
    });

    test('derives fill width from the display percentage', () => {
        expect(menuQuotaBarSizes(MENU_QUOTA_BAR_FALLBACK_WIDTH, 76)).toEqual({
            trackWidth: MENU_QUOTA_BAR_FALLBACK_WIDTH,
            fillWidth: 182,
            height: 6,
        });
        expect(menuQuotaBarSizes(200, 0).fillWidth).toBe(0);
        expect(menuQuotaBarSizes(200, 150).fillWidth).toBe(200);
        expect(menuQuotaBarSizes(200, -5).fillWidth).toBe(0);
    });

    test('styles fill to the allocated track width so 100% fills the bar', () => {
        expect(menuQuotaBarFillStyle(300, 100)).toBe('width: 300px; height: 6px;');
        expect(menuQuotaBarFillStyle(300, 76)).toBe('width: 228px; height: 6px;');
        expect(menuQuotaBarFillStyle(0, 100)).toBeUndefined();
    });

    test('updates reset and refresh labels while the menu is open', () => {
        const now = Date.parse('2026-10-10T00:00:00Z');
        const resetsAt = Date.parse('2026-10-10T02:30:00Z') / 1000;
        const refreshedAt = Date.parse('2026-10-10T00:00:00Z');
        const reset = { text: '' };
        const refreshed = { text: '' };
        tickMenuResetLabels([
            { label: reset, resetsAt, kind: 'reset' },
            { label: refreshed, refreshedAt, kind: 'refresh' },
        ], now);
        expect(reset.text).toBe(menuResetLabelText(resetsAt, now));
        expect(refreshed.text).toBe(menuRefreshLabelText(refreshedAt, now));
    });
});
