import { trimLog } from '../lib/logRetention.js';

let text = '';
const listeners = new Set<() => void>();

export function logText(): string {
    return text;
}

export function setLogText(next: string): void {
    text = trimLog(next);
    for (const listener of listeners)
        listener();
}

export function appendLogLine(line: string): void {
    setLogText(text + line);
}

export function subscribeLogStore(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
