import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { catalogEntry, PROVIDER_CATALOG, type QuotaMode } from '../lib/providers/catalog.js';
import { discoverCursorQuotas } from '../gjs/providers/cursor.js';
import { refreshProvider } from '../gjs/providers/registry.js';
import type { ExtensionSettings } from '../gjs/settings.js';

export function createServicesPage(settings: ExtensionSettings): { page: Adw.PreferencesPage; reload: () => void } {
    const page = new Adw.PreferencesPage({
        title: 'Services',
        icon_name: 'applications-system-symbolic',
    });
    const cancellable = new Gio.Cancellable();
    const reloaders: (() => void)[] = [];

    for (const entry of PROVIDER_CATALOG) {
        const group = new Adw.PreferencesGroup({
            title: entry.displayName,
            description: entry.supportsUnofficial
                ? 'Quota details from cursor.com are off until you allow the unofficial source.'
                : 'Uses the official Codex app-server and the existing Codex login.',
        });
        const provider = settings.provider(entry.id);

        const enabled = new Adw.SwitchRow({ title: 'Enabled' });
        provider.bind('enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(enabled);

        const executable = new Adw.EntryRow({
            title: 'Executable',
            show_apply_button: true,
        });
        provider.bind('executable-path', executable, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(executable);

        const auth = new Adw.ActionRow({ title: 'Authentication', subtitle: 'Not checked' });
        const check = new Gtk.Button({ label: 'Check', valign: Gtk.Align.CENTER });
        check.connect('clicked', () => {
            auth.subtitle = 'Checking…';
            void refreshProvider(entry.id, settings, cancellable).then(snapshot => {
                if (cancellable.is_cancelled())
                    return;
                auth.subtitle = snapshot.availability.state === 'unavailable'
                    ? snapshot.availability.reason
                    : snapshot.plan ? `Available · ${snapshot.plan}` : 'Available';
            }).catch(() => {
                if (!cancellable.is_cancelled())
                    auth.subtitle = 'Check failed';
            });
        });
        auth.add_suffix(check);
        group.add(auth);

        const quota = new Adw.ComboRow({ title: 'Top bar quota' });
        const modes: QuotaMode[] = [...(entry.staticQuotaModes ?? [])];
        let updatingQuota = false;
        const applyModes = (next: QuotaMode[]) => {
            updatingQuota = true;
            modes.splice(0, modes.length, ...next);
            const model = new Gtk.StringList();
            if (modes.length === 0)
                model.append('No quota reported');
            else {
                for (const mode of modes)
                    model.append(mode.label);
            }
            quota.model = model;
            quota.sensitive = modes.length > 0;
            const current = settings.topBarQuota(entry.id);
            const index = modes.findIndex(mode => mode.id === current);
            quota.selected = index >= 0 ? index : 0;
            updatingQuota = false;
        };
        applyModes(modes);
        quota.connect('notify::selected', () => {
            if (updatingQuota)
                return;
            const mode = modes[quota.selected];
            if (!mode)
                return;
            if (mode.id !== settings.topBarQuota(entry.id))
                settings.setTopBarQuota(entry.id, mode.id);
        });
        group.add(quota);

        if (entry.dynamicQuotas) {
            const load = new Adw.ActionRow({
                title: 'Quota choices',
                subtitle: 'Shown after a successful unofficial refresh',
            });
            const loadButton = new Gtk.Button({ label: 'Load', valign: Gtk.Align.CENTER });
            loadButton.connect('clicked', () => {
                load.subtitle = 'Loading…';
                void discoverCursorQuotas({
                    allowUnofficial: settings.allowUnofficial(entry.id),
                    cancellable,
                }).then(found => {
                    if (cancellable.is_cancelled())
                        return;
                    if (!settings.allowUnofficial(entry.id)) {
                        applyModes([]);
                        load.subtitle = 'Turn on the unofficial source to load quotas';
                        return;
                    }
                    applyModes(found);
                    load.subtitle = found.length > 0
                        ? 'Loaded from the latest Cursor response'
                        : 'Cursor did not report any quota percentages';
                }).catch(() => {
                    if (!cancellable.is_cancelled())
                        load.subtitle = 'Could not load Cursor quotas';
                });
            });
            load.add_suffix(loadButton);
            group.add(load);
        }

        const showPlan = new Adw.SwitchRow({ title: 'Show subscription plan' });
        provider.bind('show-plan', showPlan, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showPlan);

        const showBilling = new Adw.SwitchRow({ title: 'Show billing' });
        provider.bind('show-billing', showBilling, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showBilling);

        const iconUrl = new Adw.EntryRow({
            title: 'Icon URL',
            show_apply_button: true,
        });
        provider.bind('icon-url', iconUrl, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(iconUrl);

        if (entry.supportsUnofficial) {
            const unofficial = new Adw.SwitchRow({
                title: 'Allow unofficial usage source',
                subtitle: 'Reads the local Cursor session and requests cursor.com/api/usage-summary. This is not an official Cursor CLI feature.',
            });
            provider.bind('allow-unofficial-sources', unofficial, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(unofficial);
        }

        page.add(group);
        reloaders.push(() => {
            if (!entry.dynamicQuotas)
                applyModes([...(catalogEntry(entry.id)?.staticQuotaModes ?? [])]);
        });
    }

    return {
        page,
        reload: () => {
            if (cancellable.is_cancelled())
                return;
            for (const reload of reloaders)
                reload();
        },
    };
}
