import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { appendLog } from './log.js';
import { publicError } from '../lib/model.js';

const tracked = new Set<Gio.Subprocess>();

export function terminateTrackedProcesses(): void {
    for (const proc of tracked) {
        try {
            proc.force_exit();
        } catch {
            // The process has already exited.
        }
    }
    tracked.clear();
}

function track(proc: Gio.Subprocess): void {
    tracked.add(proc);
}

function untrack(proc: Gio.Subprocess): void {
    tracked.delete(proc);
}

export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
}

export function runProcess(options: {
    argv: string[];
    stdin?: string;
    timeoutSec: number;
    cancellable: Gio.Cancellable;
}): Promise<ProcessResult> {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
    if (options.stdin !== undefined)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    const proc = Gio.Subprocess.new(options.argv, flags);
    track(proc);
    appendLog(
        'debug',
        `Subprocess start: ${publicError(options.argv.join(' '))} (timeout ${options.timeoutSec}s)`,
        'background',
    );

    let timedOut = false;
    let timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, options.timeoutSec, () => {
        timedOut = true;
        timeoutId = 0;
        try {
            proc.force_exit();
        } catch {
            // Already exited.
        }
        return GLib.SOURCE_REMOVE;
    });

    const clearTimer = () => {
        if (timeoutId !== 0) {
            GLib.source_remove(timeoutId);
            timeoutId = 0;
        }
    };

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(options.stdin ?? null, options.cancellable, (_source, result) => {
            clearTimer();
            untrack(proc);
            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(result);
                let exitCode: number | null = null;
                if (proc.get_if_exited())
                    exitCode = proc.get_exit_status();
                if (timedOut) {
                    appendLog(
                        'warn',
                        `Subprocess timed out: ${publicError(options.argv[0] ?? 'command')}`,
                        'background',
                    );
                } else {
                    appendLog(
                        'info',
                        `Subprocess finished: ${publicError(options.argv[0] ?? 'command')} exit=${exitCode ?? 'signal'}`,
                        'background',
                    );
                }
                resolve({
                    stdout: stdout ?? '',
                    stderr: stderr ?? '',
                    exitCode,
                    timedOut,
                });
            } catch (error) {
                if (timedOut) {
                    appendLog(
                        'warn',
                        `Subprocess timed out: ${publicError(options.argv[0] ?? 'command')}`,
                        'background',
                    );
                    resolve({ stdout: '', stderr: '', exitCode: null, timedOut: true });
                    return;
                }
                const messageText = error instanceof Error ? error.message : String(error);
                appendLog(
                    'error',
                    `Subprocess failed: ${publicError(options.argv[0] ?? 'command')}: ${publicError(messageText)}`,
                    'background',
                );
                reject(error);
            }
        });
    });
}
