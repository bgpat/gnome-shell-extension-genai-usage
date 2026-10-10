import { describe, expect, test } from 'bun:test';

import {
    PREFS_GENERAL_ICON,
    PREFS_LOG_ICON,
    PREFS_SERVICES_ICON,
} from '../src/prefs/pageIcons.js';

const TAB_ICONS = [PREFS_GENERAL_ICON, PREFS_SERVICES_ICON, PREFS_LOG_ICON];

describe('preferences tab icons', () => {
    test('uses symbolic icon theme names', () => {
        for (const name of TAB_ICONS) {
            expect(name.endsWith('-symbolic')).toBe(true);
            expect(name.includes('/')).toBe(false);
        }
    });

    test('tab icons are distinct', () => {
        expect(new Set(TAB_ICONS).size).toBe(TAB_ICONS.length);
    });
});
