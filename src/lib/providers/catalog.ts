import { googleFaviconUrl } from '../googleFaviconUrl.js';
import { isHttpsUrl } from '../icons.js';

export interface QuotaMode {
    id: string;
    label: string;
}

export interface ProviderCatalogEntry {
    id: string;
    displayName: string;
    defaultIconUrl: string;
    showsCreditBalance?: boolean;
}

export const chatGptEntry: ProviderCatalogEntry = {
    id: 'chatgpt',
    displayName: 'ChatGPT',
    defaultIconUrl: googleFaviconUrl('https://chatgpt.com'),
};

export const cursorEntry: ProviderCatalogEntry = {
    id: 'cursor',
    displayName: 'Cursor',
    defaultIconUrl: googleFaviconUrl('https://cursor.com'),
};

export const jevEntry: ProviderCatalogEntry = {
    id: 'jev',
    displayName: 'Jev',
    defaultIconUrl: googleFaviconUrl('https://console.typesafe.ai'),
    showsCreditBalance: true,
};

export const PROVIDER_CATALOG = [chatGptEntry, cursorEntry, jevEntry];

export const KNOWN_PROVIDER_IDS = PROVIDER_CATALOG.map(entry => entry.id);

export function catalogEntry(id: string): ProviderCatalogEntry | undefined {
    return PROVIDER_CATALOG.find(entry => entry.id === id);
}

/** Built-in default URL; override replaces it. */
export function providerIconUrlCandidates(entry: ProviderCatalogEntry, override: string): string[] {
    const trimmed = override.trim();
    if (trimmed) {
        if (!isHttpsUrl(trimmed))
            return [];
        return [trimmed];
    }
    if (isHttpsUrl(entry.defaultIconUrl))
        return [entry.defaultIconUrl];
    return [];
}
