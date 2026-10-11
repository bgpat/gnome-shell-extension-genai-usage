import { existsSync } from 'node:fs';
import { join } from 'node:path';

const EXTENSIONS_URL = 'https://extensions.gnome.org';
const LOGIN_URL = `${EXTENSIONS_URL}/api/v1/accounts/login/`;
const UPLOAD_URL = `${EXTENSIONS_URL}/api/v1/extensions`;
const DEFAULT_ZIP = 'genai-usage@bgpat.github.io.zip';

function credentials(): { username: string; password: string } {
    const username = process.env.EGO_USERNAME ?? process.env.GNOME_USERNAME;
    const password = process.env.EGO_PASSWORD ?? process.env.GNOME_PASSWORD;
    if (!username || !password) {
        console.error('Set EGO_USERNAME and EGO_PASSWORD (or GNOME_USERNAME / GNOME_PASSWORD).');
        process.exit(1);
    }
    return { username, password };
}

async function login(username: string, password: string): Promise<string> {
    const body = new URLSearchParams({ login: username, password });
    const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body,
    });
    const json = await res.json() as { token?: { token?: string }; detail?: string };
    if (!res.ok) {
        console.error(`EGO login failed (HTTP ${res.status}): ${json.detail ?? 'unknown error'}`);
        process.exit(1);
    }
    const token = json.token?.token;
    if (!token) {
        console.error('EGO login response did not include a token.');
        process.exit(1);
    }
    return token;
}

async function upload(token: string, zipPath: string): Promise<void> {
    const form = new FormData();
    form.append('source', Bun.file(zipPath));
    form.append('shell_license_compliant', 'true');
    form.append('tos_compliant', 'true');

    const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
        body: form,
    });
    const text = await res.text();
    let detail = text;
    try {
        const json = JSON.parse(text) as { detail?: string };
        detail = json.detail ?? text;
    } catch {
        // plain text body
    }
    if (res.status !== 201) {
        console.error(`EGO upload failed (HTTP ${res.status}): ${detail}`);
        process.exit(1);
    }
    console.log('Extension submitted to extensions.gnome.org (pending review).');
}

const root = join(import.meta.dir, '..');
const zipArg = process.argv[2];
const zipPath = zipArg ? join(root, zipArg) : join(root, DEFAULT_ZIP);

if (!existsSync(zipPath)) {
    console.error(`Zip not found: ${zipPath}`);
    process.exit(1);
}

const { username, password } = credentials();
const token = await login(username, password);
await upload(token, zipPath);
