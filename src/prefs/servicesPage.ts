import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { catalogEntry, PROVIDER_CATALOG, type ProviderCatalogEntry, type QuotaMode } from '../lib/providers/catalog.js';
import { discoverCursorQuotas } from '../gjs/providers/cursor.js';
import { quotaModesFromQuotas } from '../lib/providers/cursor/normalize.js';
import { shellSnapshotsAvailable, snapshotsFromShell, subscribeShellSnapshots } from '../gjs/usageDBusClient.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { attachProviderGtkImage } from './providerIconView.js';
import { newServicesTab } from './preferencesTab.js';
import { createUnofficialSourceSwitch } from './unofficialSource.js';

interface ProviderColumn {
    entry: ProviderCatalogEntry;
    reload: () => void;
    cell: {
        enabled: Gtk.Switch;
        executable: Gtk.Entry;
        quota: Gtk.DropDown;
        showPlan: Gtk.Switch;
        showBilling: Gtk.Switch;
        iconUrl: Gtk.Entry;
        unofficial: Gtk.Switch | null;
    };
}

export function createServicesPage(settings: ExtensionSettings): { page: Adw.PreferencesPage; reload: () => void; destroy: () => void } {
    const page = newServicesTab();
    const cancellable = new Gio.Cancellable();
    const columns = PROVIDER_CATALOG.map(entry => buildProviderColumn(entry, settings, cancellable));
    const group = new Adw.PreferencesGroup({
        description:
            'Rows are settings; columns are providers. Cursor quota details from cursor.com need the unofficial source.',
    });
    group.add(buildServicesMatrix(columns, settings, cancellable));
    group.margin_bottom = 24;
    page.add(group);
    const unsubscribe = subscribeShellSnapshots(() => {
        for (const column of columns) {
            if (column.entry.dynamicQuotas)
                column.reload();
        }
    });

    return {
        page,
        destroy: () => {
            unsubscribe();
            cancellable.cancel();
        },
        reload: () => {
            if (cancellable.is_cancelled())
                return;
            for (const column of columns)
                column.reload();
        },
    };
}

