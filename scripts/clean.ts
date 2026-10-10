import { rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
for (const name of ['dist', 'build', 'genai-usage@bgpat.github.io.zip'])
    rmSync(join(root, name), { recursive: true, force: true });
