import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const build = mkdtempSync(join(tmpdir(), 'genai-usage-pack-'));
const zipName = 'genai-usage@bgpat.github.io.zip';
const zipPath = join(root, zipName);

function removePath(path: string, label: string): void {
    try {
        rmSync(path, { recursive: true, force: true });
    } catch (err) {
        const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
        if (code === 'EACCES') {
            console.error(`${label} ${path} is not writable (often owned by root after Docker or sudo).`);
            console.error(`Fix: sudo chown -R "$(whoami)" ${JSON.stringify(path)}`);
            process.exit(1);
        }
        throw err;
    }
}

const tsc = spawnSync('bun', ['x', 'tsc'], { cwd: root, stdio: 'inherit' });
if (tsc.status !== 0)
    process.exit(tsc.status ?? 1);

cpSync(join(root, 'dist'), build, { recursive: true });
cpSync(join(root, 'schemas'), join(build, 'schemas'), { recursive: true });
cpSync(join(root, 'metadata.json'), join(build, 'metadata.json'));
cpSync(join(root, 'stylesheet.css'), join(build, 'stylesheet.css'));

const compiled = spawnSync('glib-compile-schemas', ['schemas'], { cwd: build, encoding: 'utf8' });
if (compiled.status !== 0) {
    console.error(compiled.stderr);
    process.exit(compiled.status ?? 1);
}

removePath(zipPath, 'Package');
const zipped = spawnSync('zip', ['-r', zipPath, '.'], { cwd: build, encoding: 'utf8' });
if (zipped.status !== 0) {
    console.error(zipped.stderr);
    process.exit(zipped.status ?? 1);
}

const listing = spawnSync('zipinfo', ['-1', zipPath], { encoding: 'utf8' });
if (listing.status !== 0) {
    console.error(listing.stderr);
    process.exit(listing.status ?? 1);
}
const names = listing.stdout.split('\n').filter(name => name !== '');
const forbidden = names.filter(name =>
    name.includes('node_modules')
    || name.endsWith('.ts')
    || name.endsWith('.map')
    || name.endsWith('.md')
    || name.startsWith('src/')
    || name.startsWith('tests/'));
if (forbidden.length > 0) {
    console.error(`Package contains forbidden files:\n${forbidden.join('\n')}`);
    process.exit(1);
}
for (const required of ['extension.js', 'prefs.js', 'metadata.json', 'stylesheet.css']) {
    if (!names.includes(required)) {
        console.error(`Package is missing ${required}`);
        process.exit(1);
    }
}
const metadata = JSON.parse(readFileSync(join(build, 'metadata.json'), 'utf8')) as { uuid?: string };
if (metadata.uuid !== 'genai-usage@bgpat.github.io') {
    console.error('metadata.json uuid is unexpected');
    process.exit(1);
}
const schema = names.find(name => name.endsWith('.gschema.xml'));
if (!schema) {
    console.error('Package is missing the GSettings schema');
    process.exit(1);
}
console.log(`Packed ${names.length} files into ${zipName}`);
