#!/usr/bin/gjs -m
/** Print PreferencesPage and ViewSwitcherButton icon names (debug tab icons). */
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

const extensionPath = ARGV[0];
if (!extensionPath) {
    console.error('Usage: gjs -m scripts/verify-prefs-tab-icons.js /path/to/extension-dir');
    GLib.exit(1);
}

Adw.init();
const dir = Gio.File.new_for_path(extensionPath);

function walkSwitcherButtons(widget, out) {
    if (widget instanceof Adw.ViewSwitcherButton)
        out.push(widget.get_icon_name());
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        walkSwitcherButtons(child, out);
}

const app = new Adw.Application({ application_id: 'io.github.bgpat.GenaiUsage.IconCheck' });
app.connect('activate', () => {
    app.hold();
    void (async () => {
        const { createGeneralPage } = await import(dir.get_child('prefs/generalPage.js').get_uri());
        const { createServicesPage } = await import(dir.get_child('prefs/servicesPage.js').get_uri());
        const { createLogPage } = await import(dir.get_child('prefs/logPage.js').get_uri());
        const { ExtensionSettings } = await import(dir.get_child('gjs/settings.js').get_uri());

        const settings = new ExtensionSettings(dir);
        const general = createGeneralPage(settings);
        const services = createServicesPage(settings);
        const log = createLogPage();

        const win = new Adw.PreferencesWindow({ search_enabled: false });
        for (const [label, page] of [
            ['general', general.page],
            ['services', services.page],
            ['log', log.page],
        ]) {
            win.add(page);
            print(`${label}: page.icon_name=${page.get_icon_name()}`);
        }

        win.present();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            const buttons = [];
            walkSwitcherButtons(win, buttons);
            print(`switcher buttons: ${JSON.stringify(buttons)}`);
            settings.destroy();
            win.destroy();
            app.release();
            app.quit();
            return GLib.SOURCE_REMOVE;
        });
    })().catch(e => {
        logError(e);
        app.release();
        app.quit();
    });
});
app.run(null);