function buildProviderColumn(
    entry: ProviderCatalogEntry,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
): ProviderColumn {
    const provider = settings.provider(entry.id);
    const modes: QuotaMode[] = [...(entry.staticQuotaModes ?? [])];
    let updatingQuota = false;

    const enabled = new Gtk.Switch({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    provider.bind('enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);

    const executable = new Gtk.Entry({
        hexpand: true,
        placeholder_text: entry.executableNames[0] ?? 'Executable path',
    });
    if (entry.executableNames.length > 0)
        provider.bind('executable-path', executable, 'text', Gio.SettingsBindFlags.DEFAULT);

    let quotaModel = new Gtk.StringList();
    const quota = Gtk.DropDown.new(quotaModel, null);
    quota.hexpand = true;
    quota.halign = Gtk.Align.FILL;

    const applyModes = (next: QuotaMode[]) => {
        updatingQuota = true;
        modes.splice(0, modes.length, ...next);
        const model = new Gtk.StringList();
        if (modes.length === 0)
            model.append(entry.showsCreditBalance ? 'Available credits' : 'No quota reported');
        else {
            for (const mode of modes)
                model.append(mode.label);
        }
        quota.model = model;
        quotaModel = model;
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

    let discoveringQuotas = false;
    const syncDynamicQuotaModes = () => {
        if (!entry.dynamicQuotas)
            return;
        if (!settings.allowUnofficial(entry.id)) {
            applyModes([]);
            return;
        }
        if (shellSnapshotsAvailable()) {
            const snapshot = snapshotsFromShell().get(entry.id);
            if (snapshot) {
                const fromSnapshot = quotaModesFromQuotas(snapshot.quotas);
                if (fromSnapshot.length > 0)
                    applyModes(fromSnapshot);
            }
            return;
        }
        if (discoveringQuotas)
            return;
        discoveringQuotas = true;
        void discoverCursorQuotas({
            allowUnofficial: true,
            cancellable,
        }).then(found => {
            if (!cancellable.is_cancelled() && settings.allowUnofficial(entry.id))
                applyModes(found);
        }).catch(() => {
            if (!cancellable.is_cancelled())
                applyModes([]);
        }).finally(() => { discoveringQuotas = false; });
    };

    const showPlan = new Gtk.Switch({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    provider.bind('show-plan', showPlan, 'active', Gio.SettingsBindFlags.DEFAULT);

    const showBilling = new Gtk.Switch({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    provider.bind('show-billing', showBilling, 'active', Gio.SettingsBindFlags.DEFAULT);

    const iconUrl = new Gtk.Entry({
        hexpand: true,
        placeholder_text: 'HTTPS icon URL (optional)',
    });
    iconUrl.set_tooltip_text(
        'HTTPS image URL. Leave empty to use the default provider icon.',
    );
    provider.bind('icon-url', iconUrl, 'text', Gio.SettingsBindFlags.DEFAULT);

    const unofficial = entry.supportsUnofficial
        ? createUnofficialSourceSwitch(entry, provider, applyModes, cancellable)
        : null;

    if (entry.dynamicQuotas)
        syncDynamicQuotaModes();

    const reload = () => {
        unofficial?.reload();
        if (!entry.dynamicQuotas) {
            applyModes([...(catalogEntry(entry.id)?.staticQuotaModes ?? [])]);
            return;
        }
        syncDynamicQuotaModes();
    };

    return {
        entry,
        reload,
        cell: {
            enabled,
            executable,
            quota,
            showPlan,
            showBilling,
            iconUrl,
            unofficial: unofficial?.widget ?? null,
        },
    };
}

function buildServicesMatrix(
    columns: ProviderColumn[],
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
): Gtk.Grid {
    const grid = new Gtk.Grid({
        column_spacing: 20,
        row_spacing: 14,
        margin_top: 8,
        margin_bottom: 4,
        margin_start: 4,
        margin_end: 4,
    });
    grid.add_css_class('genai-services-matrix');

    grid.attach(matrixCornerLabel(), 0, 0, 1, 1);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++)
        grid.attach(
            buildColumnHeader(columns[columnIndex]!.entry, settings, cancellable),
            columnIndex + 1,
            0,
            1,
            1,
        );

    const rows: {
        label: string;
        tooltip?: string;
        cell: (column: ProviderColumn) => Gtk.Widget;
    }[] = [
        {
            label: 'Show in top bar',
            tooltip: 'Off hides this provider from the panel and the General preview.',
            cell: column => centerSwitch(column.cell.enabled),
        },
        {
            label: 'Executable',
            cell: column => column.entry.executableNames.length > 0 ? column.cell.executable : matrixNaCell(),
        },
        {
            label: 'Top bar quota',
            tooltip: 'Cursor choices fill in after you allow the unofficial source and Shell refreshes.',
            cell: column => column.cell.quota,
        },
        {
            label: 'Show subscription plan',
            cell: column => centerSwitch(column.cell.showPlan),
        },
        {
            label: 'Show billing',
            cell: column => centerSwitch(column.cell.showBilling),
        },
        {
            label: 'Icon URL',
            cell: column => column.cell.iconUrl,
        },
        {
            label: 'Allow unofficial usage source',
            tooltip: 'Allows Cursor and Jev to read usage from their web consoles.',
            cell: column => column.cell.unofficial
                ? centerSwitch(column.cell.unofficial)
                : matrixNaCell(),
        },
    ];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]!;
        grid.attach(matrixRowLabel(row.label, row.tooltip), 0, rowIndex + 1, 1, 1);
        for (let columnIndex = 0; columnIndex < columns.length; columnIndex++)
            grid.attach(row.cell(columns[columnIndex]!), columnIndex + 1, rowIndex + 1, 1, 1);
    }

    return grid;
}

function matrixCornerLabel(): Gtk.Widget {
    const label = new Gtk.Label({ label: 'Setting', xalign: 0 });
    label.add_css_class('heading');
    return label;
}

function matrixRowLabel(text: string, tooltip?: string): Gtk.Widget {
    const label = new Gtk.Label({
        label: text,
        xalign: 0,
        yalign: Gtk.Align.CENTER,
        wrap: true,
        max_width_chars: 16,
    });
    label.add_css_class('genai-services-matrix-row-label');
    if (tooltip)
        label.set_tooltip_text(tooltip);
    return label;
}

function matrixNaCell(): Gtk.Widget {
    const label = new Gtk.Label({ label: '—', xalign: Gtk.Align.CENTER, opacity: 0.5 });
    label.add_css_class('genai-services-matrix-na');
    return label;
}

function centerSwitch(sw: Gtk.Switch): Gtk.Widget {
    const box = new Gtk.Box({ halign: Gtk.Align.CENTER });
    box.append(sw);
    return box;
}

function buildColumnHeader(
    entry: ProviderCatalogEntry,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
): Gtk.Widget {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        hexpand: true,
        halign: Gtk.Align.FILL,
    });
    box.add_css_class('genai-services-matrix-header');

    const titleRow = new Gtk.Box({ spacing: 8, halign: Gtk.Align.CENTER });
    const iconBox = new Gtk.Box();
    attachProviderGtkImage(iconBox, entry.id, settings, cancellable);
    titleRow.append(iconBox);
    const title = new Gtk.Label({ label: entry.displayName });
    title.add_css_class('heading');
    titleRow.append(title);
    box.append(titleRow);

    const note = columnHeaderNote(entry);
    if (note) {
        const subtitle = new Gtk.Label({
            label: note,
            wrap: true,
            xalign: 0.5,
            justify: Gtk.Justification.CENTER,
            max_width_chars: 28,
        });
        subtitle.add_css_class('dim-label');
        subtitle.add_css_class('genai-services-matrix-header-note');
        box.append(subtitle);
    }
    return box;
}

function columnHeaderNote(entry: ProviderCatalogEntry): string | undefined {
    if (entry.id === 'jev')
        return 'Uses a TypeSafe console session to read available credits.';
    if (entry.supportsUnofficial)
        return 'Quota details from cursor.com are off until you allow the unofficial source.';
    if (entry.id === 'chatgpt')
        return 'Uses the official Codex app-server and the existing Codex login.';
    return undefined;
}
