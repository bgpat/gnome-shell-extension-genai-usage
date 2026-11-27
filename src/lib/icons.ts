export function isHttpsUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed)
        return false;
    if (!/^https:\/\//i.test(trimmed))
        return false;
    try {
        type UrlGlobal = typeof globalThis & { URL?: { new (url: string): { protocol: string } } };
        const URLCtor = (globalThis as UrlGlobal).URL;
        if (URLCtor !== undefined)
            return new URLCtor(trimmed).protocol === 'https:';
    } catch {
        return false;
    }
    // GJS outside GNOME Shell may not define URL; regex above is enough for icon URLs.
    return trimmed.length > 'https://'.length;
}

export function effectiveIconUrl(defaultUrl: string, override: string): string | undefined {
    const trimmed = override.trim();
    if (trimmed && isHttpsUrl(trimmed))
        return trimmed;
    if (isHttpsUrl(defaultUrl))
        return defaultUrl;
    return undefined;
}

export function iconUrlExtension(url: string): string {
    const match = url.trim().match(/\.(svg|png|jpe?g|gif|webp|ico)(?:[?#]|$)/i);
    if (match?.[1])
        return `.${match[1].toLowerCase()}`;
    return '';
}

/** Simple Icons CDN serves SVG even when the URL has no file extension. */
export function simpleIconsCdnSvgExtension(url: string): string {
    const trimmed = url.trim();
    if (!/^https:\/\/cdn\.simpleicons\.org\//i.test(trimmed))
        return '';
    if (iconUrlExtension(trimmed))
        return '';
    return '.svg';
}

export function iconUrlFileExtension(url: string, defaultUrl = ''): string {
    return iconUrlExtension(url)
        || iconUrlExtension(defaultUrl)
        || simpleIconsCdnSvgExtension(url)
        || simpleIconsCdnSvgExtension(defaultUrl);
}

/** One on-disk name per provider URL (avoids stale `provider-web.svg` after URL changes). */
export function brandedWebIconBasename(providerId: string, url: string, defaultUrl = ''): string {
    return cacheFileName(providerId, url, defaultUrl);
}

export function cacheFileName(providerId: string, url: string, defaultUrl = ''): string {
    let hash = 5381;
    for (let i = 0; i < url.length; i++)
        hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
    const extension = iconUrlFileExtension(url, defaultUrl) || '.bin';
    return `${providerId}-${hash.toString(16)}${extension}`;
}

const IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'application/octet-stream',
]);

export function isSvgIconPayload(contentType: string | undefined, bytes: Uint8Array): boolean {
    const media = contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (media === 'image/svg+xml')
        return true;
    if (bytes.length === 0)
        return false;
    const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).trimStart();
    return head.startsWith('<svg') || head.startsWith('<?xml');
}

/** Light gray for the dark top bar. FileIcon SVG ignores CSS `currentColor` in GNOME Shell. */
export const SHELL_PANEL_ICON_COLOR = '#eeeeee';

/** Must contain the full path bounds (tight crops clip the glyph in St.Icon). */
export const CHATGPT_PANEL_VIEWBOX = '0 0 320 320';
/** Square viewBox around the inner logo path (St.Icon maps viewBox → square; non-square stretches). */
export const CURSOR_PANEL_VIEWBOX = '51 51 410 410';

/** Flatten SVG fills for St.Icon + Gio.FileIcon (external SVG files). */
export function normalizeSvgForShellSymbolic(svg: string): string {
    const color = SHELL_PANEL_ICON_COLOR;
    let out = svg
        .replace(/fill=(["'])(?!none\b)[^"']*\1/gi, `fill="${color}"`)
        .replace(/stroke=(["'])(?!none\b)[^"']*\1/gi, `stroke="${color}"`);
    out = out.replace(/<path(?![^>]*\bfill=)(?=[\s/>])/gi, `<path fill="${color}"`);
    return out;
}

/** Full-color Wikimedia app-icon SVG (superseded by the monochrome ChatGPT-Logo.svg). */
export function isLegacyColoredChatGptSvg(svg: string): boolean {
    return /#74aa9c/i.test(svg) || /viewBox="0 0 2406 2406"/.test(svg);
}

/** cursor.com/favicon.svg is an app tile; keep only the inner logo path for the top bar. */
export function simplifyCursorOfficialFavicon(svg: string): string {
    if (!svg.includes('415.035 156.35'))
        return svg;
    const pathMatch = svg.match(/<path\b[^>]*\bd="m415\.035 156\.35[^"]*"[^>]*\/>/i);
    if (!pathMatch)
        return svg;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CURSOR_PANEL_VIEWBOX}">${pathMatch[0]}</svg>`;
}

/** Match apparent icon size in the 16px top bar (SVG viewBox padding differs per source). */
export function applyPanelIconViewBox(svg: string): string {
    if (svg.includes('415.035 156.35'))
        return svg.replace(/viewBox="[^"]+"/, `viewBox="${CURSOR_PANEL_VIEWBOX}"`);
    if (svg.includes('297.06 130.97'))
        return svg.replace(/viewBox=['"][^'"]+['"]/, `viewBox="${CHATGPT_PANEL_VIEWBOX}"`);
    return svg;
}

export function preparePanelIconSvg(svg: string): string {
    return normalizeSvgForShellSymbolic(applyPanelIconViewBox(simplifyCursorOfficialFavicon(svg)));
}

export function prepareDownloadedIconBytes(
    bytes: Uint8Array,
    contentType: string | undefined,
): Uint8Array {
    if (!isSvgIconPayload(contentType, bytes))
        return bytes;
    const text = new TextDecoder().decode(bytes);
    const normalized = preparePanelIconSvg(text);
    if (normalized === text)
        return bytes;
    return new TextEncoder().encode(normalized);
}

export function isIconPayload(contentType: string | undefined, bytesLength: number): boolean {
    if (bytesLength <= 0 || bytesLength > 1_000_000)
        return false;
    if (!contentType)
        return true;
    const media = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (media === 'text/html')
        return false;
    if (media.startsWith('image/'))
        return true;
    return IMAGE_TYPES.has(media);
}

export function iconDownloadSucceeded(status: number, contentType: string | undefined, bytesLength: number): boolean {
    return status === 200 && isIconPayload(contentType, bytesLength);
}

/** Retry transient failures; skip permanent client errors. */
export function shouldRetryIconHttp(status: number, contentType: string | undefined, bytesLength: number): boolean {
    if (iconDownloadSucceeded(status, contentType, bytesLength))
        return false;
    if (status === 404 || status === 410 || status === 400 || status === 401)
        return false;
    return true;
}
