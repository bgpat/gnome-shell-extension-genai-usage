#!/usr/bin/gjs -m
/**
 * Launch extension prefs.js from a directory (same contract as GNOME Shell’s
 * ExtensionPrefsDialog). Used by `bun run dev:prefs` — not installed with the extension.
 */
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const GRESOURCE_PATH = GLib.getenv('GENAI_SHELL_EXTENSIONS_GRESOURCE')
    ?? '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
const gresourceFile = Gio.File.new_for_path(GRESOURCE_PATH);
if (!gresourceFile.query_exists(null)) {
    console.error(`Missing GNOME Shell extensions gresource: ${GRESOURCE_PATH}`);
    console.error('Set GENAI_SHELL_EXTENSIONS_GRESOURCE if gnome-shell is installed elsewhere.');
    GLib.exit(1);
}
Gio.resources_register(Gio.Resource.load(GRESOURCE_PATH));

const extensionPath = ARGV[0];
if (!extensionPath) {
    console.error('Usage: gjs -m prefs-dev-entry.js /path/to/extension-dir');
    GLib.exit(1);
}

const dir = Gio.File.new_for_path(extensionPath);
const [ok, bytes] = dir.get_child('metadata.json').load_contents(null);
if (!ok)
    throw new Error(`Could not read metadata.json under ${extensionPath}`);

const metadata = JSON.parse(new TextDecoder().decode(bytes));
const path = dir.get_path();

Adw.init();

const app = new Adw.Application({
    application_id: 'io.github.bgpat.GenaiUsage.PrefsDev',
});

let started = false;

app.connect('activate', () => {
    if (started)
        return;
    started = true;
    app.hold();
    void (async () => {
        const prefsModule = await import(dir.get_child('prefs.js').get_uri());
        const window = new Adw.PreferencesWindow({
            title: metadata.name,
            search_enabled: false,
        });
        app.add_window(window);
        window.connect('close-request', () => {
            app.release();
            app.quit();
            return false;
        });
        const prefsObj = new prefsModule.default({ ...metadata, dir, path });
        prefsObj.fillPreferencesWindow(window);
        window.present();
    })().catch(e => {
        logError(e);
        app.release();
        app.quit();
    });
});

app.run(null);
