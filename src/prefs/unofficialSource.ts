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
    const setupGuide = new Gtk.LinkButton({
        uri: 'https://github.com/bgpat/gnome-shell-extension-genai-usage/blob/main/docs/jev.md',
        label: 'Setup guide',
        halign: Gtk.Align.START,
    });
    setupGuide.connect('activate-link', () => {
        appendLog('info', 'Services: opened the Jev setup guide.', 'user');
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

    const cancelButton = new Gtk.Button({ label: 'Cancel' });
    const validateButton = new Gtk.Button({ label: 'Validate' });
    validateButton.add_css_class('suggested-action');
    // MessageDialog response buttons close the window automatically.
    const actions = new Gtk.Box({ spacing: 12, homogeneous: true, margin_top: 8 });
    actions.append(cancelButton);
    actions.append(validateButton);

    const fields = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
    fields.append(cookie);
    fields.append(warning);
    fields.append(setupGuide);
    fields.append(actions);
    dialog.extra_child = fields;
    dialog.set_default_widget(validateButton);

    return new Promise(resolve => {
        let request: Gio.Cancellable | undefined;
        let closed = false;

        const close = () => {
            closed = true;
            cookie.text = '';
            dialog.destroy();
        };
        const cancel = () => {
            if (closed)
                return;
            close();
            if (request)
                request.cancel();
            else
                resolve(false);
        };
        dialog.connect('close-request', () => {
            cancel();
            return true;
        });

        const validate = async (value: string, attempt: Gio.Cancellable) => {
            const parentCancel = cancellable.connect(() => attempt.cancel());
            let saving = false;
            let saved = false;
            try {
                const snapshot = await fetchJevBilling(value, attempt);
                if (attempt.is_cancelled())
                    return;
                if (snapshot.availability.state === 'unavailable') {
                    showWarning(snapshot.availability.reason);
                    appendLog('warn', `Services: Jev validation failed. ${snapshot.availability.reason}`, 'user');
                    return;
                }
                dialog.body = 'Saving the cookie in the GNOME keyring…';
                saving = true;
                saved = await saveJevCookie(value, attempt);
                if (!saved)
                    throw new Error('Could not save the cookie');
            } catch {
                if (!attempt.is_cancelled()) {
                    showWarning('Could not save the cookie in the GNOME keyring. Check that it is installed and unlocked.');
                    appendLog('warn', 'Services: could not save the Jev cookie in the keyring.', 'user');
                }
            } finally {
                if (parentCancel)
                    cancellable.disconnect(parentCancel);
                request = undefined;
                if (closed || cancellable.is_cancelled()) {
                    if (saving) {
                        try {
                            await clearJevCookie(new Gio.Cancellable());
                        } catch {
                            appendLog('warn', 'Services: could not remove the Jev cookie after cancellation.', 'user');
                        }
                    }
                    resolve(false);
                } else if (saved) {
                    close();
                    resolve(true);
                } else {
                    cookie.sensitive = true;
                    validateButton.sensitive = true;
                }
            }
        };

        cancelButton.connect('clicked', cancel);
        validateButton.connect('clicked', () => {
            if (request || closed)
                return;
            const value = parseJevCookie(cookie.text);
            if (!value) {
                showWarning('Paste the full Cookie request header value on one line.');
                appendLog('warn', 'Services: Jev Cookie header format was rejected.', 'user');
                return;
            }

            request = new Gio.Cancellable();
            cookie.sensitive = false;
            validateButton.sensitive = false;
            warning.visible = false;
            dialog.body = 'Checking the TypeSafe session…';
            appendLog('info', 'Services: validating the Jev unofficial usage source.', 'user');
            void validate(value, request);
        });
        cookie.connect('activate', () => validateButton.activate());
        dialog.present();
        cookie.grab_focus();
    });
}
