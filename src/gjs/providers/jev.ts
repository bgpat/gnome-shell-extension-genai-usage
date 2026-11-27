import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { normalizeJevBilling } from '../../lib/providers/jev/normalize.js';
import { appendLog } from '../log.js';
import { httpGet } from '../http.js';

const SETTING = 'allow-unofficial-sources';
const CONSOLE = 'https://console.typesafe.ai';
const unavailable = (reason: string) => unavailableSnapshot('jev', 'Jev', 'unofficial', reason);

export async function refreshJev(allowUnofficial: boolean, cancellable: Gio.Cancellable): Promise<UsageSnapshot> {
    if (!allowUnofficial)
        return unavailable('Enable the unofficial usage source for Jev in Services');

    let rawCookie: string | null;
    try {
        rawCookie = await lookupJevCookie(cancellable);
    } catch {
        return unavailable('Could not access the GNOME keyring. Check that it is installed and unlocked');
    }
    if (rawCookie === null)
        return unavailable('Turn the Jev unofficial source off and back on in Services to enter a TypeSafe cookie');

    const cookie = parseJevCookie(rawCookie);
    if (!cookie)
        return unavailable('Save the full TypeSafe Cookie request header value in Services');

    return fetchJevBilling(cookie, cancellable);
}

async function fetchJevBilling(cookie: string, cancellable: Gio.Cancellable): Promise<UsageSnapshot> {
    try {
        const response = await httpGet({
            url: `${CONSOLE}/api/billing/overview`,
            noRedirect: true,
            headers: {
                Accept: 'application/json',
                Cookie: cookie,
                Origin: CONSOLE,
                Referer: `${CONSOLE}/billing`,
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
            },
            cancellable,
            timeoutSec: 25,
        });
        if (response.status === 401 || (response.status >= 300 && response.status < 400)
            || (response.status === 200 && response.contentType === 'text/html'))
            return unavailable('Sign in to the TypeSafe console again and turn the Jev unofficial source off and back on in Services');
        if (response.status !== 200)
            return unavailable(`TypeSafe billing request failed (HTTP ${response.status})`);

        return normalizeJevBilling(JSON.parse(response.body), Date.now())
            ?? unavailable('TypeSafe billing response did not contain an available credit balance');
    } catch {
        return unavailable('Could not read the TypeSafe billing response');
    }
}

export async function activateJev(
    value: string,
    settings: Gio.Settings,
    cancellable: Gio.Cancellable,
    setStatus: (message: string) => void,
): Promise<string | undefined> {
    const cookie = parseJevCookie(value);
    if (!cookie) {
        appendLog('warn', 'Services: Jev Cookie header format was rejected.', 'user');
        return 'Paste the full Cookie request header value on one line.';
    }

    setStatus('Checking the TypeSafe session…');
    appendLog('info', 'Services: validating the Jev unofficial usage source.', 'user');
    const snapshot = await fetchJevBilling(cookie, cancellable);
    if (cancellable.is_cancelled())
        return undefined;
    if (snapshot.availability.state === 'unavailable') {
        appendLog('warn', `Services: Jev validation failed. ${snapshot.availability.reason}`, 'user');
        return snapshot.availability.reason;
    }

    setStatus('Saving the cookie in the GNOME keyring…');
    return saveJevActivation(cookie, settings, cancellable);
}

export async function deactivateJev(settings: Gio.Settings, cancellable: Gio.Cancellable): Promise<void> {
    try {
        await clearJevCookie(cancellable);
    } catch {
        throw new Error('Could not remove the Jev cookie. Check that the GNOME keyring is installed and unlocked.');
    }
    if (!settings.set_boolean(SETTING, false))
        throw new Error('The setting could not be saved.');
}

async function saveJevActivation(cookie: string, settings: Gio.Settings, cancellable: Gio.Cancellable): Promise<string | undefined> {
    try {
        if (!await saveJevCookie(cookie, cancellable))
            throw new Error('Could not save the cookie');
    } catch {
        if (cancellable.is_cancelled())
            await discardJevCookie();
        appendLog('warn', 'Services: could not save the Jev cookie in the keyring.', 'user');
        return 'Could not save the cookie in the GNOME keyring. Check that it is installed and unlocked.';
    }

    try {
        if (!cancellable.is_cancelled() && settings.set_boolean(SETTING, true))
            return undefined;
    } catch {
        appendLog('warn', 'Services: could not write the Jev unofficial usage setting.', 'user');
    }

    await discardJevCookie();
    return 'Could not enable the Jev usage source. Try again.';
}

async function discardJevCookie(): Promise<void> {
    try {
        await clearJevCookie(new Gio.Cancellable());
    } catch {
        appendLog('warn', 'Services: could not remove the Jev cookie after an incomplete activation.', 'user');
    }
}

const attributes = { provider: 'jev' };

async function keyring() {
    const { default: Secret } = await import('gi://Secret?version=1');
    const schema = new Secret.Schema('io.github.bgpat.GenaiUsage.Cookie', Secret.SchemaFlags.NONE, {
        provider: Secret.SchemaAttributeType.STRING,
    });
    return { Secret, schema };
}

function finish<T>(result: Gio.AsyncResult, read: (result: Gio.AsyncResult) => T, resolve: (value: T) => void, reject: (error: unknown) => void): void {
    try {
        resolve(read(result));
    } catch (error) {
        reject(error);
    }
}

async function lookupJevCookie(cancellable: Gio.Cancellable): Promise<string | null> {
    const { Secret, schema } = await keyring();
    return new Promise((resolve, reject) => {
        Secret.password_lookup(schema, attributes, cancellable, (_source, result) => {
            finish(result, value => Secret.password_lookup_finish(value), resolve, reject);
        });
    });
}

async function saveJevCookie(cookie: string, cancellable: Gio.Cancellable): Promise<boolean> {
    const { Secret, schema } = await keyring();
    const collection = GLib.getenv('GENAI_USAGE_DEV_SESSION_KEYRING') === '1'
        ? Secret.COLLECTION_SESSION
        : Secret.COLLECTION_DEFAULT;
    return new Promise((resolve, reject) => {
        Secret.password_store(
            schema, attributes, collection, 'GenAI Usage — Jev session', cookie, cancellable,
            (_source, result) => finish(result, value => Secret.password_store_finish(value), resolve, reject),
        );
    });
}

async function clearJevCookie(cancellable: Gio.Cancellable): Promise<void> {
    const { Secret, schema } = await keyring();
    await new Promise<boolean>((resolve, reject) => {
        Secret.password_clear(schema, attributes, cancellable, (_source, result) => {
            finish(result, value => Secret.password_clear_finish(value), resolve, reject);
        });
    });
}

function parseJevCookie(value: string): string | undefined {
    const cookie = value.trim().replace(/^Cookie:[ \t]*/i, '');
    return cookie.includes('=') && /^[\x20-\x7e]+$/.test(cookie) ? cookie : undefined;
}
