import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import { appendLog } from './log.js';

const DEFAULT_USER_AGENT =
    'GenAI-Usage-GNOME-Extension/1.0 (+https://github.com/bgpat/gnome-shell-extension-genai-usage)';

export interface HttpResponse {
    status: number;
    body: string;
    contentType?: string;
    bytes: GLib.Bytes;
}

export function httpGet(options: {
    url: string;
    headers?: Record<string, string>;
    timeoutSec: number;
    cancellable: Gio.Cancellable;
}): Promise<HttpResponse> {
    const session = new Soup.Session({ timeout: options.timeoutSec });
    const message = Soup.Message.new('GET', options.url);
    if (!message)
        return Promise.reject(new Error('Could not create HTTP request'));
    const headers = { 'User-Agent': DEFAULT_USER_AGENT, ...options.headers };
    for (const [name, value] of Object.entries(headers))
        message.request_headers.append(name, value);

    appendLog('debug', `HTTP GET ${options.url}`, 'background');

    return new Promise((resolve, reject) => {
        // @girs/gnome-shell and @girs/soup-3.0 can pull different @girs/gio-2.0 copies; GJS object is the same at runtime.
        const cancellable = options.cancellable as unknown as Parameters<Soup.Session['send_and_read_async']>[2];
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                const content = message.get_response_headers()?.get_content_type();
                const status = message.get_status();
                const level = status >= 400 ? 'warn' : 'info';
                appendLog(
                    level,
                    `HTTP GET ${options.url} → ${status} (${bytes.get_size()} bytes)`,
                    'background',
                );
                resolve({
                    status,
                    body: new TextDecoder().decode(bytes.toArray()),
                    contentType: content?.[0] ?? undefined,
                    bytes,
                });
            } catch (error) {
                const messageText = error instanceof Error ? error.message : String(error);
                appendLog('error', `HTTP GET ${options.url} failed: ${messageText}`, 'background');
                reject(error);
            }
        });
    });
}
