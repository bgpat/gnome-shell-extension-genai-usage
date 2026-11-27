import { googleFaviconUrl } from '../../googleFaviconUrl.js';
import type { Provider } from '../provider.js';
import { quotaModesFromQuotas } from './normalize.js';

const loadRuntime = () => import('../../../gjs/providers/cursor.js');

const executableName = 'cursor-agent';

export function createCursorProvider(): Provider {
    const id = 'cursor';
    return {
        id,
        displayName: 'Cursor',
        defaultIconUrl: googleFaviconUrl('https://cursor.com'),
        refresh: async (settings, cancellable) => {
            const { refreshCursor } = await loadRuntime();
            return refreshCursor({
                executablePath: settings.executablePath(id),
                executableName,
                allowUnofficial: settings.allowUnofficial(id),
                cancellable,
                timeoutSec: 25,
            });
        },
        preferences: {
            columnHeaderNote: 'Quota details from cursor.com are off until you allow the unofficial source.',
            executablePlaceholder: executableName,
            unofficialQuotas: {
                fromSnapshot: snapshot => quotaModesFromQuotas(snapshot.quotas),
                discover: async cancellable => {
                    const { discoverCursorQuotas } = await loadRuntime();
                    return discoverCursorQuotas(cancellable);
                },
            },
            changeUnofficialSource: async (enable, context) => {
                const { changeCursorUsageSource } = await loadRuntime();
                return changeCursorUsageSource(enable, context);
            },
        },
    };
}
