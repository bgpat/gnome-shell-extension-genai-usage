import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { appendLog } from '../gjs/log.js';
import { UNOFFICIAL_SOURCE_SETTING } from '../gjs/settings.js';
import { publicError } from '../lib/model.js';
import type { Provider } from '../lib/providers/provider.js';

export function createUnofficialSourceSwitch(
    { id, displayName }: Provider,
    settings: Gio.Settings,
    changeUsageSource: (enable: boolean, parent: Gtk.Window) => Promise<boolean>,
    cancellable: Gio.Cancellable,
): { widget: Gtk.Switch; reload: () => void } {
    const widget = new Gtk.Switch({ halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    let busy = false;

    const reload = () => {
        const enabled = settings.get_boolean(UNOFFICIAL_SOURCE_SETTING);
        widget.active = enabled;
        widget.state = enabled;
        widget.sensitive = !busy && settings.is_writable(UNOFFICIAL_SOURCE_SETTING);
    };

    const change = async (enable: boolean) => {
        const parent = widget.get_root();
        if (!(parent instanceof Gtk.Window))
            return;
        busy = true;
        reload();
        try {
            if (await changeUsageSource(enable, parent) && !cancellable.is_cancelled())
                appendLog('info', `Services: unofficial usage source ${enable ? 'enabled' : 'disabled'} for ${id}.`, 'user');
        } catch (error) {
            if (cancellable.is_cancelled())
                return;
            const reason = publicError(error instanceof Error ? error.message : 'The usage source could not be updated.');
            appendLog('warn', `Services: ${id} unofficial usage source was not changed. ${reason}`, 'user');
            const dialog = Adw.MessageDialog.new(parent, `${displayName} usage source`, reason);
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
        if (requested === settings.get_boolean(UNOFFICIAL_SOURCE_SETTING))
            return false;
        if (!busy && settings.is_writable(UNOFFICIAL_SOURCE_SETTING))
            void change(requested);
        else
            reload();
        return true;
    });
    reload();
    return { widget, reload };
}
