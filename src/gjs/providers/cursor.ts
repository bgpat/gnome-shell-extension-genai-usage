import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { isRecord, publicError, unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import type { QuotaMode } from '../../lib/providers/catalog.js';
import {
    mergeCursorFailure,
    quotaOptionsFromSummary,
    snapshotFromOfficial,
    snapshotFromUsageSummary,
} from '../../lib/providers/cursor/normalize.js';
import {
    cookieHeader,
    decodeSqliteToken,
    sessionFromAccessToken,
    tokenFromAuthJson,
} from '../../lib/providers/cursor/session.js';
import { resolveExecutable } from '../executable.js';
import { configHome, fileExists, readFileText } from '../files.js';
import { httpGet } from '../http.js';
import { runProcess } from '../subprocess.js';

async function readJsonCommand(
    argv: string[],
    cancellable: Gio.Cancellable,
    timeoutSec: number,
): Promise<unknown> {
    const result = await runProcess({ argv, timeoutSec, cancellable });
    if (result.timedOut)
        throw new Error(`${argv[0] ?? 'command'} timed out`);
    if (result.exitCode !== 0 && result.stdout.trim() === '')
        throw new Error(publicError(result.stderr.trim() || 'Cursor CLI failed'));
    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        throw new Error('Cursor CLI did not return JSON');
    }
    if (!isRecord(parsed))
        throw new Error('Cursor CLI JSON was not an object');
    return parsed;
}

async function localAccessToken(cancellable: Gio.Cancellable): Promise<string | undefined> {
    const home = configHome();
    const dbPath = GLib.build_filenamev([home, 'Cursor', 'User', 'globalStorage', 'state.vscdb']);
    const db = Gio.File.new_for_path(dbPath);
    if (await fileExists(db, cancellable)) {
        try {
            const sqlite = await resolveExecutable('', ['sqlite3'], cancellable);
            if (sqlite) {
                const result = await runProcess({
                    argv: [
                        sqlite,
                        '-readonly',
                        '-batch',
                        '-noheader',
                        dbPath,
                        "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1",
                    ],
                    timeoutSec: 10,
                    cancellable,
                });
                if (!result.timedOut && result.exitCode === 0) {
                    const token = decodeSqliteToken(result.stdout);
                    if (token)
                        return token;
                }
            }
        } catch {
            // Fall through to the CLI auth file.
        }
    }

    const authFile = Gio.File.new_for_path(GLib.build_filenamev([home, 'cursor', 'auth.json']));
    const text = await readFileText(authFile, cancellable);
    if (!text)
        return undefined;
    return tokenFromAuthJson(text);
}

async function fetchUsageSummary(token: string, cancellable: Gio.Cancellable): Promise<unknown> {
    const nowSec = Math.floor(Date.now() / 1000);
    const session = sessionFromAccessToken(token, nowSec);
    if (!session)
        throw new Error('Cursor session is missing or expires too soon');
    const response = await httpGet({
        url: 'https://cursor.com/api/usage-summary',
        headers: {
            Accept: 'application/json',
            Cookie: cookieHeader(session),
        },
        timeoutSec: 20,
        cancellable,
    });
    if (response.status === 401 || response.status === 403)
        throw new Error('Cursor rejected the local session. Sign in again.');
    if (response.status !== 200)
        throw new Error(`Cursor usage request failed with HTTP ${response.status}`);
    try {
        return JSON.parse(response.body) as unknown;
    } catch {
        throw new Error('Cursor usage response was not JSON');
    }
}

export async function refreshCursor(options: {
    executablePath: string;
    allowUnofficial: boolean;
    cancellable: Gio.Cancellable;
    timeoutSec: number;
}): Promise<UsageSnapshot> {
    const executable = await resolveExecutable(options.executablePath, ['cursor-agent'], options.cancellable);
    let official: UsageSnapshot;
    if (!executable) {
        official = unavailableSnapshot('cursor', 'Cursor', 'official', 'Cursor CLI was not found');
    } else {
        try {
            const [status, about] = await Promise.all([
                readJsonCommand([executable, 'status', '--format', 'json'], options.cancellable, options.timeoutSec),
                readJsonCommand([executable, 'about', '--format', 'json'], options.cancellable, options.timeoutSec).catch(() => ({})),
            ]);
            official = snapshotFromOfficial(status, about, Date.now());
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            official = unavailableSnapshot('cursor', 'Cursor', 'official', publicError(message));
        }
    }

    if (!options.allowUnofficial)
        return official;

    try {
        const token = await localAccessToken(options.cancellable);
        if (!token)
            return mergeCursorFailure(official, 'No Cursor session was found in the app database or CLI auth file.');
        const summary = await fetchUsageSummary(token, options.cancellable);
        const unofficial = snapshotFromUsageSummary(summary, Date.now(), official.plan);
        if (official.availability.state === 'unavailable' && unofficial.availability.state === 'available')
            return unofficial;
        return {
            ...unofficial,
            plan: unofficial.plan ?? official.plan,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return mergeCursorFailure(official, publicError(message));
    }
}

export async function discoverCursorQuotas(options: {
    allowUnofficial: boolean;
    cancellable: Gio.Cancellable;
}): Promise<QuotaMode[]> {
    if (!options.allowUnofficial)
        return [];
    const token = await localAccessToken(options.cancellable);
    if (!token)
        return [];
    const summary = await fetchUsageSummary(token, options.cancellable);
    return quotaOptionsFromSummary(summary);
}
