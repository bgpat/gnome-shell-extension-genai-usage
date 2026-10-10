import { describe, expect, test } from 'bun:test';

import { encodeMessage, JsonRpcCollector, parseJsonLine } from '../src/lib/jsonrpc.js';

describe('JSON-RPC framing', () => {
    test('matches responses by id and ignores notifications', () => {
        const collector = new JsonRpcCollector();
        collector.feed(encodeMessage({ method: 'account/updated', params: { authMode: 'chatgpt' } }));
        collector.feed(encodeMessage({ id: 2, result: { account: { type: 'chatgpt', planType: 'plus' }, requiresOpenaiAuth: false } }));
        collector.feed(encodeMessage({ id: 3, error: { code: 1, message: 'not ready' } }));
        expect(parseJsonLine('')?.id).toBeUndefined();
        expect(collector.result(2)).toEqual({
            account: { type: 'chatgpt', planType: 'plus' },
            requiresOpenaiAuth: false,
        });
        expect(() => collector.result(3)).toThrow('not ready');
        expect(() => collector.result(9)).toThrow('Missing JSON-RPC response 9');
    });
});
