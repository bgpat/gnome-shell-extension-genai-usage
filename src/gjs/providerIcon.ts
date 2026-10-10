import Gio from 'gi://Gio';

import { isLegacyColoredChatGptSvg } from '../lib/icons.js';
import { catalogEntry, providerIconUrlCandidates } from '../lib/providers/catalog.js';
import { appendLog } from './log.js';
import {
    brandedWebIconFile,
    cachedIconFile,
    legacyBrandedBinFile,
    normalizeBrandedPngIfNeeded,
    normalizeBrandedSvgIfNeeded,
    purgeLegacyWebIconAliases,
    resolveCachedIconFile,
} from './iconCache.js';
import type { ExtensionSettings } from './settings.js';

export function giconFromFile(file: Gio.File): Gio.Icon | undefined {
    try {
        return Gio.FileIcon.new(file) as unknown as Gio.Icon;
    } catch {
        return undefined;
    }
}

function discardStaleIconFile(providerId: string, file: Gio.File): boolean {
    const basename = file.get_basename();
    if (!basename?.endsWith('.svg'))
        return false;
    try {
        const [, contents] = file.load_contents(null);
        const raw = contents instanceof Uint8Array ? contents : new Uint8Array(contents as ArrayBuffer);
        const svg = new TextDecoder().decode(raw.subarray(0, Math.min(raw.length, 16_384)));
        if (providerId === 'chatgpt' && isLegacyColoredChatGptSvg(svg)) {
            file.delete(null);
            appendLog('info', `Icon cache removed stale ChatGPT logo: ${basename}`);
            return true;
        }
    } catch {
        // Keep the file if it cannot be read.
    }
    return false;
}

function iconFileForUrl(providerId: string, url: string, defaultUrl: string): Gio.File | undefined {
    purgeLegacyWebIconAliases(providerId);
    const canonical = brandedWebIconFile(providerId, url, defaultUrl);
    if (!canonical.query_exists(null)) {
        const legacy = legacyBrandedBinFile(providerId);
        if (legacy.query_exists(null)) {
            try {
                legacy.copy(canonical, Gio.FileCopyFlags.OVERWRITE, null, null);
                appendLog('info', `Icon migrated for ${providerId}: ${legacy.get_basename()} → ${canonical.get_basename()}`);
            } catch {
                // Fall through to URL-keyed cache lookup.
            }
        }
    }
    const cached = resolveCachedIconFile(providerId, url, defaultUrl);
    let file = cached ?? (canonical.query_exists(null) ? canonical : undefined);
    if (!file)
        return undefined;
    if (discardStaleIconFile(providerId, file))
        return undefined;
    normalizeBrandedSvgIfNeeded(file);
    normalizeBrandedPngIfNeeded(file);
    return file;
}

function iconFileForCandidates(
    providerId: string,
    urls: readonly string[],
    defaultUrl: string,
): Gio.File | undefined {
    for (const url of urls) {
        const file = iconFileForUrl(providerId, url, defaultUrl);
        if (file)
            return file;
    }
    return undefined;
}

/** Cached web icon when downloads are enabled; otherwise nothing. */
export function providerGicon(providerId: string, settings: ExtensionSettings): Gio.Icon | undefined {
    const entry = catalogEntry(providerId);
    if (!entry || !settings.useWebIcons)
        return undefined;

    const urls = providerIconUrlCandidates(entry, settings.iconUrl(providerId));
    if (urls.length === 0)
        return undefined;

    const file = iconFileForCandidates(providerId, urls, entry.defaultIconUrl);
    if (!file)
        return undefined;
    return giconFromFile(file);
}

export function refreshProviderGicon(
    providerId: string,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
): Promise<Gio.Icon | undefined> {
    const entry = catalogEntry(providerId);
    if (!entry)
        return Promise.resolve(undefined);
    if (!settings.useWebIcons) {
        appendLog('info', `Icon refresh skipped for ${providerId}: Download provider icons is off`);
        return Promise.resolve(undefined);
    }
    const urls = providerIconUrlCandidates(entry, settings.iconUrl(providerId));
    if (urls.length === 0) {
        appendLog(
            'warn',
            `Icon refresh skipped for ${providerId}: no valid HTTPS URL (override=${JSON.stringify(settings.iconUrl(providerId))})`,
        );
        return Promise.resolve(undefined);
    }
    appendLog('info', `Icon refresh started for ${providerId}`);
    return refreshProviderIconUrls(providerId, urls, entry.defaultIconUrl, cancellable);
}

async function refreshProviderIconUrls(
    providerId: string,
    urls: readonly string[],
    defaultUrl: string,
    cancellable: Gio.Cancellable,
): Promise<Gio.Icon | undefined> {
    for (const url of urls) {
        const file = await cachedIconFile(providerId, url, true, cancellable, defaultUrl);
        if (!file)
            continue;
        const resolved = iconFileForUrl(providerId, url, defaultUrl);
        if (!resolved)
            continue;
        return giconFromFile(resolved);
    }
    return undefined;
}
