import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { formatMoney } from '../lib/format.js';
import {
    MENU_QUOTA_BAR_HEIGHT,
    menuQuotaBarSizes,
    menuRefreshLabelText,
    menuResetLabelText,
    tickMenuResetLabels,
    type MenuResetLabelRow,
} from '../lib/menuPresentation.js';
import type { UsageSnapshot } from '../lib/model.js';
import { quotaMenuLineText, quotaPercentForDisplay } from '../lib/presentation.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { attachProviderStIcon } from './providerIconView.js';

export interface ResetLabel extends MenuResetLabelRow {
    label: St.Label;
}

export function fillProviderSection(
    section: PopupMenu.PopupMenuSection,
    providerId: string,
    snapshot: UsageSnapshot | undefined,
    showPlan: boolean,
    showBilling: boolean,
    nowMs: number,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
    isCurrent: () => boolean,
): ResetLabel[] {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    item.x_expand = true;
    const box = new St.BoxLayout({
        vertical: true,
        style_class: 'genai-usage-section',
        x_expand: true,
    });
    item.add_child(box);
    section.addMenuItem(item);

    const resets: ResetLabel[] = [];
    const name = snapshot?.displayName ?? 'Provider';
    const header = new St.BoxLayout({ style_class: 'genai-usage-section-header' });
    attachProviderStIcon(header, 0, providerId, settings, cancellable, isCurrent, undefined, 20);
    header.add_child(new St.Label({ text: name, style_class: 'genai-usage-title' }));
    box.add_child(header);

    if (!snapshot) {
        box.add_child(new St.Label({ text: 'No data yet', style_class: 'genai-usage-muted' }));
        return resets;
    }

    if (showPlan && snapshot.plan) {
        box.add_child(new St.Label({ text: `Plan: ${snapshot.plan}`, style_class: 'genai-usage-muted' }));
    }

    if (snapshot.quotas.length === 0 && snapshot.availability.state === 'available') {
        box.add_child(new St.Label({
            text: 'Quota data is unavailable',
            style_class: 'genai-usage-muted',
        }));
    }

    const percentMode = settings.quotaPercentMode;
    const quotaBars: QuotaBarWidgets[] = [];
    for (const quota of snapshot.quotas) {
        box.add_child(new St.Label({ text: quotaMenuLineText(quota, percentMode) }));
        const displayPercent = quotaPercentForDisplay(quota, percentMode);
        if (displayPercent !== undefined)
            quotaBars.push(appendQuotaBar(box, displayPercent));
        const reset = new St.Label({ style_class: 'genai-usage-muted' });
        reset.text = menuResetLabelText(quota.resetsAt, nowMs);
        box.add_child(reset);
        resets.push({ label: reset, resetsAt: quota.resetsAt, kind: 'reset' });
    }
    layoutSectionQuotaBars(box, quotaBars);

    if (snapshot.credits) {
        const parts: string[] = [];
        if (snapshot.credits.unlimited)
            parts.push('unlimited');
        if (snapshot.credits.balance)
            parts.push(snapshot.credits.balance);
        if (parts.length === 0 && snapshot.credits.hasCredits)
            parts.push('available');
        if (parts.length > 0)
            box.add_child(new St.Label({ text: `Credits: ${parts.join(', ')}`, style_class: 'genai-usage-muted' }));
    }

    if (showBilling && snapshot.billing) {
        for (const amount of snapshot.billing) {
            const used = formatMoney(amount.amount, amount.currency);
            const limit = formatMoney(amount.limit, amount.currency);
            if (!used)
                continue;
            const text = limit ? `${amount.label}: ${used} of ${limit}` : `${amount.label}: ${used}`;
            box.add_child(new St.Label({ text, style_class: 'genai-usage-muted' }));
        }
    }

    for (const notice of snapshot.notices ?? []) {
        box.add_child(new St.Label({ text: notice, style_class: 'genai-usage-notice' }));
    }

    const refreshed = new St.Label({ style_class: 'genai-usage-muted' });
    refreshed.text = menuRefreshLabelText(snapshot.refreshedAt, nowMs);
    box.add_child(refreshed);
    resets.push({ label: refreshed, refreshedAt: snapshot.refreshedAt, kind: 'refresh' });
    return resets;
}

interface QuotaBarWidgets {
    row: St.BoxLayout;
    fill: St.Widget;
    displayPercent: number;
}

const quotaBarRelayouts: (() => void)[] = [];

export function clearQuotaBarRelayouts(): void {
    quotaBarRelayouts.length = 0;
}

/** Re-run fill sizing after the popup is mapped (width is wrong while the menu is closed). */
export function relayoutOpenMenuQuotaBars(): void {
    for (const relayout of quotaBarRelayouts)
        relayout();
}

function quotaBarActorWidth(actor: St.BoxLayout | St.Widget): number {
    const alloc = actor.get_allocation_box();
    const fromAlloc = Math.max(0, alloc.x2 - alloc.x1);
    return Math.max(actor.width, fromAlloc);
}

function applyQuotaBarFill(fill: St.Widget, rowWidth: number, displayPercent: number): boolean {
    if (rowWidth <= 0)
        return false;
    const { fillWidth, height } = menuQuotaBarSizes(rowWidth, displayPercent);
    fill.set_size(fillWidth, height);
    return true;
}

function appendQuotaBar(box: St.BoxLayout, displayPercent: number): QuotaBarWidgets {
    const row = new St.BoxLayout({
        vertical: false,
        style_class: 'quota-track',
        reactive: false,
        x_expand: true,
    });
    const fill = new St.Widget({
        style_class: 'quota-fill',
        reactive: false,
    });
    const rest = new St.Widget({ reactive: false, x_expand: true });
    row.add_child(fill);
    row.add_child(rest);
    box.add_child(row);
    fill.set_size(1, MENU_QUOTA_BAR_HEIGHT);
    return { row, fill, displayPercent };
}

/** Sync fill width from the allocated row width (St ignores CSS % on fill widgets). */
function layoutSectionQuotaBars(box: St.BoxLayout, bars: QuotaBarWidgets[]): void {
    if (bars.length === 0)
        return;

    let syncing = false;

    const syncQuotaBarFills = () => {
        if (syncing)
            return;
        syncing = true;
        try {
            for (const bar of bars) {
                const rowW = quotaBarActorWidth(bar.row);
                if (rowW <= 0)
                    continue;
                applyQuotaBarFill(bar.fill, rowW, bar.displayPercent);
            }
        } finally {
            syncing = false;
        }
    };

    const scheduleSync = () => syncQuotaBarFills();

    quotaBarRelayouts.push(syncQuotaBarFills);

    for (const bar of bars)
        bar.row.connect('notify::allocation', scheduleSync);
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        scheduleSync();
        return GLib.SOURCE_REMOVE;
    });
}

export function tickResetLabels(rows: ResetLabel[], nowMs: number): void {
    tickMenuResetLabels(rows, nowMs);
}
