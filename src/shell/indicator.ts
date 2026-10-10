import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { barEntries, barItemLabel } from '../lib/presentation.js';
import { visibleIds } from '../lib/layout.js';
import { appendLog } from '../gjs/log.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { Countdown } from './countdown.js';
import { attachProviderStIcon } from './providerIconView.js';
import { fillProviderSection, tickResetLabels, type ResetLabel } from './providerSection.js';
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
        this.countdown = new Countdown(() => tickResetLabels(this.resetLabels, Date.now()));
        this.menuHandler = this.menu.connect('open-state-changed', (...args: unknown[]) => {
            if (args[1]) {
                appendLog('debug', 'Top bar menu opened.', 'user');
                this.countdown.start();
            } else {
                appendLog('debug', 'Top bar menu closed.', 'user');
                this.countdown.stop();
            }
        });
    }

    update(): void {
        const layout = this.settings.layout();
        const enabled = this.settings.enabledSet();
        const ids = visibleIds(layout, enabled);
        const entries = barEntries(
            ids,
            this.scheduler.snapshots(),
            id => this.settings.topBarQuota(id),
            this.settings.unavailableDisplay,
            this.settings.quotaPercentMode,
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
        this.rebuildMenu(enabled, generation);
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
        this.menu.removeAll();
        this.resetLabels = [];
        const now = Date.now();
        let first = true;
        for (const id of this.settings.layout().order) {
            if (!enabled.has(id))
                continue;
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
        }
        if (!first)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addAction('Refresh', () => {
            appendLog('info', 'Top bar menu: Refresh chosen.', 'user');
            void this.scheduler.refreshAll(true);
        });
        this.addAction('Preferences', () => {
            appendLog('info', 'Top bar menu: Preferences chosen.', 'user');
            this.host.openPreferences();
        });
    }

    private addAction(label: string, callback: () => void): void {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', callback);
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
