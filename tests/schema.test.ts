import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const schemaPath = new URL('../schemas/org.gnome.shell.extensions.genai-usage.gschema.xml', import.meta.url);

describe('GSettings schema', () => {
    test('compiles strictly and keeps the provider schema relocatable', () => {
        const xml = readFileSync(schemaPath, 'utf8');
        expect(xml).toContain('id="org.gnome.shell.extensions.genai-usage"');
        expect(xml).toContain('id="org.gnome.shell.extensions.genai-usage.provider"');
        expect(xml).not.toContain('org.gnome.shell.extensions.genai-usage.provider" path=');
        expect(xml).toContain("<default>5</default>");
        expect(xml).toContain("<default>true</default>");
        const dir = mkdtempSync(join(tmpdir(), 'genai-schema-'));
        try {
            const compiled = spawnSync('glib-compile-schemas', ['--strict', '--targetdir', dir, schemaPath.pathname.replace(/\/[^/]+$/, '')], {
                encoding: 'utf8',
            });
            expect(compiled.status, compiled.stderr).toBe(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
