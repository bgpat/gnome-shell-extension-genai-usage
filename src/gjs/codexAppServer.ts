import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { encodeMessage, JsonRpcCollector } from '../lib/jsonrpc.js';
import { publicError } from '../lib/model.js';
import { appendLog } from './log.js';

const tracked = new Set<Gio.Subprocess>();

export function terminateCodexProcesses(): void {
    if (tracked.size > 0)
        appendLog('debug', `Terminating ${tracked.size} Codex app-server process(es).`, 'background');
    for (const proc of tracked) {
        try {
            proc.force_exit();
        } catch {
            // Already exited.
        }
    }
    tracked.clear();
}

function readLine(stream: Gio.DataInputStream, cancellable: Gio.Cancellable): Promise<string | null> {
    return new Promise((resolve, reject) => {
        stream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
            try {
                const [line] = stream.read_line_finish_utf8(result);
                resolve(line);
            } catch (error) {
                reject(error);
            }
        });
    });
}

function writeAll(stream: Gio.OutputStream, text: string, cancellable: Gio.Cancellable): Promise<void> {
    const bytes = new TextEncoder().encode(text);
    return new Promise((resolve, reject) => {
        stream.write_all_async(bytes, GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
            try {
                stream.write_all_finish(result);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function drain(stream: Gio.InputStream, cancellable: Gio.Cancellable): Promise<void> {
    const input = new Gio.DataInputStream({ base_stream: stream });
    try {
        for (;;) {
            const line = await readLine(input, cancellable);
            if (line === null)
                break;
        }
    } catch {
        // The pipe closes when the process exits.
    }
}

async function readUntil(
    stdout: Gio.DataInputStream,
    collector: JsonRpcCollector,
    ids: number[],
    cancellable: Gio.Cancellable,
): Promise<void> {
    while (ids.some(id => !collector.has(id))) {
        const line = await readLine(stdout, cancellable);
        if (line === null)
            return;
        collector.feed(line);
    }
}

export interface CodexAccountRead {
    account: unknown;
    limits: unknown;
}

export async function queryCodex(
    executable: string,
    cancellable: Gio.Cancellable,
    timeoutSec: number,
): Promise<CodexAccountRead> {
    appendLog('info', `Codex app-server starting: ${publicError(executable)}`, 'background');
    const proc = Gio.Subprocess.new(
        [executable, 'app-server'],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    );
    tracked.add(proc);

    const stdin = proc.get_stdin_pipe();
    const stdoutPipe = proc.get_stdout_pipe();
    const stderrPipe = proc.get_stderr_pipe();
    if (!stdin || !stdoutPipe || !stderrPipe)
        throw new Error('Codex app-server pipes were not created');

    const stdout = new Gio.DataInputStream({ base_stream: stdoutPipe });
    void drain(stderrPipe, cancellable);

    let timedOut = false;
    let timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeoutSec, () => {
        timedOut = true;
        timeoutId = 0;
        try {
            proc.force_exit();
        } catch {
            // Already exited.
        }
        return GLib.SOURCE_REMOVE;
    });

    const collector = new JsonRpcCollector();
    const initId = 1;
    const accountId = 2;
    const limitsId = 3;

    try {
        await writeAll(stdin, encodeMessage({
            method: 'initialize',
            id: initId,
            params: {
                clientInfo: {
                    name: 'genai-usage',
                    title: 'GenAI Usage',
                    version: '0.1.0',
                },
                capabilities: null,
            },
        }), cancellable);
        await readUntil(stdout, collector, [initId], cancellable);
        if (timedOut)
            throw new Error('Codex app-server timed out');
        collector.result(initId);
        appendLog('debug', 'Codex app-server initialize complete.', 'background');

        await writeAll(stdin, encodeMessage({ method: 'initialized', params: {} }), cancellable);
        await writeAll(stdin, encodeMessage({
            method: 'account/read',
            id: accountId,
            params: { refreshToken: false },
        }), cancellable);
        await writeAll(stdin, encodeMessage({
            method: 'account/rateLimits/read',
            id: limitsId,
            params: { excludeResetCreditDetails: true },
        }), cancellable);
        await readUntil(stdout, collector, [accountId, limitsId], cancellable);
        if (timedOut)
            throw new Error('Codex app-server timed out');

        appendLog('info', 'Codex app-server account and rate limits read.', 'background');
        return {
            account: collector.result(accountId),
            limits: collector.result(limitsId),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog('error', `Codex app-server failed: ${publicError(message)}`, 'background');
        throw new Error(publicError(message), { cause: error });
    } finally {
        appendLog('debug', 'Codex app-server shutting down.', 'background');
        if (timeoutId !== 0)
            GLib.source_remove(timeoutId);
        try {
            proc.force_exit();
        } catch {
            // Already exited.
        }
        tracked.delete(proc);
    }
}
