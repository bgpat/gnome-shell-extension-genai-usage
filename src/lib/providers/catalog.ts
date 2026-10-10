export interface QuotaMode {
    id: string;
    label: string;
}

export interface ProviderCatalogEntry {
    id: string;
    displayName: string;
    themeIconName: string;
    fallbackIcon: string;
    defaultIconUrl: string;
    executableNames: string[];
    staticQuotaModes?: QuotaMode[];
    dynamicQuotas: boolean;
    supportsUnofficial: boolean;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
    {
        id: 'chatgpt',
        displayName: 'ChatGPT',
        themeIconName: 'chatgpt',
        fallbackIcon: 'chatgpt-fallback-symbolic.svg',
        defaultIconUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg',
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
        themeIconName: 'co.anysphere.cursor',
        fallbackIcon: 'cursor-fallback-symbolic.svg',
        defaultIconUrl: 'https://cursor.com/favicon.ico',
        executableNames: ['cursor-agent'],
        dynamicQuotas: true,
        supportsUnofficial: true,
    },
];

export const KNOWN_PROVIDER_IDS = PROVIDER_CATALOG.map(entry => entry.id);

export function catalogEntry(id: string): ProviderCatalogEntry | undefined {
    return PROVIDER_CATALOG.find(entry => entry.id === id);
}
