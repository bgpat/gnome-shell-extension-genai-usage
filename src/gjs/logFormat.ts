import type { LogLevel } from '../lib/logLevel.js';
import { publicError } from '../lib/model.js';

export type { LogLevel };
export type LogKind = 'user' | 'background';

export function formatLine(level: LogLevel, kind: LogKind, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level}] [${kind}] ${publicError(message)}\n`;
}

export function echoToConsole(level: LogLevel, message: string): void {
    const line = `[genai-usage] ${publicError(message)}`;
    if (level === 'error' || level === 'warn')
        console.warn(line);
    else if (level === 'info')
        console.log(line);
}
