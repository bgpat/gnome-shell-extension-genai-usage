import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { appendLog, initLogForPreferences, syncMinLogLevelFromSettings, teardownLogPreferences } from './gjs/log.js';
import { ExtensionSettings } from './gjs/settings.js';
import { createGeneralPage } from './prefs/generalPage.js';
import { createLogPage } from './prefs/logPage.js';
import { createServicesPage } from './prefs/servicesPage.js';

export default class GenaiUsagePreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        loadPrefsStyles(this.dir, window);
        window.add_css_class('genai-prefs-window');
        window.set_default_size(780, 620);
        window.set_size_request(400, 340);
        window.resizable = true;

        initLogForPreferences();
        const settings = new ExtensionSettings(this.dir);
        syncMinLogLevelFromSettings(settings);
        appendLog('info', 'Preferences window opened.', 'user');
        const general = createGeneralPage(settings);
        const services = createServicesPage(settings);
        const log = createLogPage();
        window.add(general.page);
        window.add(services.page);
        window.add(log.page);
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
