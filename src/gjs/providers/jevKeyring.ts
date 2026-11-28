import type Gio from 'gi://Gio';

export const schemaName = 'io.github.bgpat.GenaiUsage.Cookie';
export const attributes = { provider: 'jev' };

export async function keyring() {
    const { default: Secret } = await import('gi://Secret?version=1');
    const schema = new Secret.Schema(schemaName, Secret.SchemaFlags.NONE, {
        provider: Secret.SchemaAttributeType.STRING,
    });
    return { Secret, schema };
}

export function finish<T>(result: Gio.AsyncResult, read: (result: Gio.AsyncResult) => T, resolve: (value: T) => void, reject: (error: unknown) => void): void {
    try {
        resolve(read(result));
    } catch (error) {
        reject(error);
    }
}

