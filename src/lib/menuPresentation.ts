import { formatLastRefresh, formatResetCountdown } from './format.js';

/** Matches `.genai-usage-section` horizontal margins (12px each side). */
export const MENU_SECTION_HORIZONTAL_MARGIN = 24;
export const MENU_QUOTA_BAR_HEIGHT = 6;
export const MENU_QUOTA_BAR_FALLBACK_WIDTH = 240;

export interface MenuResetLabelRow {
    label: { text: string };
    resetsAt?: number;
    refreshedAt?: number;
    kind: 'reset' | 'refresh';
}

/** Rebuilding the popup while it is open breaks menu item activation; wait until close. */
export function deferMenuRebuildWhileOpen(menuIsOpen: boolean): boolean {
    return menuIsOpen;
}

/** Enabled providers in menu order (layout order, skipping disabled). */
export function menuEnabledProviderIds(
    order: readonly string[],
    enabled: ReadonlySet<string>,
): string[] {
    return order.filter(id => enabled.has(id));
}

export function menuQuotaBarInnerWidth(menuItemWidth: number): number | undefined {
    if (menuItemWidth <= 0)
        return undefined;
    const inner = Math.max(0, menuItemWidth - MENU_SECTION_HORIZONTAL_MARGIN);
    return inner > 0 ? inner : undefined;
}

export function menuQuotaBarSizes(
    trackWidth: number,
    displayPercent: number,
    height = MENU_QUOTA_BAR_HEIGHT,
): { trackWidth: number; fillWidth: number; height: number } {
    const fraction = Math.min(100, Math.max(0, displayPercent)) / 100;
    const fillWidth = Math.max(0, Math.round(trackWidth * fraction));
    return { trackWidth, fillWidth, height };
}

export function menuQuotaBarFillStyle(trackWidth: number, displayPercent: number): string | undefined {
    if (trackWidth <= 0)
        return undefined;
    const { fillWidth, height } = menuQuotaBarSizes(trackWidth, displayPercent);
    return `width: ${fillWidth}px; height: ${height}px;`;
}

export function menuResetLabelText(resetsAt: number | undefined, nowMs: number): string {
    const countdown = formatResetCountdown(resetsAt, nowMs);
    return countdown ? `Resets in ${countdown}` : 'Reset time unavailable';
}

export function menuRefreshLabelText(refreshedAt: number | undefined, nowMs: number): string {
    const text = formatLastRefresh(refreshedAt, nowMs);
    return text ? `Updated ${text}` : 'Not updated yet';
}

export function tickMenuResetLabels(rows: MenuResetLabelRow[], nowMs: number): void {
    for (const row of rows) {
        if (row.kind === 'reset')
            row.label.text = menuResetLabelText(row.resetsAt, nowMs);
        else
            row.label.text = menuRefreshLabelText(row.refreshedAt, nowMs);
    }
}
