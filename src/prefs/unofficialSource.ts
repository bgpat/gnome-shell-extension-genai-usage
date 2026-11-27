import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { appendLog } from '../gjs/log.js';
import { validateCursorUsageSource } from '../gjs/providers/cursor.js';
import { activateJev, deactivateJev } from '../gjs/providers/jev.js';
import { publicError } from '../lib/model.js';
import type { ProviderCatalogEntry, QuotaMode } from '../lib/providers/catalog.js';
import { promptForValidatedSecret } from './secretValidationDialog.js';

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
                if (await promptForJevCookie(parent, settings, cancellable))
                    appendLog('info', 'Services: unofficial usage source enabled for jev.', 'user');
                return;
            }
            if (entry.id === 'jev') {
                await deactivateJev(settings, cancellable);
                if (!cancellable.is_cancelled())
                    appendLog('info', 'Services: unofficial usage source disabled for jev.', 'user');
                return;
            }
            if (enable) {
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
            const reason = publicError(error instanceof Error ? error.message : 'The usage source could not be updated.');
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

function promptForJevCookie(
    parent: Gtk.Window,
    settings: Gio.Settings,
    cancellable: Gio.Cancellable,
): Promise<boolean> {
    const setupGuide = new Gtk.LinkButton({
        uri: 'https://github.com/bgpat/gnome-shell-extension-genai-usage/blob/main/docs/jev.md',
        label: 'Setup guide',
        halign: Gtk.Align.START,
    });
    setupGuide.connect('activate-link', () => {
        appendLog('info', 'Services: opened the Jev setup guide.', 'user');
        return false;
    });
    return promptForValidatedSecret({
        parent,
        title: 'Enable Jev usage source',
        instructions: 'Paste the full Cookie request header from the TypeSafe console Billing page.',
        placeholder: 'Cookie: session_id=****',
        help: setupGuide,
        cancellable,
        validate: (value, attempt, setStatus) => activateJev(value, settings, attempt, setStatus),
    });
}
