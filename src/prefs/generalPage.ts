import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { REFRESH_CHOICES, type ExtensionSettings } from '../gjs/settings.js';
import { appendLog } from '../gjs/log.js';
import { clearIconCache } from '../gjs/iconCache.js';
import { prepareComboRow, refreshComboRowSubtitle } from './comboRow.js';
import { TopBarEditor } from './topBarEditor.js';

export function createGeneralPage(settings: ExtensionSettings): { page: Adw.PreferencesPage; reload: () => void } {
    const page = new Adw.PreferencesPage({
        title: 'General',
        icon_name: 'preferences-system-symbolic',
    });

    const layoutGroup = new Adw.PreferencesGroup({
        title: 'Top bar',
        description: 'The preview matches the panel layout and uses the same usage data as the top bar when GNOME Shell is running. Drag providers horizontally to reorder them. Enable or disable each provider in the Services tab.',
    });
    const showNames = new Adw.SwitchRow({
        title: 'Show service names',
        subtitle: 'When off, the top bar shows only icons and percentages.',
    });
    settings.main.bind('show-provider-names', showNames, 'active', Gio.SettingsBindFlags.DEFAULT);
    layoutGroup.add(showNames);
    const editor = new TopBarEditor(settings);
    layoutGroup.add(editor.widget);
    page.add(layoutGroup);

    const refreshGroup = new Adw.PreferencesGroup({ title: 'Refresh' });
    const auto = new Adw.SwitchRow({ title: 'Automatic refresh' });
    settings.main.bind('auto-refresh', auto, 'active', Gio.SettingsBindFlags.DEFAULT);
    refreshGroup.add(auto);

    const interval = new Adw.ComboRow({ title: 'Refresh interval' });
    prepareComboRow(interval);
    const intervalModel = new Gtk.StringList();
    for (const minutes of REFRESH_CHOICES)
        intervalModel.append(minutes === 1 ? '1 minute' : `${minutes} minutes`);
    interval.model = intervalModel;
    let updatingInterval = false;
    const syncInterval = () => {
        updatingInterval = true;
        const index = REFRESH_CHOICES.indexOf(settings.refreshInterval as typeof REFRESH_CHOICES[number]);
        interval.selected = index >= 0 ? index : 1;
        refreshComboRowSubtitle(interval);
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

    const logGroup = new Adw.PreferencesGroup({
        title: 'Log',
        description: 'Controls what is stored in the Log tab. Lower levels are dropped as they happen; raising the level does not remove lines already stored.',
    });
    const logLevel = comboRow('Minimum log level', [
        ['debug', 'Debug (all)'],
        ['info', 'Info'],
        ['warn', 'Warning'],
        ['error', 'Error'],
    ]);
    let updatingLogLevel = false;
    const syncLogLevel = () => {
        updatingLogLevel = true;
        selectChoice(logLevel.row, logLevel.ids, settings.logLevel);
        updatingLogLevel = false;
    };
    logLevel.row.connect('notify::selected', () => {
        if (updatingLogLevel)
            return;
        const value = logLevel.ids[logLevel.row.selected];
        if (value && value !== settings.logLevel)
            settings.main.set_string('log-level', value);
    });
    logGroup.add(logLevel.row);
    page.add(logGroup);

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
        description: 'Icons are downloaded over HTTPS and cached on this computer (up to four attempts with backoff). ChatGPT tries chatgpt.com first, then a Wikimedia SVG if the official URL is blocked. Cursor uses cursor.com. Nothing is shown until a download succeeds.',
    });
    const webIcons = new Adw.SwitchRow({ title: 'Download provider icons' });
    settings.main.bind('use-web-icons', webIcons, 'active', Gio.SettingsBindFlags.DEFAULT);
    iconGroup.add(webIcons);
    const clearRow = new Adw.ActionRow({ title: 'Icon cache' });
    const clearButton = new Gtk.Button({ label: 'Clear', valign: Gtk.Align.CENTER });
    clearButton.connect('clicked', () => {
        appendLog('info', 'Icon cache clear clicked.', 'user');
        clearIconCache(settings.main);
    });
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
    resetButton.connect('clicked', () => {
        appendLog('info', 'Reset all settings clicked.', 'user');
        settings.resetAll();
    });
    resetRow.add_suffix(resetButton);
    resetGroup.add(resetRow);
    resetGroup.margin_bottom = 24;
    page.add(resetGroup);

    return {
        page,
        reload: () => {
            editor.reload();
            syncInterval();
            syncLogLevel();
            syncDisplay();
        },
    };
}

function comboRow(title: string, choices: [string, string][]): { row: Adw.ComboRow; ids: string[] } {
    const row = new Adw.ComboRow({ title });
    prepareComboRow(row);
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
    refreshComboRowSubtitle(row);
}
