import type Gio from 'gi://Gio';

import { publicError, unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { appendLog } from '../log.js';
import type { ExtensionSettings } from '../settings.js';
import { createChatGptProvider } from './chatgpt.js';
import { createCursorProvider } from './cursor.js';
import { createJevProvider } from './jev.js';
import type { Provider } from './provider.js';

export const PROVIDERS: readonly Provider[] = [createChatGptProvider(), createCursorProvider(), createJevProvider()];

export function providerById(id: string): Provider | undefined {
    return PROVIDERS.find(provider => provider.entry.id === id);
}

export async function refreshProvider(
    id: string,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
): Promise<UsageSnapshot> {
    const provider = providerById(id);
    if (!provider) {
        appendLog('warn', `refreshProvider: unknown provider ${id}`, 'background');
        return unavailableSnapshot(id, id, 'official', 'Unknown provider');
    }
    appendLog('debug', `refreshProvider: ${id} begin`, 'background');
    try {
        return await provider.refresh(settings, cancellable);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog('error', `refreshProvider: ${id} threw ${publicError(message)}`, 'background');
        return unavailableSnapshot(id, provider.entry.displayName, 'official', publicError(message));
    } finally {
        appendLog('debug', `refreshProvider: ${id} end`, 'background');
    }
}
