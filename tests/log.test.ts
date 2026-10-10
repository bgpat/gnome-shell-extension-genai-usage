import { describe, expect, test } from 'bun:test';

import { LOG_MAX_BYTES, trimLog } from '../src/lib/logRetention.ts';

describe('log retention', () => {
    test('caps total size', () => {
        const line = `${'x'.repeat(100)}\n`;
        const text = line.repeat(1000);
        expect(trimLog(text).length).toBeLessThanOrEqual(LOG_MAX_BYTES);
    });

    test('keeps the newest tail when trimming', () => {
        const text = `${'a'.repeat(LOG_MAX_BYTES - 10)}TAIL\n`;
        expect(trimLog(text).endsWith('TAIL\n')).toBe(true);
    });
});
