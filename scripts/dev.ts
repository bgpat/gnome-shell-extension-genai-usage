import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const uuid = 'genai-usage@bgpat.github.io';

const packed = spawnSync('bun', ['scripts/pack.ts'], { cwd: root, stdio: 'inherit' });
if (packed.status !== 0)
    process.exit(packed.status ?? 1);

const work = mkdtempSync(join(tmpdir(), 'genai-usage-nested-'));
const data = join(work, 'data');
const config = join(work, 'config');
const dest = join(data, 'gnome-shell', 'extensions', uuid);
mkdirSync(dest, { recursive: true });
mkdirSync(config, { recursive: true });

const realConfig = process.env.XDG_CONFIG_HOME?.startsWith('/')
    ? process.env.XDG_CONFIG_HOME
    : join(homedir(), '.config');
for (const name of ['cursor', 'Cursor']) {
    const source = join(realConfig, name);
    if (existsSync(source))
        symlinkSync(source, join(config, name));
}

const unzipped = spawnSync('unzip', ['-q', '-o', join(root, `${uuid}.zip`), '-d', dest], {
    stdio: 'inherit',
});
if (unzipped.status !== 0)
    process.exit(unzipped.status ?? 1);

const session = join(work, 'session.sh');
writeFileSync(session, `#!/bin/sh
set -eu
export MUTTER_DEBUG_DUMMY_MODE_SPECS=\${MUTTER_DEBUG_DUMMY_MODE_SPECS:-1920x1080}
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['${uuid}']"
case "\${GENAI_COLOR_SCHEME:-}" in
  default|prefer-dark|prefer-light)
    gsettings set org.gnome.desktop.interface color-scheme "$GENAI_COLOR_SCHEME"
    ;;
  '')
    ;;
  *)
    echo "GENAI_COLOR_SCHEME must be default, prefer-dark, or prefer-light" >&2
    exit 1
    ;;
esac
exec gnome-shell --nested --wayland
`);
chmodSync(session, 0o755);

const nested = spawnSync('dbus-run-session', ['--', session], {
    cwd: root,
    stdio: 'inherit',
    env: {
        ...process.env,
        XDG_DATA_HOME: data,
        XDG_CONFIG_HOME: config,
    },
});
process.exit(nested.status ?? 1);
