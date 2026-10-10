import Gio from 'gi://Gio';

import { publicError, unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { catalogEntry, PROVIDER_CATALOG } from '../../lib/providers/catalog.js';
import { appendLog } from '../log.js';
import type { ExtensionSettings } from '../settings.js';
import { refreshChatGpt } from './chatgpt.js';
import { refreshCursor } from './cursor.js';

export { PROVIDER_CATALOG, catalogEntry };

export async function refreshProvider(
    id: string,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
): Promise<UsageSnapshot> {
    const entry = catalogEntry(id);
    if (!entry) {
        appendLog('warn', `refreshProvider: unknown provider ${id}`, 'background');
        return unavailableSnapshot(id, id, 'official', 'Unknown provider');
    }
    appendLog('debug', `refreshProvider: ${id} begin`, 'background');
    try {
        if (id === 'chatgpt') {
            return await refreshChatGpt({
                executablePath: settings.executablePath(id),
                cancellable,
                timeoutSec: 25,
            });
        }
        if (id === 'cursor') {
            return await refreshCursor({
                executablePath: settings.executablePath(id),
                allowUnofficial: settings.allowUnofficial(id),
                cancellable,
                timeoutSec: 25,
            });
        }
        appendLog('warn', `refreshProvider: ${id} not implemented`, 'background');
        return unavailableSnapshot(id, entry.displayName, 'official', 'Provider is not implemented');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog('error', `refreshProvider: ${id} threw ${publicError(message)}`, 'background');
        return unavailableSnapshot(id, entry.displayName, 'official', publicError(message));
    } finally {
        appendLog('debug', `refreshProvider: ${id} end`, 'background');
    }
}
