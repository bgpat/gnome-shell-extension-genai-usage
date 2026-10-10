export function isHttpsUrl(url: string): boolean {
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}

export function effectiveIconUrl(defaultUrl: string, override: string): string | undefined {
    const candidate = override.trim() || defaultUrl;
    if (!isHttpsUrl(candidate))
        return undefined;
    return candidate;
}

export function cacheFileName(providerId: string, url: string): string {
    let hash = 5381;
    for (let i = 0; i < url.length; i++)
        hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
    return `${providerId}-${hash.toString(16)}`;
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
