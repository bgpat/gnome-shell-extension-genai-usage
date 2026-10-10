import { describe, expect, test } from 'bun:test';

import { placeProvider, type LayoutState } from '../src/lib/layout.js';
import { previewOrder, reorderTarget, type PillBound } from '../src/lib/barReorder.js';

const bounds: PillBound[] = [
    { id: 'chatgpt', x: 0, width: 100 },
    { id: 'cursor', x: 108, width: 100 },
];
const enabled = new Set(['chatgpt', 'cursor']);
const state: LayoutState = { order: ['chatgpt', 'cursor'], hidden: [] };

describe('reorderTarget', () => {
    test('does not swap until the pointer is inside the neighbor box', () => {
        const order = ['chatgpt', 'cursor'] as const;
        expect(reorderTarget(bounds, 'chatgpt', 0, 50, order)).toBeNull();
        expect(reorderTarget(bounds, 'chatgpt', 0, 105, order)).toBeNull();
        expect(reorderTarget(bounds, 'cursor', 1, 160, order)).toBeNull();
        expect(reorderTarget(bounds, 'cursor', 1, 104, order)).toBeNull();
    });

    test('swaps once the pointer is inside the neighbor box', () => {
        const order = ['chatgpt', 'cursor'] as const;
        expect(reorderTarget(bounds, 'chatgpt', 0, 140, order)).toBe(1);
        expect(reorderTarget(bounds, 'cursor', 1, 70, order)).toBe(0);
    });

    test('previewOrder keeps a swap until the pointer leaves the neighbor', () => {
        const swapped = ['cursor', 'chatgpt'];
        expect(previewOrder(bounds, 'chatgpt', 140, ['chatgpt', 'cursor'])).toEqual(swapped);
        expect(previewOrder(bounds, 'chatgpt', 120, swapped)).toEqual(swapped);
        expect(previewOrder(bounds, 'chatgpt', 100, swapped)).toEqual(['chatgpt', 'cursor']);
        expect(previewOrder(bounds, 'cursor', 70, ['chatgpt', 'cursor'])).toEqual(swapped);
        expect(previewOrder(bounds, 'cursor', 90, swapped)).toEqual(swapped);
        expect(previewOrder(bounds, 'cursor', 110, swapped)).toEqual(['chatgpt', 'cursor']);
    });

    test('placeProvider applies that index to the visible order', () => {
        const target = reorderTarget(bounds, 'cursor', 1, 70, ['chatgpt', 'cursor']);
        expect(target).toBe(0);
        const next = placeProvider(state, enabled, 'cursor', 'visible', target!);
        expect(next.order).toEqual(['cursor', 'chatgpt']);
    });
});
