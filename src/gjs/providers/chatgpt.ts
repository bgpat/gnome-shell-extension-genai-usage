import Gio from 'gi://Gio';

import { publicError, unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { chatGptEntry } from '../../lib/providers/catalog.js';
import { snapshotFromCodex } from '../../lib/providers/chatgpt/normalize.js';
import { queryCodex } from '../codexAppServer.js';
import { resolveExecutable } from '../executable.js';
import type { Provider } from './provider.js';

const executableName = 'codex';

export function createChatGptProvider(): Provider {
    return {
        entry: chatGptEntry,
        refresh: (settings, cancellable) => refreshChatGpt({
            executablePath: settings.executablePath(chatGptEntry.id),
            cancellable,
            timeoutSec: 25,
        }),
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

async function refreshChatGpt(options: {
    executablePath: string;
    cancellable: Gio.Cancellable;
    timeoutSec: number;
}): Promise<UsageSnapshot> {
    let executable: string | null;
    try {
        executable = await resolveExecutable(options.executablePath, [executableName], options.cancellable);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return unavailableSnapshot('chatgpt', 'ChatGPT', 'official', publicError(message));
    }
    if (!executable)
        return unavailableSnapshot('chatgpt', 'ChatGPT', 'official', 'Codex CLI was not found');

    try {
        const result = await queryCodex(executable, options.cancellable, options.timeoutSec);
        return snapshotFromCodex(result.account, result.limits, Date.now());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return unavailableSnapshot('chatgpt', 'ChatGPT', 'official', publicError(message));
    }
}
