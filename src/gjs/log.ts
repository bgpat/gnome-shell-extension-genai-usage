import { LOG_MAX_BYTES, trimLog } from '../lib/logRetention.js';

export { LOG_MAX_BYTES, trimLog };
export type { LogKind, LogLevel } from './logFormat.js';

import { logLevelAtLeast, type LogLevel } from '../lib/logLevel.js';
import type { LogKind } from './logFormat.js';
import { echoToConsole } from './logFormat.js';
import { appendLogInShell } from './logCore.js';
import {
    appendLogOnShell,
    disconnectLogClient,
    prefsLogText,
    refreshLogFromShell,
    subscribePrefsLog,
} from './logDBusClient.js';
import { disconnectUsageClient } from './usageDBusClient.js';
import { emitLogChanged, setLogAppendHandler } from './logDBusServer.js';
import { logText, subscribeLogStore } from './logStore.js';

let prefsMode = false;
let minLogLevel: LogLevel = 'error';

export function syncMinLogLevelFromSettings(settings: { logLevel: LogLevel }): void {
    minLogLevel = settings.logLevel;
}

function shouldRecordLog(level: LogLevel): boolean {
    return logLevelAtLeast(level, minLogLevel);
}

function appendInShellAndNotify(level: LogLevel, message: string, kind: LogKind): void {
    appendLogInShell(level, message, kind);
    emitLogChanged(logText());
}

/** Wire D-Bus append requests to the Shell log store (call before {@link startLogService}). */
export function registerShellLogDBus(): void {
    setLogAppendHandler((level, kind, message) => {
        const parsedLevel = level as LogLevel;
        if (!shouldRecordLog(parsedLevel))
            return;
        appendInShellAndNotify(
            parsedLevel,
            message,
            kind as LogKind,
        );
    });
}

/** Preferences process: log lives in GNOME Shell and is fetched over D-Bus. */
export function initLogForPreferences(): void {
    prefsMode = true;
    refreshLogFromShell();
}

export function teardownLogPreferences(): void {
    disconnectLogClient();
    disconnectUsageClient();
    prefsMode = false;
}

/** Append one line. Always pass an explicit {@link LogLevel}. */
export function appendLog(level: LogLevel, message: string, kind: LogKind = 'background'): void {
    if (!shouldRecordLog(level))
        return;
    if (prefsMode) {
        echoToConsole(level, message);
        if (!appendLogOnShell(level, message, kind))
            return;
        refreshLogFromShell();
        return;
    }
    appendInShellAndNotify(level, message, kind);
}

/** Subscribe to log updates in this process. */
export function subscribeLog(listener: () => void): () => void {
    if (prefsMode)
        return subscribePrefsLog(listener);
    return subscribeLogStore(listener);
}

/** Full log text for the Log tab (Shell store or prefs mirror). */
export function readLog(): string {
    if (prefsMode)
        return prefsLogText();
    return logText();
}

export { refreshLogFromShell };
