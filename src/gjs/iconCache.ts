import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    brandedWebIconBasename,
    cacheFileName,
    CHATGPT_PANEL_VIEWBOX,
    CURSOR_PANEL_VIEWBOX,
    iconDownloadSucceeded,
    prepareDownloadedIconBytes,
    shouldRetryIconHttp,
} from '../lib/icons.js';
import { readFileBytes } from './files.js';
import { iconCacheRoot } from './iconCachePaths.js';
import { httpGet } from './http.js';
import { appendLog } from './log.js';
import { isPngBytes, preparePanelIconPngBytes } from './trimIconPng.js';

const CACHE_TTL_SEC = 7 * 24 * 60 * 60;
const ICON_DOWNLOAD_ATTEMPTS = 4;
const ICON_DOWNLOAD_RETRY_MS = [0, 800, 2000, 5000];

function sleepMs(ms: number, cancellable: Gio.Cancellable): Promise<void> {
    if (ms <= 0)
        return Promise.resolve();
    if (cancellable.is_cancelled())
        return Promise.reject(new Error('Operation was cancelled'));
    return new Promise((resolve, reject) => {
        let cancelId = 0;
        const source = GLib.timeout_source_new(ms);
        source.set_callback(() => {
            if (cancelId)
                cancellable.disconnect(cancelId);
            resolve();
            return GLib.SOURCE_REMOVE;
        });
        cancelId = cancellable.connect(() => {
            source.destroy();
            reject(new Error('Operation was cancelled'));
        });
        source.attach(null);
    });
}

function cacheRoot(): Gio.File {
    return iconCacheRoot();
}

function legacyCacheFileName(providerId: string, url: string): string {
    let hash = 5381;
    for (let i = 0; i < url.length; i++)
        hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
    return `${providerId}-${hash.toString(16)}`;
}

function cacheFile(providerId: string, url: string, defaultUrl = ''): Gio.File {
    return cacheRoot().get_child(cacheFileName(providerId, url, defaultUrl));
}

/** Stable display filename under the icon cache (same path in Shell and preferences). */
export function brandedWebIconFile(providerId: string, url: string, defaultUrl = ''): Gio.File {
    return cacheRoot().get_child(brandedWebIconBasename(providerId, url, defaultUrl));
}

export function legacyBrandedBinFile(providerId: string): Gio.File {
    return cacheRoot().get_child(`${providerId}-web.bin`);
}

/** Cached icon on disk, including legacy filenames without a URL extension. */
export function findCachedIconFile(providerId: string, url: string, defaultUrl = ''): Gio.File | undefined {
    const root = cacheRoot();
    for (const name of [cacheFileName(providerId, url, defaultUrl), legacyCacheFileName(providerId, url)]) {
        const file = root.get_child(name);
        try {
            if (file.query_exists(null))
                return file;
        } catch {
            // Ignore unreadable cache paths.
        }
    }
    return undefined;
}

