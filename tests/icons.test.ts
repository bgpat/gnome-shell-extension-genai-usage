import { describe, expect, test } from 'bun:test';

import { cacheFileName, effectiveIconUrl, isIconPayload } from '../src/lib/icons.js';

describe('icons', () => {
    test('accepts only https URLs and image payloads', () => {
        expect(effectiveIconUrl('https://cursor.com/favicon.ico', '')).toBe('https://cursor.com/favicon.ico');
        expect(effectiveIconUrl('https://cursor.com/favicon.ico', 'http://example.test/a.png')).toBeUndefined();
        expect(isIconPayload('text/html', 100)).toBe(false);
        expect(isIconPayload('image/png', 100)).toBe(true);
        expect(cacheFileName('cursor', 'https://cursor.com/favicon.ico')).toMatch(/^cursor-[0-9a-f]+$/);
    });
});
