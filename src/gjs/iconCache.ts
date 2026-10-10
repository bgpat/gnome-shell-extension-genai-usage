import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { cacheFileName, isIconPayload } from '../lib/icons.js';
import { httpGet } from './http.js';

const CACHE_TTL_SEC = 7 * 24 * 60 * 60;

function cacheRoot(): Gio.File {
    return Gio.File.new_for_path(GLib.build_filenamev([
        GLib.get_user_cache_dir(),
        'genai-usage',
        'icons',
    ]));
}

function cacheFile(providerId: string, url: string): Gio.File {
    return cacheRoot().get_child(cacheFileName(providerId, url));
}

function modifiedAgeSec(file: Gio.File, cancellable: Gio.Cancellable): Promise<number | undefined> {
    return new Promise(resolve => {
        file.query_info_async(
            'time::modified',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_source, result) => {
                try {
                    const info = file.query_info_finish(result);
                    const modified = info.get_attribute_uint64('time::modified');
                    resolve(Math.floor(Date.now() / 1000) - modified);
                } catch {
                    resolve(undefined);
                }
            },
        );
    });
}

function ensureDir(dir: Gio.File): void {
    try {
        dir.make_directory_with_parents(null);
    } catch {
        // The directory already exists.
    }
}

function writeBytes(file: Gio.File, bytes: Uint8Array, cancellable: Gio.Cancellable): Promise<void> {
    return new Promise((resolve, reject) => {
        file.replace_async(
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_source, result) => {
                try {
                    const stream = file.replace_finish(result);
                    stream.write_bytes_async(bytes, GLib.PRIORITY_DEFAULT, cancellable, (_out, writeResult) => {
                        try {
                            stream.write_bytes_finish(writeResult);
                            stream.close_async(GLib.PRIORITY_DEFAULT, cancellable, () => resolve());
                        } catch (error) {
                            reject(error instanceof Error ? error : new Error(String(error)));
                        }
                    });
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            },
        );
    });
}

export async function cachedIconFile(
    providerId: string,
    url: string,
    useWeb: boolean,
    cancellable: Gio.Cancellable,
): Promise<Gio.File | undefined> {
    const file = cacheFile(providerId, url);
    const age = await modifiedAgeSec(file, cancellable);
    if (age !== undefined && age < CACHE_TTL_SEC)
        return file;
    if (!useWeb)
        return age === undefined ? undefined : file;

    try {
        const response = await httpGet({
            url,
            headers: { Accept: 'image/*,image/svg+xml' },
            timeoutSec: 15,
            cancellable,
        });
        if (response.status !== 200 || !isIconPayload(response.contentType, response.bytes.get_size()))
            return age === undefined ? undefined : file;
        ensureDir(cacheRoot());
        await writeBytes(file, response.bytes.toArray(), cancellable);
        return file;
    } catch {
        return age === undefined ? undefined : file;
    }
}

export function clearIconCache(): void {
    const root = cacheRoot();
    try {
        const enumerator = root.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        for (;;) {
            const info = enumerator.next_file(null);
            if (!info)
                break;
            root.get_child(info.get_name()).delete(null);
        }
        enumerator.close(null);
    } catch {
        // There is no cache yet.
    }
}
