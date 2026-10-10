import { echoToConsole, formatLine, type LogKind, type LogLevel } from './logFormat.js';
import { appendLogLine } from './logStore.js';

export function appendLogInShell(level: LogLevel, message: string, kind: LogKind): void {
    echoToConsole(level, message);
    appendLogLine(formatLine(level, kind, message));
}
