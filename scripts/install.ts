import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const packed = spawnSync('bun', ['scripts/pack.ts'], { cwd: root, stdio: 'inherit' });
if (packed.status !== 0)
    process.exit(packed.status ?? 1);

const installed = spawnSync('gnome-extensions', [
    'install',
    '--force',
    join(root, 'genai-usage@bgpat.github.io.zip'),
], { cwd: root, stdio: 'inherit' });
if (installed.status !== 0)
    process.exit(installed.status ?? 1);

const enabled = spawnSync('gnome-extensions', ['enable', 'genai-usage@bgpat.github.io'], {
    cwd: root,
    stdio: 'inherit',
});
process.exit(enabled.status ?? 1);