/** Prefer a cache filename that includes the URL extension (needed for some icon loaders). */
export function resolveCachedIconFile(providerId: string, url: string, defaultUrl = ''): Gio.File | undefined {
    const found = findCachedIconFile(providerId, url, defaultUrl);
    if (!found)
        return undefined;
    const canonical = cacheFile(providerId, url, defaultUrl);
    if (found.equal(canonical))
        return found;
    if (canonical.query_exists(null))
        return canonical;
    try {
        found.copy(canonical, Gio.FileCopyFlags.OVERWRITE, null, null);
        appendLog('info', `Icon cache migrated for ${providerId}: ${canonical.get_basename()}`);
        return canonical;
    } catch (error) {
        appendLog(
            'warn',
            `Icon cache migrate failed for ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return found;
    }
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

function writeBytes(file: Gio.File, bytes: GLib.Bytes, cancellable: Gio.Cancellable): Promise<void> {
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
                    stream.write_bytes_async(
                        bytes as unknown as Uint8Array,
                        GLib.PRIORITY_DEFAULT,
                        cancellable,
                        (_out, writeResult) => {
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
    defaultUrl = '',
): Promise<Gio.File | undefined> {
    const existing = resolveCachedIconFile(providerId, url, defaultUrl);
    const file = existing ?? cacheFile(providerId, url, defaultUrl);
    const age = await modifiedAgeSec(file, cancellable);
    if (age !== undefined && age < CACHE_TTL_SEC) {
        appendLog(
            'info',
            `Icon download skipped for ${providerId}: cache fresh (${file.get_basename()}, ${age}s old)`,
        );
        return file;
    }
    if (!useWeb) {
        if (age === undefined) {
            appendLog('info', `Icon download skipped for ${providerId}: Download provider icons is off (no cache)`);
            return undefined;
        }
        appendLog(
            'info',
            `Icon download skipped for ${providerId}: Download provider icons is off (using ${file.get_basename()})`,
        );
        return file;
    }

    appendLog('info', `Icon downloading for ${providerId}: ${url}`);
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= ICON_DOWNLOAD_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            appendLog(
                'info',
                `Icon download retry for ${providerId}: attempt ${attempt}/${ICON_DOWNLOAD_ATTEMPTS} (${url})`,
            );
        }
        try {
            await sleepMs(ICON_DOWNLOAD_RETRY_MS[attempt - 1] ?? 5000, cancellable);
            const response = await httpGet({
                url,
                headers: { Accept: 'image/*,image/svg+xml' },
                timeoutSec: 15,
                cancellable,
            });
            const size = response.bytes.get_size();
            if (iconDownloadSucceeded(response.status, response.contentType, size)) {
                ensureDir(cacheRoot());
                const raw = response.bytes.get_data();
                if (!raw) {
                    appendLog('warn', `Icon download empty body for ${providerId}`);
                    lastError = 'empty body';
                    if (attempt === ICON_DOWNLOAD_ATTEMPTS)
                        break;
                    continue;
                } else {
                    const normalized = prepareDownloadedIconBytes(raw, response.contentType);
                    let prepared = normalized;
                    const pngPrepared = preparePanelIconPngBytes(prepared, response.contentType);
                    if (pngPrepared !== prepared) {
                        appendLog('debug', `Icon PNG prepared for ${providerId}: trim and rounded corners`);
                        prepared = pngPrepared;
                    } else if (normalized !== raw) {
                        appendLog('debug', `Icon SVG normalized for ${providerId}: panel tune`);
                    }
                    const toWrite = prepared === raw
                        ? response.bytes
                        : GLib.Bytes.new(prepared);
                    await writeBytes(file, toWrite, cancellable);
                    appendLog(
                        'info',
                        `Icon downloaded for ${providerId}: ${file.get_basename()} (${size} bytes, HTTP ${response.status}${attempt > 1 ? `, attempt ${attempt}` : ''})`,
                    );
                    return file;
                }
            } else {
                lastError = `HTTP ${response.status} (${response.contentType ?? 'no content-type'}, ${size} bytes)`;
                appendLog('warn', `Icon HTTP for ${providerId}: ${lastError}`);
                if (!shouldRetryIconHttp(response.status, response.contentType, size)
                    || attempt === ICON_DOWNLOAD_ATTEMPTS)
                    break;
                continue;
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            appendLog('warn', `Icon download failed for ${providerId} (attempt ${attempt}): ${lastError}`);
            if (attempt === ICON_DOWNLOAD_ATTEMPTS)
                break;
        }
    }
    if (lastError) {
        appendLog(
            'warn',
            `Icon download gave up for ${providerId} after ${ICON_DOWNLOAD_ATTEMPTS} attempts: ${lastError}`,
        );
    }
    return age === undefined ? undefined : file;
}

export function purgeLegacyWebIconAliases(providerId: string): void {
    const root = cacheRoot();
    for (const name of [`${providerId}-web.svg`, `${providerId}-web.png`, `${providerId}-web.bin`]) {
        const legacy = root.get_child(name);
        try {
            if (legacy.query_exists(null)) {
                legacy.delete(null);
                appendLog('info', `Icon cache removed legacy alias: ${name}`);
            }
        } catch {
            // Ignore delete failures.
        }
    }
}

/** Rewrite cached SVG fills so symbolic panel icons pick up the top-bar color. */
export async function normalizeBrandedSvgIfNeeded(
    file: Gio.File,
    cancellable: Gio.Cancellable | null = null,
): Promise<void> {
    const basename = file.get_basename();
    if (!basename?.endsWith('.svg'))
        return;
    const raw = await readFileBytes(file, cancellable);
    if (!raw)
        return;
    try {
        const prepared = prepareDownloadedIconBytes(raw, 'image/svg+xml');
        const text = new TextDecoder().decode(raw);
        const needsPanelTune = text.includes('m512 325.5')
            || (text.includes('297.06 130.97') && !text.includes(`viewBox="${CHATGPT_PANEL_VIEWBOX}"`))
            || (text.includes('415.035 156.35') && !text.includes(`viewBox="${CURSOR_PANEL_VIEWBOX}"`))
            || text.includes('viewBox="48 48 224 224"')
            || text.includes('viewBox="172 152 168 196"')
            || text.includes('viewBox="24 24 272 272"')
            || text.includes('viewBox="108 100 296 296"')
            || text.includes('viewBox="40 40 240 240"')
            || text.includes('viewBox="128 116 256 256"')
            || text.includes('viewBox="76 53 360 406"');
        if (!needsPanelTune && prepared.length === raw.length && prepared.every((byte, index) => byte === raw[index]))
            return;
        file.replace_contents(
            prepared,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
        );
        appendLog('debug', `Icon SVG normalized on disk: ${basename}`);
    } catch {
        // Ignore unreadable icon files.
    }
}

/** Trim transparent PNG padding when loading from cache (e.g. before PNG trim was added). */
export async function normalizeBrandedPngIfNeeded(
    file: Gio.File,
    cancellable: Gio.Cancellable | null = null,
): Promise<void> {
    const basename = file.get_basename();
    if (!basename?.endsWith('.png') && !basename?.endsWith('.bin'))
        return;
    const raw = await readFileBytes(file, cancellable);
    if (!raw)
        return;
    try {
        if (!isPngBytes(raw))
            return;
        const prepared = preparePanelIconPngBytes(raw, 'image/png');
        if (prepared.length === raw.length && prepared.every((byte, index) => byte === raw[index]))
            return;
        file.replace_contents(
            prepared,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
        );
        appendLog('debug', `Icon PNG prepared on disk: ${basename}`);
    } catch {
        // Ignore unreadable icon files.
    }
}

export function iconCacheDirectory(): string {
    return cacheRoot().get_path() ?? '';
}

function notifyIconCacheCleared(mainSettings: Gio.Settings | undefined): void {
    if (!mainSettings)
        return;
    const next = mainSettings.get_uint('icon-cache-token') + 1;
    mainSettings.set_uint('icon-cache-token', next);
    appendLog('info', `Icon cache token bumped to ${next} (shell and preferences will reload icons).`, 'user');
}

export function clearIconCache(mainSettings?: Gio.Settings): void {
    const root = cacheRoot();
    const path = root.get_path() ?? '(unknown)';
    if (!root.query_exists(null)) {
        appendLog('info', `Icon cache clear: directory missing (${path})`);
        notifyIconCacheCleared(mainSettings);
        return;
    }
    const removed: string[] = [];
    try {
        const enumerator = root.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        for (;;) {
            const info = enumerator.next_file(null);
            if (!info)
                break;
            const name = info.get_name();
            root.get_child(name).delete(null);
            removed.push(name);
        }
        enumerator.close(null);
    } catch (error) {
        appendLog(
            'warn',
            `Icon cache clear failed (${path}): ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
    }
    if (removed.length === 0)
        appendLog('info', `Icon cache clear: empty (${path})`);
    else
        appendLog('info', `Icon cache cleared (${path}): ${removed.join(', ')}`);
    notifyIconCacheCleared(mainSettings);
}
