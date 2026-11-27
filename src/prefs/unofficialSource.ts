import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { appendLog } from '../gjs/log.js';
import { validateCursorUsageSource } from '../gjs/providers/cursor.js';
import { fetchJevBilling } from '../gjs/providers/jev.js';
import { clearJevCookie, parseJevCookie, saveJevCookie } from '../gjs/providers/jevKeyring.js';
import { publicError } from '../lib/model.js';
import type { ProviderCatalogEntry, QuotaMode } from '../lib/providers/catalog.js';

const SETTING = 'allow-unofficial-sources';

export function createUnofficialSourceSwitch(
    entry: ProviderCatalogEntry,
    settings: Gio.Settings,
    onCursorQuotas: (modes: QuotaMode[]) => void,
    cancellable: Gio.Cancellable,
): { widget: Gtk.Switch; reload: () => void } {
    const widget = new Gtk.Switch({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    let busy = false;

    const reload = () => {
        const enabled = settings.get_boolean(SETTING);
        widget.active = enabled;
        widget.state = enabled;
        widget.sensitive = !busy && settings.is_writable(SETTING);
    };

    const change = async (enable: boolean) => {
        const parent = widget.get_root();
        if (!(parent instanceof Gtk.Window))
            return;
        busy = true;
        reload();
        try {
            if (entry.id === 'jev' && enable) {
                if (!await promptForJevCookie(parent, cancellable))
                    return;
            } else if (entry.id === 'jev') {
                await clearJevCookie(cancellable);
            } else if (enable) {
                appendLog('info', 'Services: validating the Cursor unofficial usage source.', 'user');
                onCursorQuotas(await validateCursorUsageSource(cancellable));
            }

            if (cancellable.is_cancelled())
                return;
            if (!settings.set_boolean(SETTING, enable))
                throw new Error('The setting could not be saved.');
            appendLog('info', `Services: unofficial usage source ${enable ? 'enabled' : 'disabled'} for ${entry.id}.`, 'user');
        } catch (error) {
            if (cancellable.is_cancelled())
                return;
            const reason = entry.id === 'jev'
                ? 'Could not update the GNOME keyring. Check that it is installed and unlocked.'
                : publicError(error instanceof Error ? error.message : 'Cursor could not be verified.');
            appendLog('warn', `Services: ${entry.id} unofficial usage source was not changed. ${reason}`, 'user');
            const dialog = Adw.MessageDialog.new(parent, `${entry.displayName} usage source`, reason);
            dialog.modal = true;
            dialog.add_response('close', 'Close');
            dialog.connect('response', () => dialog.destroy());
            dialog.present();
        } finally {
            busy = false;
            if (!cancellable.is_cancelled())
                reload();
        }
    };

    widget.connect('state-set', (_switch, requested: boolean) => {
        if (requested === settings.get_boolean(SETTING))
            return false;
        if (!busy && settings.is_writable(SETTING))
            void change(requested);
        else
            reload();
        return true;
    });
    reload();
    return { widget, reload };
}

function promptForJevCookie(parent: Gtk.Window, cancellable: Gio.Cancellable): Promise<boolean> {
    const instructions = 'Paste the full Cookie request header from the TypeSafe console Billing page.';
    const dialog = Adw.MessageDialog.new(parent, 'Enable Jev usage source', instructions);
    dialog.modal = true;
    dialog.destroy_with_parent = true;
    const cookie = new Gtk.PasswordEntry({ placeholder_text: 'Cookie: session_id=****' });
    const readme = new Gtk.LinkButton({
        uri: 'https://github.com/bgpat/gnome-shell-extension-genai-usage/blob/9a18a680169b6f1370ce6f7b03600daff45e5290/README.md#set-up-jev',
        label: 'README',
        halign: Gtk.Align.START,
    });
    readme.connect('activate-link', () => {
        appendLog('info', 'Services: opened the Jev setup README.', 'user');
        return false;
    });
    const warning = new Gtk.Box({ spacing: 8, visible: false });
    const warningIcon = new Gtk.Image({
        icon_name: 'dialog-warning-symbolic',
        valign: Gtk.Align.START,
        css_classes: ['warning'],
    });
    const warningText = new Gtk.Label({ xalign: 0, wrap: true, max_width_chars: 34 });
    warning.append(warningIcon);
    warning.append(warningText);

    const showWarning = (message: string) => {
        dialog.body = instructions;
        warningText.label = message;
        warning.visible = true;
    };

    const fields = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
    fields.append(cookie);
    fields.append(warning);
    fields.append(readme);
    dialog.extra_child = fields;
    dialog.add_response('cancel', 'Cancel');
    dialog.add_response('validate', 'Validate');
    dialog.set_response_appearance('validate', Adw.ResponseAppearance.SUGGESTED);
    dialog.default_response = 'validate';
    dialog.close_response = 'cancel';

    return new Promise(resolve => {
        let running = false;
        dialog.connect('close-request', () => {
            if (running)
                return true;
            cookie.text = '';
            resolve(false);
            return false;
        });
        dialog.connect('response', (_dialog, response: string) => {
            if (running)
                return;
            if (response === 'cancel') {
                cookie.text = '';
                resolve(false);
                dialog.destroy();
                return;
            }
            if (response !== 'validate')
                return;

            const value = parseJevCookie(cookie.text);
            if (!value) {
                showWarning('Paste the full Cookie request header value on one line.');
                appendLog('warn', 'Services: Jev Cookie header format was rejected.', 'user');
                return;
            }
            running = true;
            cookie.sensitive = false;
            dialog.set_response_enabled('validate', false);
            dialog.set_response_enabled('cancel', false);
            warning.visible = false;
            dialog.body = 'Checking the TypeSafe session…';
            appendLog('info', 'Services: validating the Jev unofficial usage source.', 'user');
            void (async () => {
                let saved = false;
                try {
                    const snapshot = await fetchJevBilling(value, cancellable);
                    if (cancellable.is_cancelled())
                        return;
                    if (snapshot.availability.state === 'unavailable') {
                        showWarning(snapshot.availability.reason);
                        appendLog('warn', `Services: Jev validation failed. ${snapshot.availability.reason}`, 'user');
                        return;
                    }
                    dialog.body = 'Saving the cookie in the GNOME keyring…';
                    saved = await saveJevCookie(value, cancellable);
                    if (!saved)
                        throw new Error('Could not save the cookie');
                } catch {
                    showWarning('Could not save the cookie in the GNOME keyring. Check that it is installed and unlocked.');
                    appendLog('warn', 'Services: could not save the Jev cookie in the keyring.', 'user');
                } finally {
                    running = false;
                    if (saved || cancellable.is_cancelled()) {
                        cookie.text = '';
                        resolve(saved);
                        dialog.destroy();
                    } else {
                        cookie.sensitive = true;
                        dialog.set_response_enabled('validate', true);
                        dialog.set_response_enabled('cancel', true);
                    }
                }
            })();
        });
        cookie.connect('activate', () => dialog.response('validate'));
        dialog.present();
        cookie.grab_focus();
    });
}
