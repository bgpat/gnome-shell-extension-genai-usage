import Gio from 'gi://Gio';

import { publicError, unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { snapshotFromCodex } from '../../lib/providers/chatgpt/normalize.js';
import { queryCodex } from '../codexAppServer.js';
import { resolveExecutable } from '../executable.js';

export async function refreshChatGpt(options: {
    executablePath: string;
    cancellable: Gio.Cancellable;
    timeoutSec: number;
}): Promise<UsageSnapshot> {
    let executable: string | null;
    try {
        executable = await resolveExecutable(options.executablePath, ['codex'], options.cancellable);
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
