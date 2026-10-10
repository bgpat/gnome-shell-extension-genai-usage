import { describe, expect, test } from 'bun:test';

import { hiddenIds, normalizeLayout, nudge, placeProvider, transfer, visibleIds } from '../src/lib/layout.js';

const known = ['chatgpt', 'cursor'];
const enabled = new Set(known);

describe('layout', () => {
    test('normalizes order and drops unknown providers', () => {
        const state = normalizeLayout(['cursor', 'other', 'chatgpt'], ['cursor'], known);
        expect(state.order).toEqual(['cursor', 'chatgpt']);
        expect(visibleIds(state, enabled)).toEqual(['chatgpt']);
        expect(hiddenIds(state, enabled)).toEqual(['cursor']);
    });

    test('keeps a disabled provider in place while reordering visible ones', () => {
        const state = normalizeLayout(['chatgpt', 'cursor', 'future'], ['cursor'], ['chatgpt', 'cursor', 'future']);
        const onlyChatgpt = new Set(['chatgpt']);
        const moved = nudge(state, onlyChatgpt, 'chatgpt', 1);
        expect(moved.order).toEqual(state.order);
        expect(moved.hidden).toEqual(['cursor']);
    });

    test('moves a provider between visible and hidden without dropping the other', () => {
        const state = normalizeLayout(['chatgpt', 'cursor'], [], known);
        const hidden = transfer(state, enabled, 'chatgpt', 'hidden');
        expect(visibleIds(hidden, enabled)).toEqual(['cursor']);
        expect(hiddenIds(hidden, enabled)).toEqual(['chatgpt']);
        const shown = placeProvider(hidden, enabled, 'chatgpt', 'visible', 0);
        expect(visibleIds(shown, enabled)).toEqual(['chatgpt', 'cursor']);
    });
});
