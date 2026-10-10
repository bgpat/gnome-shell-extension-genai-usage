/** Requested raster size (Google may return smaller). */
export const GOOGLE_FAVICON_SIZE = 128;

/** Google favicon proxy (PNG). Stable HTTPS URL per site. */
export function googleFaviconUrl(siteUrl: string, size = GOOGLE_FAVICON_SIZE): string {
    const trimmed = siteUrl.trim();
    const encoded = encodeURIComponent(trimmed.endsWith('/') ? trimmed : `${trimmed}/`);
    return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encoded}&size=${size}`;
}
