import type Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { appendLog } from '../../gjs/log.js';
import { activateJev, deactivateJev } from '../../gjs/providers/jev.js';
import { promptForValidatedSecret } from '../secretValidationDialog.js';

export async function changeJevUsageSource(
    enable: boolean,
    parent: Gtk.Window,
    settings: Gio.Settings,
    cancellable: Gio.Cancellable,
): Promise<boolean> {
    if (!enable) {
        await deactivateJev(settings, cancellable);
        return !cancellable.is_cancelled();
    }

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
