import { googleFaviconUrl } from '../googleFaviconUrl.js';
import { isHttpsUrl } from '../icons.js';

export interface QuotaMode {
    id: string;
    label: string;
}

export interface ProviderCatalogEntry {
    id: string;
    displayName: string;
    columnHeaderNote?: string;
    defaultIconUrl: string;
    executableNames: string[];
    staticQuotaModes?: QuotaMode[];
    dynamicQuotas: boolean;
    showsCreditBalance?: boolean;
    supportsUnofficial: boolean;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
    {
        id: 'chatgpt',
        displayName: 'ChatGPT',
        columnHeaderNote: 'Uses the official Codex app-server and the existing Codex login.',
        defaultIconUrl: googleFaviconUrl('https://chatgpt.com'),
        executableNames: ['codex'],
        staticQuotaModes: [
            { id: 'five-hour', label: 'Five-hour quota' },
            { id: 'weekly', label: 'Weekly quota' },
            { id: 'lowest', label: 'Lowest remaining quota' },
        ],
        dynamicQuotas: false,
        supportsUnofficial: false,
    },
    {
        id: 'cursor',
        displayName: 'Cursor',
        columnHeaderNote: 'Quota details from cursor.com are off until you allow the unofficial source.',
        defaultIconUrl: googleFaviconUrl('https://cursor.com'),
        executableNames: ['cursor-agent'],
        dynamicQuotas: true,
        supportsUnofficial: true,
    },
    {
        id: 'jev',
        displayName: 'Jev',
        columnHeaderNote: 'Uses a TypeSafe console session to read available credits.',
        defaultIconUrl: googleFaviconUrl('https://console.typesafe.ai'),
        executableNames: [],
        dynamicQuotas: false,
        showsCreditBalance: true,
        supportsUnofficial: true,
    },
];

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
