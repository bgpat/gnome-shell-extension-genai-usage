// Standalone GJS entry point. Keep libsecret and its native dependencies out
// of the Shell process when refreshing Jev usage.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import { attributes, finish, keyring, schemaName } from './jevKeyring.js';

function searchItems(): [string[], string[]] {
    const reply = Gio.DBus.session.call_sync(
        'org.freedesktop.secrets',
        '/org/freedesktop/secrets',
        'org.freedesktop.Secret.Service',
        'SearchItems',
        new GLib.Variant('(a{ss})', [{ ...attributes, 'xdg:schema': schemaName }]),
        new GLib.VariantType('(aoao)'),
        Gio.DBusCallFlags.NO_AUTO_START,
        2000,
        null,
    );
    return reply.deepUnpack() as [string[], string[]];
}

async function lookup(): Promise<string | null> {
    const [unlocked, locked] = searchItems();
    if (unlocked.length === 0) {
        if (locked.length > 0)
            throw new Error('Jev keyring item is locked');
        return null;
    }

    const { Secret, schema } = await keyring();
    return new Promise((resolve, reject) => {
        Secret.password_lookup(schema, attributes, new Gio.Cancellable(), (_source, result) => {
            finish(result, value => Secret.password_lookup_finish(value), resolve, reject);
        });
    });
}

try {
    print(JSON.stringify(await lookup()));
} catch {
    // Stdout is reserved for the result. Never log the cookie.
    System.exit(1);
}
