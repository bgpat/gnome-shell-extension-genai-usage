import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const uuid = 'genai-usage@bgpat.github.io';
const work = join(tmpdir(), 'genai-usage-prefs-dev');
const data = join(work, 'data');
const config = join(work, 'config');
const dest = join(data, 'gnome-shell', 'extensions', uuid);
const entry = join(root, 'scripts', 'prefs-dev-entry.js');
const shellTypelib = process.env.GENAI_SHELL_TYPELIB_DIR?.startsWith('/')
    ? process.env.GENAI_SHELL_TYPELIB_DIR
    : '/usr/lib/gnome-shell/girepository-1.0';

const packed = spawnSync('bun', ['scripts/pack.ts'], { cwd: root, stdio: 'inherit' });
if (packed.status !== 0)
    process.exit(packed.status ?? 1);

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
mkdirSync(config, { recursive: true });

const realConfig = process.env.XDG_CONFIG_HOME?.startsWith('/')
    ? process.env.XDG_CONFIG_HOME
    : join(homedir(), '.config');
for (const name of ['cursor', 'Cursor']) {
    const source = join(realConfig, name);
    const link = join(config, name);
    if (existsSync(source) && !existsSync(link))
        symlinkSync(source, link);
}

const unzipped = spawnSync('unzip', ['-q', '-o', join(root, `${uuid}.zip`), '-d', dest], {
    stdio: 'inherit',
});
if (unzipped.status !== 0)
    process.exit(unzipped.status ?? 1);

// Direct ZIP extraction bypasses gnome-extensions install, which compiles schemas.
const compiled = spawnSync('glib-compile-schemas', ['--strict', join(dest, 'schemas')], {
    stdio: 'inherit',
});
if (compiled.status !== 0)
    process.exit(compiled.status ?? 1);

chmodSync(entry, 0o755);

if (!existsSync(shellTypelib)) {
    console.error(
        `Missing GNOME Shell typelib directory: ${shellTypelib}`,
    );
    console.error('Set GENAI_SHELL_TYPELIB_DIR to the directory that contains Shew-0.typelib.');
    process.exit(1);
}

const giTypelib = process.env.GI_TYPELIB_PATH
    ? `${shellTypelib}:${process.env.GI_TYPELIB_PATH}`
    : shellTypelib;

console.error('Starting preferences with isolated XDG_DATA_HOME / XDG_CONFIG_HOME.');
console.error(`Extension files: ${dest}`);
console.error('Uses gjs + prefs-dev-entry.js (not gnome-extensions prefs).');

const run = spawnSync('gjs', ['-m', entry, dest], {
    cwd: root,
    stdio: 'inherit',
    env: {
        ...process.env,
        XDG_DATA_HOME: data,
        XDG_CONFIG_HOME: config,
        GI_TYPELIB_PATH: giTypelib,
    },
});
process.exit(run.status ?? 1);
