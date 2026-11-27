import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { appendLog, initLogForPreferences, syncMinLogLevelFromSettings, teardownLogPreferences } from './gjs/log.js';
import { ExtensionSettings } from './gjs/settings.js';
import { createGeneralPage } from './prefs/generalPage.js';
import { createLogPage } from './prefs/logPage.js';
import { createServicesPage } from './prefs/servicesPage.js';

/** Horizontal inset for page content inside the preferences window. */
const PREFERENCES_PAGE_MARGIN = 24;

export default class GenaiUsagePreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        loadPrefsStyles(this.dir, window);
        window.add_css_class('genai-prefs-window');
        window.set_default_size(720, 620);
        window.set_size_request(400, 340);
        window.resizable = true;

        initLogForPreferences();
        const settings = new ExtensionSettings(this.dir);
        syncMinLogLevelFromSettings(settings);
        appendLog('info', 'Preferences window opened.', 'user');
        const general = createGeneralPage(settings);
        const services = createServicesPage(settings);
        const log = createLogPage();
        const pages = [general.page, services.page, log.page];
        for (const page of pages)
            tunePreferencesPage(page);
        window.add(general.page);
        window.add(services.page);
        window.add(log.page);
        bindPreferencesWidth(window, pages);
        settings.watch(() => {
            syncMinLogLevelFromSettings(settings);
            general.reload();
            services.reload();
        }, 'prefs');
        window.connect('close-request', () => {
            appendLog('info', 'Preferences window closed.', 'user');
            settings.destroy();
            teardownLogPreferences();
            return false;
        });
    }
}

/** Let the page fill the window and scroll when content is taller than the viewport. */
function tunePreferencesPage(page: Adw.PreferencesPage): void {
    page.vexpand = true;
    const tune = () => {
        tuneScrolledWindows(page);
    };
    page.connect('map', tune);
    tune();
}

/** Keep each page's Adw.Clamp in sync with the window width (default clamp caps at 600px). */
function bindPreferencesWidth(window: Gtk.Window, pages: Adw.PreferencesPage[]): void {
    const sync = () => {
        const width = window.get_allocated_width();
        if (width <= 0)
            return;
        const contentWidth = Math.max(320, width - PREFERENCES_PAGE_MARGIN * 2);
        for (const page of pages)
            applyClampWidth(page, contentWidth);
    };
    window.connect('notify::width', sync);
    window.connect('notify::default-width', sync);
    for (const page of pages)
        page.connect('map', sync);
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        sync();
        return GLib.SOURCE_REMOVE;
    });
}

function applyClampWidth(root: Gtk.Widget, width: number): void {
    if (root instanceof Adw.Clamp) {
        root.maximum_size = width;
        root.tightening_threshold = width;
    }
    for (let child = root.get_first_child(); child; child = child.get_next_sibling())
        applyClampWidth(child, width);
}

/** Only the page viewport scroll — not ComboRow popovers or nested log view. */
function tuneScrolledWindows(page: Adw.PreferencesPage): void {
    const scroll = page.get_first_child();
    if (scroll instanceof Gtk.ScrolledWindow) {
        scroll.propagate_natural_height = false;
        scroll.propagate_natural_width = false;
    }
}

function loadPrefsStyles(dir: Gio.File, window: Gtk.Window): void {
    const path = dir.get_child('stylesheet.css').get_path();
    if (!path)
        return;
    const provider = new Gtk.CssProvider();
    provider.load_from_path(path);
    Gtk.StyleContext.add_provider_for_display(
        window.get_display(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}
