import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { KNOWN_PROVIDER_IDS } from '../src/lib/providers/catalog.js';

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

describe('GSettings schema', () => {
    test('compiles strictly and names provider schemas per id', () => {
        const mainXml = readFileSync(
            join(schemaDir, 'org.gnome.shell.extensions.genai-usage.gschema.xml'),
            'utf8',
        );
        expect(mainXml).toContain('id="org.gnome.shell.extensions.genai-usage"');
        expect(mainXml).toContain('path="/org/gnome/shell/extensions/genai-usage/"');
        expect(mainXml).not.toContain('genai-usage.provider');

        for (const id of KNOWN_PROVIDER_IDS) {
            const filename = `org.gnome.shell.extensions.genai-usage.provider.${id}.gschema.xml`;
            const providerXml = readFileSync(join(schemaDir, filename), 'utf8');
            expect(providerXml).toContain(`id="org.gnome.shell.extensions.genai-usage.provider.${id}"`);
            expect(providerXml).toContain(
                `path="/org/gnome/shell/extensions/genai-usage/providers/${id}/"`,
            );
        }

        const dir = mkdtempSync(join(tmpdir(), 'genai-schema-'));
        try {
            const compiled = spawnSync(
                'glib-compile-schemas',
                ['--strict', '--targetdir', dir, schemaDir],
                { encoding: 'utf8' },
            );
            expect(compiled.status, compiled.stderr).toBe(0);
            const xmlNames = readdirSync(schemaDir).filter(name => name.endsWith('.gschema.xml'));
            expect(xmlNames.length).toBe(1 + KNOWN_PROVIDER_IDS.length);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
