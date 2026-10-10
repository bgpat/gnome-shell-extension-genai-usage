import { describe, expect, test } from 'bun:test';

import { logLevelAtLeast, parseLogLevel } from '../src/lib/logLevel.ts';

describe('log level', () => {
    test('parseLogLevel defaults invalid values to error', () => {
        expect(parseLogLevel('error')).toBe('error');
        expect(parseLogLevel('nope')).toBe('error');
    });

    test('logLevelAtLeast compares severity', () => {
        expect(logLevelAtLeast('error', 'error')).toBe(true);
        expect(logLevelAtLeast('warn', 'error')).toBe(false);
        expect(logLevelAtLeast('info', 'warn')).toBe(false);
        expect(logLevelAtLeast('warn', 'info')).toBe(true);
        expect(logLevelAtLeast('debug', 'debug')).toBe(true);
    });
});
