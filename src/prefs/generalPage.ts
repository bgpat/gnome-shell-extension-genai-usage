import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { REFRESH_CHOICES, type ExtensionSettings } from '../gjs/settings.js';
import { clearIconCache } from '../gjs/iconCache.js';
import { TopBarEditor } from './topBarEditor.js';

export function createGeneralPage(settings: ExtensionSettings): { page: Adw.PreferencesPage; reload: () => void } {
    const page = new Adw.PreferencesPage({
        title: 'General',
        icon_name: 'preferences-system-symbolic',
    });

    const layoutGroup = new Adw.PreferencesGroup({
        title: 'Top bar',
        description: 'Drag providers between the lists, or use the buttons and Ctrl+arrow keys. Only enabled providers are shown. Percentages appear in the real top bar after a refresh.',
    });
    const editor = new TopBarEditor(settings);
    layoutGroup.add(editor.widget);
    page.add(layoutGroup);

    const refreshGroup = new Adw.PreferencesGroup({ title: 'Refresh' });
    const auto = new Adw.SwitchRow({ title: 'Automatic refresh' });
    settings.main.bind('auto-refresh', auto, 'active', Gio.SettingsBindFlags.DEFAULT);
    refreshGroup.add(auto);

    const interval = new Adw.ComboRow({ title: 'Refresh interval' });
    const intervalModel = new Gtk.StringList();
    for (const minutes of REFRESH_CHOICES)
        intervalModel.append(minutes === 1 ? '1 minute' : `${minutes} minutes`);
    interval.model = intervalModel;
    let updatingInterval = false;
    const syncInterval = () => {
        updatingInterval = true;
        const index = REFRESH_CHOICES.indexOf(settings.refreshInterval as typeof REFRESH_CHOICES[number]);
        interval.selected = index >= 0 ? index : 1;
        interval.sensitive = settings.autoRefresh;
        updatingInterval = false;
    };
    interval.connect('notify::selected', () => {
        if (updatingInterval)
            return;
        const minutes = REFRESH_CHOICES[interval.selected];
        if (minutes !== undefined && minutes !== settings.refreshInterval)
            settings.refreshInterval = minutes;
    });
    refreshGroup.add(interval);
    page.add(refreshGroup);

    const displayGroup = new Adw.PreferencesGroup({ title: 'When data is missing' });
    const unavailable = comboRow('Top bar without quota', [
        ['hide', 'Hide the provider'],
        ['placeholder', 'Show an em dash'],
        ['icon-only', 'Show only the icon'],
    ]);
    const cached = comboRow('After a failed refresh', [
        ['show', 'Keep the last result'],
        ['hide', 'Show the provider as unavailable'],
    ]);
    let updatingDisplay = false;
    const syncDisplay = () => {
        updatingDisplay = true;
        selectChoice(unavailable.row, unavailable.ids, settings.unavailableDisplay);
        selectChoice(cached.row, cached.ids, settings.cachedData);
        updatingDisplay = false;
    };
    unavailable.row.connect('notify::selected', () => {
        if (updatingDisplay)
            return;
        const value = unavailable.ids[unavailable.row.selected];
        if (value && value !== settings.unavailableDisplay)
            settings.main.set_string('unavailable-display', value);
    });
    cached.row.connect('notify::selected', () => {
        if (updatingDisplay)
            return;
        const value = cached.ids[cached.row.selected];
        if (value && value !== settings.cachedData)
            settings.main.set_string('cached-data', value);
    });
    displayGroup.add(unavailable.row);
    displayGroup.add(cached.row);
    page.add(displayGroup);

    const iconGroup = new Adw.PreferencesGroup({
        title: 'Icons',
        description: 'Icons are downloaded over HTTPS and cached on this computer. Theme icons and bundled shapes are used when a download fails.',
    });
    const webIcons = new Adw.SwitchRow({ title: 'Download provider icons' });
    settings.main.bind('use-web-icons', webIcons, 'active', Gio.SettingsBindFlags.DEFAULT);
    iconGroup.add(webIcons);
    const clearRow = new Adw.ActionRow({ title: 'Icon cache' });
    const clearButton = new Gtk.Button({ label: 'Clear', valign: Gtk.Align.CENTER });
    clearButton.connect('clicked', () => clearIconCache());
    clearRow.add_suffix(clearButton);
    iconGroup.add(clearRow);
    page.add(iconGroup);

    const resetGroup = new Adw.PreferencesGroup({ title: 'Defaults' });
    const resetRow = new Adw.ActionRow({ title: 'Reset all settings' });
    const resetButton = new Gtk.Button({
        label: 'Reset',
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action'],
    });
    resetButton.connect('clicked', () => settings.resetAll());
    resetRow.add_suffix(resetButton);
    resetGroup.add(resetRow);
    page.add(resetGroup);

    return {
        page,
        reload: () => {
            editor.reload();
            syncInterval();
            syncDisplay();
        },
    };
}

function comboRow(title: string, choices: [string, string][]): { row: Adw.ComboRow; ids: string[] } {
    const row = new Adw.ComboRow({ title });
    const model = new Gtk.StringList();
    for (const [, label] of choices)
        model.append(label);
    row.model = model;
    return { row, ids: choices.map(([id]) => id) };
}

function selectChoice(row: Adw.ComboRow, ids: string[], value: string): void {
    const index = ids.indexOf(value);
    if (index >= 0 && row.selected !== index)
        row.selected = index;
}
