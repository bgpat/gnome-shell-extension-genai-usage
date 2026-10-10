import Gio from 'gi://Gio';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { barEntries } from '../lib/presentation.js';
import { effectiveIconUrl } from '../lib/icons.js';
import { visibleIds } from '../lib/layout.js';
import { catalogEntry } from '../lib/providers/catalog.js';
import { cachedIconFile } from '../gjs/iconCache.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { Countdown } from './countdown.js';
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

    constructor(
        private readonly host: Host,
        private readonly settings: ExtensionSettings,
        private readonly scheduler: RefreshScheduler,
    ) {
        this.button = new PanelMenu.Button(0.5, 'GenAI Usage', false);
        this.box = new St.BoxLayout({ style_class: 'genai-usage-panel' });
        this.button.add_child(this.box);
        this.countdown = new Countdown(() => tickResetLabels(this.resetLabels, Date.now()));
        this.menuHandler = this.menu.connect('open-state-changed', (...args: unknown[]) => {
            if (args[1])
                this.countdown.start();
            else
                this.countdown.stop();
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
        );
        this.box.remove_all_children();
        this.icons = new Map();
        if (entries.length === 0) {
            const icon = new St.Icon({ icon_size: 16, style_class: 'system-status-icon' });
            this.setGicon(icon, this.fallbackIcon('generic-symbolic.svg'));
            this.box.add_child(icon);
        }
        for (const entry of entries) {
            const item = new St.BoxLayout({ style_class: 'genai-usage-item' });
            const icon = new St.Icon({ icon_size: 16, style_class: 'system-status-icon' });
            this.applyIcon(entry.providerId, icon);
            item.add_child(icon);
            if (entry.text)
                item.add_child(new St.Label({ text: entry.text, style_class: 'genai-usage-percent' }));
            this.box.add_child(item);
            this.icons.set(entry.providerId, icon);
        }
        this.button.accessible_name = entries.length > 0
            ? entries.map(entry => entry.accessible).join(', ')
            : 'GenAI Usage';
        this.rebuildMenu(enabled);
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

    private rebuildMenu(enabled: Set<string>): void {
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
                view.snapshot,
                view.error,
                this.settings.showPlan(id),
                this.settings.showBilling(id),
                now,
            );
            this.resetLabels.push(...labels);
            this.menu.addMenuItem(section);
        }
        if (!first)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addAction('Refresh', () => {
            void this.scheduler.refreshAll(true);
        });
        this.addAction('Clear errors', () => this.scheduler.clearErrors());
        this.addAction('Preferences', () => this.host.openPreferences());
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

    private setGicon(icon: St.Icon, gicon: Gio.Icon): void {
        (icon as unknown as { gicon: Gio.Icon }).gicon = gicon;
    }

    private applyIcon(id: string, icon: St.Icon): void {
        const entry = catalogEntry(id);
        if (!entry) {
            this.setGicon(icon, this.fallbackIcon('generic-symbolic.svg'));
            return;
        }
        this.setGicon(icon, this.fallbackIcon(entry.fallbackIcon));
        if (this.themeHasIcon(entry.themeIconName))
            icon.icon_name = entry.themeIconName;
        const url = effectiveIconUrl(entry.defaultIconUrl, this.settings.iconUrl(id));
        if (!this.settings.useWebIcons || !url)
            return;
        void cachedIconFile(id, url, true, this.cancellable).then(file => {
            if (!file || this.cancellable.is_cancelled() || this.icons.get(id) !== icon)
                return;
            this.setGicon(icon, Gio.FileIcon.new(file) as unknown as Gio.Icon);
            icon.icon_name = '';
        }).catch(() => {
            // The fallback icon stays in place.
        });
    }

    private themeHasIcon(name: string): boolean {
        try {
            const theme = new St.IconTheme();
            return theme.has_icon(name);
        } catch {
            return false;
        }
    }

    private fallbackIcon(name: string): Gio.Icon {
        return Gio.FileIcon.new(this.host.dir.get_child('icons').get_child(name)) as unknown as Gio.Icon;
    }
}
