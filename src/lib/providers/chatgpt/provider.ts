import { googleFaviconUrl } from '../../googleFaviconUrl.js';
import type { Provider } from '../provider.js';

const executableName = 'codex';

export function createChatGptProvider(): Provider {
    const id = 'chatgpt';
    return {
        id,
        displayName: 'ChatGPT',
        defaultIconUrl: googleFaviconUrl('https://chatgpt.com'),
        refresh: async (settings, cancellable) => {
            const { refreshChatGpt } = await import('../../../gjs/providers/chatgpt.js');
            return refreshChatGpt({
                executablePath: settings.executablePath(id),
                executableName,
                cancellable,
                timeoutSec: 25,
            });
        },
        preferences: {
            columnHeaderNote: 'Uses the official Codex app-server and the existing Codex login.',
            executablePlaceholder: executableName,
            quotaModes: [
                { id: 'five-hour', label: 'Five-hour quota' },
                { id: 'weekly', label: 'Weekly quota' },
                { id: 'lowest', label: 'Lowest remaining quota' },
            ],
        },
    };
}
