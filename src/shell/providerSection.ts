import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { formatMoney } from '../lib/format.js';
import {
    MENU_QUOTA_BAR_FALLBACK_WIDTH,
    menuQuotaBarFillStyle,
    menuRefreshLabelText,
    menuResetLabelText,
    quotaMenuLineText,
    tickMenuResetLabels,
    type MenuResetLabelRow,
} from '../lib/menuPresentation.js';
import type { UsageSnapshot } from '../lib/model.js';
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
    const box = new St.BoxLayout({ vertical: true, style_class: 'genai-usage-section' });
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

    const quotaBars: QuotaBarWidgets[] = [];
    for (const quota of snapshot.quotas) {
        box.add_child(new St.Label({ text: quotaMenuLineText(quota) }));
        if (quota.remainingPercent !== undefined)
            quotaBars.push(appendQuotaBar(box, quota.remainingPercent));
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
    fill: St.Widget;
    displayPercent: number;
}

function applyQuotaBarFill(fill: St.Widget, sectionWidth: number, displayPercent: number): boolean {
    const style = menuQuotaBarFillStyle(sectionWidth, displayPercent)
        ?? menuQuotaBarFillStyle(MENU_QUOTA_BAR_FALLBACK_WIDTH, displayPercent);
    if (!style)
        return false;
    fill.set_style(style);
    return sectionWidth > 0;
}

function appendQuotaBar(box: St.BoxLayout, displayPercent: number): QuotaBarWidgets {
    const track = new St.Widget({
        style_class: 'quota-track',
        reactive: false,
        x_expand: true,
    });
    track.clip_to_allocation = true;
    const fill = new St.Widget({
        style_class: 'quota-fill',
        reactive: false,
    });
    track.add_child(fill);
    box.add_child(track);
    applyQuotaBarFill(fill, MENU_QUOTA_BAR_FALLBACK_WIDTH, displayPercent);
    return { fill, displayPercent };
}

/** Size fills from the section box width once allocated (no menu-item signals). */
function layoutSectionQuotaBars(box: St.BoxLayout, bars: QuotaBarWidgets[]): void {
    if (bars.length === 0)
        return;

    let widthSignal = 0;
    const sync = (): boolean => {
        let synced = false;
        for (const bar of bars)
            synced = applyQuotaBarFill(bar.fill, box.width, bar.displayPercent) || synced;
        return synced;
    };

    const finishWidthWatch = () => {
        if (widthSignal === 0)
            return;
        box.disconnect(widthSignal);
        widthSignal = 0;
    };

    const syncAndMaybeStop = () => {
        if (sync())
            finishWidthWatch();
    };

    widthSignal = box.connect('notify::width', syncAndMaybeStop);
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        syncAndMaybeStop();
        return GLib.SOURCE_REMOVE;
    });
}

export function tickResetLabels(rows: ResetLabel[], nowMs: number): void {
    tickMenuResetLabels(rows, nowMs);
}
