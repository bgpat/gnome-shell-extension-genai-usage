import { isRecord } from './model.js';

export interface JsonRpcError {
    code?: number;
    message?: string;
}

export interface JsonRpcIncoming {
    id?: number;
    result?: unknown;
    error?: JsonRpcError;
    method?: string;
}

export function encodeMessage(message: object): string {
    return `${JSON.stringify(message)}\n`;
}

export function parseJsonLine(line: string): JsonRpcIncoming | undefined {
    const trimmed = line.trim();
    if (trimmed === '')
        return undefined;
    const value: unknown = JSON.parse(trimmed);
    if (!isRecord(value))
        return undefined;
    const incoming: JsonRpcIncoming = {};
    if (typeof value['id'] === 'number')
        incoming.id = value['id'];
    if ('result' in value)
        incoming.result = value['result'];
    if (isRecord(value['error'])) {
        const error = value['error'];
        incoming.error = {
            code: typeof error['code'] === 'number' ? error['code'] : undefined,
            message: typeof error['message'] === 'string' ? error['message'] : undefined,
        };
    }
    if (typeof value['method'] === 'string')
        incoming.method = value['method'];
    return incoming;
}

export class JsonRpcCollector {
    private readonly messages = new Map<number, JsonRpcIncoming>();

    feed(line: string): void {
        const message = parseJsonLine(line);
        if (!message || message.id === undefined)
            return;
        this.messages.set(message.id, message);
    }

    has(id: number): boolean {
        return this.messages.has(id);
    }

    get(id: number): JsonRpcIncoming | undefined {
        return this.messages.get(id);
    }

    result(id: number): unknown {
        const message = this.messages.get(id);
        if (!message)
            throw new Error(`Missing JSON-RPC response ${id}`);
        if (message.error)
            throw new Error(message.error.message || `JSON-RPC error ${id}`);
        return message.result;
    }
}
