import { describe, expect, test } from 'bun:test';

import { insideRoundedRect } from '../src/lib/roundedRect.js';

describe('insideRoundedRect', () => {
    test('includes the center and excludes sharp corners', () => {
        const w = 100;
        const h = 100;
        const r = 20;
        expect(insideRoundedRect(50, 50, w, h, r)).toBe(true);
        expect(insideRoundedRect(0, 0, w, h, r)).toBe(false);
        expect(insideRoundedRect(99, 99, w, h, r)).toBe(false);
        expect(insideRoundedRect(10, 10, w, h, r)).toBe(true);
    });
});
