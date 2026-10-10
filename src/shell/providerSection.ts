import Gio from 'gi://Gio';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { formatLastRefresh, formatMoney, formatResetCountdown } from '../lib/format.js';
import type { UsageSnapshot } from '../lib/model.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { attachProviderStIcon } from './providerIconView.js';

export interface ResetLabel {
    label: St.Label;
    resetsAt?: number;
    refreshedAt?: number;
    kind: 'reset' | 'refresh';
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

    for (const quota of snapshot.quotas) {
        const percent = quota.remainingPercent === undefined
            ? 'Unavailable'
            : `${quota.label}: ${Math.round(quota.remainingPercent)}% remaining`;
        box.add_child(new St.Label({ text: percent }));
        if (quota.remainingPercent !== undefined) {
            const track = new St.Widget({ style_class: 'quota-track' });
            const fill = new St.Widget({ style_class: 'quota-fill' });
            const width = Math.round(160 * quota.remainingPercent / 100);
            fill.style = `width: ${width}px;`;
            track.add_child(fill);
            box.add_child(track);
        }
        const reset = new St.Label({ style_class: 'genai-usage-muted' });
        reset.text = resetText(quota.resetsAt, nowMs);
        box.add_child(reset);
        resets.push({ label: reset, resetsAt: quota.resetsAt, kind: 'reset' });
    }

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
    refreshed.text = refreshText(snapshot.refreshedAt, nowMs);
    box.add_child(refreshed);
    resets.push({ label: refreshed, refreshedAt: snapshot.refreshedAt, kind: 'refresh' });
    return resets;
}

function resetText(resetsAt: number | undefined, nowMs: number): string {
    const countdown = formatResetCountdown(resetsAt, nowMs);
    return countdown ? `Resets in ${countdown}` : 'Reset time unavailable';
}

function refreshText(refreshedAt: number | undefined, nowMs: number): string {
    const text = formatLastRefresh(refreshedAt, nowMs);
    return text ? `Updated ${text}` : 'Not updated yet';
}

export function tickResetLabels(rows: ResetLabel[], nowMs: number): void {
    for (const row of rows) {
        if (row.kind === 'reset')
            row.label.text = resetText(row.resetsAt, nowMs);
        else
            row.label.text = refreshText(row.refreshedAt, nowMs);
    }
}
