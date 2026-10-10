import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

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
    for (const [name, value] of Object.entries(options.headers ?? {}))
        message.request_headers.append(name, value);

    return new Promise((resolve, reject) => {
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, options.cancellable, (_source, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                const content = message.get_response_headers()?.get_content_type();
                resolve({
                    status: message.get_status(),
                    body: new TextDecoder().decode(bytes.toArray()),
                    contentType: content?.[0] ?? undefined,
                    bytes,
                });
            } catch (error) {
                reject(error);
            }
        });
    });
}
