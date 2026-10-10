import { describe, expect, test } from 'bun:test';

import { shellErrorText } from '../src/lib/shellError.js';

describe('shellSafe', () => {
    test('shellErrorText stringifies errors', () => {
        expect(shellErrorText(new Error('boom'))).toBe('boom');
        expect(shellErrorText('plain')).toBe('plain');
    });
});
