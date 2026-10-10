import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { visibleIds } from '../lib/layout.js';
import { deferMenuRebuildWhileOpen, menuEnabledProviderIds } from '../lib/menuPresentation.js';
import { barEntries, barItemLabel } from '../lib/presentation.js';
import { appendLog } from '../gjs/log.js';
import { runShellSafe, shellErrorText } from '../gjs/shellSafe.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { Countdown } from './countdown.js';
import { attachProviderStIcon } from './providerIconView.js';
import {
    clearQuotaBarRelayouts,
    fillProviderSection,
    relayoutOpenMenuQuotaBars,
    tickResetLabels,
    type ResetLabel,
} from './providerSection.js';
import type { RefreshScheduler } from './refreshScheduler.js';

interface Host {
    dir: Gio.File;
    openPreferences(): void;
}

export class UsageIndicator {
    readonly button: PanelMenu.Button;
    private readonly box: St.BoxLayout;
    private readonly menuHandler: number;
    private readonly countdown: Countdown;
    private readonly cancellable = new Gio.Cancellable();
    private resetLabels: ResetLabel[] = [];
    private icons = new Map<string, St.Icon>();
    private iconGeneration = 0;
    private menuIsOpen = false;
    private pendingMenuRebuild = false;

    constructor(
        private readonly host: Host,
        private readonly settings: ExtensionSettings,
        private readonly scheduler: RefreshScheduler,
    ) {
        this.button = new PanelMenu.Button(0.5, 'GenAI Usage', false);
        this.button.add_style_class_name('genai-usage-panel-button');
        this.button.clip_to_allocation = false;
        this.box = new St.BoxLayout({
            style_class: 'genai-usage-panel',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.box.clip_to_allocation = false;
        this.button.add_child(this.box);
        this.countdown = new Countdown(() => {
            runShellSafe('Menu reset labels', () => tickResetLabels(this.resetLabels, Date.now()));
        });
        this.menuHandler = this.menu.connect('open-state-changed', (...args: unknown[]) => {
            runShellSafe('Top bar menu open-state', () => {
                const isOpen = Boolean(args[1]);
                this.menuIsOpen = isOpen;
                if (isOpen) {
                    appendLog('debug', 'Top bar menu opened.', 'user');
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        runShellSafe('Menu quota bar idle relayout', () => relayoutOpenMenuQuotaBars(), 'user');
                        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                            runShellSafe('Menu quota bar idle relayout', () => relayoutOpenMenuQuotaBars(), 'user');
                            return GLib.SOURCE_REMOVE;
                        });
                        return GLib.SOURCE_REMOVE;
                    });
                    this.countdown.start();
                } else {
                    appendLog('debug', 'Top bar menu closed.', 'user');
                    this.countdown.stop();
                    if (this.pendingMenuRebuild) {
                        this.pendingMenuRebuild = false;
                        this.rebuildMenu(this.settings.enabledSet(), this.iconGeneration);
                    }
                }
            }, 'user');
        });
    }

    update(): void {
        runShellSafe('Top bar update', () => this.updateInner());
    }

    private updateInner(): void {
        const layout = this.settings.layout();
        const enabled = this.settings.enabledSet();
        const ids = visibleIds(layout, enabled);
        const entries = barEntries(
            ids,
            this.scheduler.snapshots(),
            id => this.settings.topBarQuota(id),
            this.settings.unavailableDisplay,
        );
        this.iconGeneration += 1;
        const generation = this.iconGeneration;
        this.box.remove_all_children();
        this.icons = new Map();
        for (const entry of entries) {
            const item = new St.BoxLayout({
                style_class: 'genai-usage-item',
                y_align: Clutter.ActorAlign.CENTER,
            });
            item.clip_to_allocation = false;
            attachProviderStIcon(
                item,
                0,
                entry.providerId,
                this.settings,
                this.cancellable,
                () => generation === this.iconGeneration,
                this.icons,
            );
            const label = barItemLabel(entry, this.settings.showProviderNames);
            if (label) {
                item.add_child(new St.Label({
                    text: label,
                    style_class: 'genai-usage-bar-label',
                    y_align: Clutter.ActorAlign.CENTER,
                }));
            }
            this.box.add_child(item);
        }
        this.button.accessible_name = entries.length > 0
            ? entries.map(entry => entry.accessible).join(', ')
            : 'GenAI Usage';
        appendLog(
            'debug',
            `Top bar updated (${entries.length} visible ${entries.length === 1 ? 'entry' : 'entries'}).`,
            'background',
        );
        if (deferMenuRebuildWhileOpen(this.menuIsOpen)) {
            this.pendingMenuRebuild = true;
        } else {
            this.pendingMenuRebuild = false;
            this.rebuildMenu(enabled, generation);
        }
    }

    destroy(): void {
        this.countdown.stop();
        this.cancellable.cancel();
        if (this.menuHandler)
            this.menu.disconnect(this.menuHandler);
        this.button.destroy();
        this.icons.clear();
        this.resetLabels = [];
    }

    private rebuildMenu(enabled: Set<string>, generation: number): void {
        clearQuotaBarRelayouts();
        this.menu.removeAll();
        this.resetLabels = [];
        const now = Date.now();
        let hasSections = false;
        try {
            const menuIds = menuEnabledProviderIds(this.settings.layout().order, enabled);
            let first = true;
            for (const id of menuIds) {
                try {
                    if (!first)
                        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    first = false;
                    const section = new PopupMenu.PopupMenuSection();
                    const view = this.scheduler.view(id);
                    const labels = fillProviderSection(
                        section,
                        id,
                        view.snapshot,
                        this.settings.showPlan(id),
                        this.settings.showBilling(id),
                        now,
                        this.settings,
                        this.cancellable,
                        () => generation === this.iconGeneration,
                    );
                    this.resetLabels.push(...labels);
                    this.menu.addMenuItem(section);
                } catch (error) {
                    appendLog(
                        'error',
                        `Menu section ${id} failed: ${shellErrorText(error)}`,
                        'background',
                    );
                }
            }
            hasSections = !first;
            if (hasSections)
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        } catch (error) {
            appendLog('error', `Menu rebuild failed: ${shellErrorText(error)}`, 'background');
        }
        this.addAction('Refresh', () => {
            appendLog('info', 'Top bar menu: Refresh chosen.', 'user');
            this.scheduler.refreshAllAsync(true);
        });
        this.addAction('Preferences', () => {
            appendLog('info', 'Top bar menu: Preferences chosen.', 'user');
            this.host.openPreferences();
        });
    }

    private addAction(label: string, callback: () => void): void {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', () => runShellSafe(`Menu action ${label}`, callback, 'user'));
        this.menu.addMenuItem(item);
    }

    private get menu(): {
        connect(name: string, callback: (...args: unknown[]) => number | void): number;
        disconnect(id: number): void;
        removeAll(): void;
        addMenuItem(item: unknown): void;
    } {
        return this.button.menu as unknown as {
            connect(name: string, callback: (...args: unknown[]) => number | void): number;
            disconnect(id: number): void;
            removeAll(): void;
            addMenuItem(item: unknown): void;
        };
    }
}
