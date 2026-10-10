import Adw from 'gi://Adw';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { ExtensionSettings } from './gjs/settings.js';
import { createGeneralPage } from './prefs/generalPage.js';
import { createServicesPage } from './prefs/servicesPage.js';

export default class GenaiUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: Adw.PreferencesWindow): void {
        const settings = new ExtensionSettings(this.dir);
        const general = createGeneralPage(settings);
        const services = createServicesPage(settings);
        window.add(general.page);
        window.add(services.page);
        settings.watch(() => {
            general.reload();
            services.reload();
        });
        window.connect('close-request', () => {
            settings.destroy();
            return false;
        });
    }
}
