import { googleFaviconUrl } from '../../googleFaviconUrl.js';
import type { Provider } from '../provider.js';

const loadRuntime = () => import('../../../gjs/providers/jev.js');

export function createJevProvider(): Provider {
    const id = 'jev';
    return {
        id,
        displayName: 'Jev',
        defaultIconUrl: googleFaviconUrl('https://console.typesafe.ai'),
        showsCreditBalance: true,
        requiresUnofficial: true,
        refresh: async (settings, cancellable) => {
            const { refreshJev } = await loadRuntime();
            return refreshJev(settings.allowUnofficial(id), cancellable);
        },
        preferences: {
            columnHeaderNote: 'Uses a TypeSafe console session to read available credits.',
            emptyQuotaLabel: 'Available credits',
            changeUnofficialSource: async (enable, context) => {
                const { changeJevUsageSource } = await loadRuntime();
                return changeJevUsageSource(enable, context);
            },
        },
    };
}
