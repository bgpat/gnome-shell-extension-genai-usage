import { describe, expect, test } from 'bun:test';

import {
    brandedWebIconBasename,
    cacheFileName,
    effectiveIconUrl,
    isIconPayload,
    iconDownloadSucceeded,
    isLegacyColoredChatGptSvg,
    normalizeSvgForShellSymbolic,
    shouldRetryIconHttp,
    simplifyCursorOfficialFavicon,
    simpleIconsCdnSvgExtension,
} from '../src/lib/icons.js';
import { googleFaviconUrl } from '../src/lib/googleFaviconUrl.js';
import { catalogEntry, providerIconUrlCandidates } from '../src/lib/providers/catalog.js';

describe('icons', () => {
    test('accepts only https URLs and image payloads', () => {
        expect(effectiveIconUrl('https://cursor.com/apple-touch-icon.png', ''))
            .toBe('https://cursor.com/apple-touch-icon.png');
        expect(effectiveIconUrl('https://cursor.com/apple-touch-icon.png', 'http://example.test/a.png'))
            .toBe('https://cursor.com/apple-touch-icon.png');
        expect(effectiveIconUrl('https://cursor.com/apple-touch-icon.png', 'not-a-url'))
            .toBe('https://cursor.com/apple-touch-icon.png');
        expect(isIconPayload('text/html', 100)).toBe(false);
        expect(isIconPayload('image/png', 100)).toBe(true);
        expect(cacheFileName('cursor', 'https://cursor.com/apple-touch-icon.png')).toMatch(/^cursor-[0-9a-f]+\.png$/);
        expect(cacheFileName('chatgpt', 'https://chatgpt.com/favicon.svg'))
            .toBe('chatgpt-aee8d09b.svg');
        const chatgptOfficial = 'https://chatgpt.com/favicon.svg';
        expect(brandedWebIconBasename('chatgpt', chatgptOfficial)).toBe('chatgpt-aee8d09b.svg');
        expect(simpleIconsCdnSvgExtension('https://cdn.simpleicons.org/cursor')).toBe('.svg');
        expect(cacheFileName('cursor', 'https://cdn.simpleicons.org/cursor')).toBe('cursor-80a5811c.svg');
        expect(brandedWebIconBasename('cursor', 'https://cdn.simpleicons.org/cursor')).toBe('cursor-80a5811c.svg');
        expect(brandedWebIconBasename('cursor', 'https://cursor.com/favicon.svg')).toBe('cursor-6e18370e.svg');
        expect(brandedWebIconBasename('cursor', 'https://example.test/icon', 'https://cdn.simpleicons.org/cursor'))
            .toBe('cursor-49815082.svg');
        expect(normalizeSvgForShellSymbolic('<svg fill="#000000"><path fill="#000000"/></svg>'))
            .toBe('<svg fill="#eeeeee"><path fill="#eeeeee"/></svg>');
        expect(normalizeSvgForShellSymbolic('<svg fill="none"><path fill="none"/></svg>'))
            .toBe('<svg fill="none"><path fill="none"/></svg>');
        expect(normalizeSvgForShellSymbolic('<svg><path d="M0 0"/></svg>'))
            .toBe('<svg><path fill="#eeeeee" d="M0 0"/></svg>');
        expect(isLegacyColoredChatGptSvg('<path fill="#74aa9c"/>')).toBe(true);
        expect(isLegacyColoredChatGptSvg('<svg viewBox="0 0 320 320"><path d=""/></svg>')).toBe(false);
        const cursorTile = '<svg viewBox="0 0 512 512"><path d="m512 325.5z"/><path d="m415.035 156.35-151z"/></svg>';
        expect(simplifyCursorOfficialFavicon(cursorTile)).toBe(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="51 51 410 410"><path d="m415.035 156.35-151z"/></svg>',
        );
        expect(iconDownloadSucceeded(200, 'image/svg+xml', 100)).toBe(true);
        expect(shouldRetryIconHttp(403, 'text/html', 8000)).toBe(true);
        expect(shouldRetryIconHttp(404, 'text/html', 100)).toBe(false);
        expect(shouldRetryIconHttp(200, 'image/png', 100)).toBe(false);
        const chatgpt = catalogEntry('chatgpt');
        expect(chatgpt).toBeDefined();
        expect(providerIconUrlCandidates(chatgpt!, '')).toEqual([
            googleFaviconUrl('https://chatgpt.com'),
        ]);
        expect(providerIconUrlCandidates(catalogEntry('cursor')!, '')).toEqual([
            googleFaviconUrl('https://cursor.com'),
        ]);
        expect(providerIconUrlCandidates(chatgpt!, 'https://example.test/icon.png')).toEqual([
            'https://example.test/icon.png',
        ]);
    });
});
