import { describe, expect, test } from 'bun:test';

import { googleFaviconUrl } from '../src/lib/googleFaviconUrl.js';

describe('googleFaviconUrl', () => {
    test('builds faviconV2 HTTPS URL for a site', () => {
        const url = googleFaviconUrl('https://chatgpt.com');
        expect(url.startsWith('https://t1.gstatic.com/faviconV2?')).toBe(true);
        expect(url).toContain(encodeURIComponent('https://chatgpt.com/'));
        expect(url).toContain('size=128');
    });
});
