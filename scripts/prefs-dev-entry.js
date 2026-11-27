#!/usr/bin/gjs -m
/**
 * Launch extension prefs.js from a directory (same contract as GNOME Shell’s
 * ExtensionPrefsDialog). Used by `bun run dev:prefs` — not installed with the extension.
 */
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import System from 'system';

const GRESOURCE_PATH = GLib.getenv('GENAI_SHELL_EXTENSIONS_GRESOURCE')
    ?? '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
const gresourceFile = Gio.File.new_for_path(GRESOURCE_PATH);
if (!gresourceFile.query_exists(null)) {
    console.error(`Missing GNOME Shell extensions gresource: ${GRESOURCE_PATH}`);
    console.error('Set GENAI_SHELL_EXTENSIONS_GRESOURCE if gnome-shell is installed elsewhere.');
    System.exit(1);
}
Gio.resources_register(Gio.Resource.load(GRESOURCE_PATH));

const [extensionPath, screenshotDir] = ARGV;
if (!extensionPath) {
    console.error('Usage: gjs -m prefs-dev-entry.js /path/to/extension-dir [screenshot-dir]');
    System.exit(1);
}

const dir = Gio.File.new_for_path(extensionPath);
const [ok, bytes] = dir.get_child('metadata.json').load_contents(null);
if (!ok)
    throw new Error(`Could not read metadata.json under ${extensionPath}`);

const metadata = JSON.parse(new TextDecoder().decode(bytes));
const path = dir.get_path();

Adw.init();
if (screenshotDir)
    Gtk.Settings.get_default().gtk_enable_animations = false;

function waitForPaint(window) {
    return new Promise(resolve => {
        const clock = window.get_frame_clock();
        const handler = clock.connect('after-paint', () => {
            clock.disconnect(handler);
            resolve();
        });
        window.queue_draw();
    });
}

async function capturePages(window, directory) {
    let clipped = false;
    // Register the X11 surface methods before looking up the window ID.
    await import('gi://GdkX11');
    const windowId = String(window.get_surface().get_xid());
    for (const name of ['general', 'services', 'log']) {
        window.set_visible_page_name(name);
        await waitForPaint(window);
        // Width changes from the first allocation take effect on the following frame.
        await waitForPaint(window);

        const output = GLib.build_filenamev([directory, name + '.png']);
        const capture = Gio.Subprocess.new(
            ['import', '-window', windowId, output],
            Gio.SubprocessFlags.NONE,
        );
        capture.wait_check(null);

        const page = window.get_visible_page();
        const scroller = page.get_first_child();
        if (page.name !== name || scroller.get_height() < page.get_height() / 2) {
            console.error('Preferences content is clipped on ' + name);
            clipped = true;
        }
    }
    if (clipped)
        throw new Error('One or more Preferences tabs failed the layout check');
}

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
        await prefsObj.fillPreferencesWindow(window);
        window.present();
        if (screenshotDir) {
            await capturePages(window, screenshotDir);
            window.close();
        }
    })().catch(e => {
        logError(e);
        System.exit(1);
    });
});

app.run(null);
