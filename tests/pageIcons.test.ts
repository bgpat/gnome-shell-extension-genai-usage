import { describe, expect, test } from 'bun:test';

import {
    PREFS_GENERAL_ICON,
    PREFS_LOG_ICON,
    PREFS_SERVICES_ICON,
} from '../src/prefs/pageIcons.js';

const TAB_ICONS = [PREFS_GENERAL_ICON, PREFS_SERVICES_ICON, PREFS_LOG_ICON];

describe('preferences tab icons', () => {
    test('uses Adwaita theme names only (no bundled custom icons)', () => {
        for (const name of TAB_ICONS) {
            expect(name.endsWith('-symbolic')).toBe(true);
            expect(name.startsWith('genai-')).toBe(false);
            expect(name.includes('/')).toBe(false);
            expect(name.startsWith('view-')).toBe(true);
        }
    });

    test('tab icons are distinct', () => {
        expect(new Set(TAB_ICONS).size).toBe(TAB_ICONS.length);
    });
});
