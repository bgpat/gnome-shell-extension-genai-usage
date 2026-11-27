import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

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

export async function lookupJevCookie(cancellable: Gio.Cancellable): Promise<string | null> {
    const { Secret, schema } = await keyring();
    return new Promise((resolve, reject) => {
        Secret.password_lookup(schema, attributes, cancellable, (_source, result) => {
            finish(result, value => Secret.password_lookup_finish(value), resolve, reject);
        });
    });
}

export async function saveJevCookie(cookie: string, cancellable: Gio.Cancellable): Promise<boolean> {
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

export async function clearJevCookie(cancellable: Gio.Cancellable): Promise<void> {
    const { Secret, schema } = await keyring();
    await new Promise<boolean>((resolve, reject) => {
        Secret.password_clear(schema, attributes, cancellable, (_source, result) => {
            finish(result, value => Secret.password_clear_finish(value), resolve, reject);
        });
    });
}

export function parseJevCookie(value: string): string | undefined {
    const cookie = value.trim().replace(/^Cookie:[ \t]*/i, '');
    return cookie.includes('=') && /^[\x20-\x7e]+$/.test(cookie) ? cookie : undefined;
}
