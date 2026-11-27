import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { isRecord, publicError, unavailableSnapshot, type UsageSnapshot } from '../../lib/model.js';
import { cursorEntry, type QuotaMode } from '../../lib/providers/catalog.js';
import {
    mergeCursorFailure,
    quotaModesFromQuotas,
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
import { appendLog } from '../log.js';
import { UNOFFICIAL_SOURCE_SETTING } from '../settings.js';
import { runProcess } from '../subprocess.js';
import type { Provider } from './provider.js';

const executableName = 'cursor-agent';

export function createCursorProvider(): Provider {
    return {
        entry: cursorEntry,
        refresh: (settings, cancellable) => refreshCursor({
            executablePath: settings.executablePath(cursorEntry.id),
            allowUnofficial: settings.allowUnofficial(cursorEntry.id),
            cancellable,
            timeoutSec: 25,
        }),
        preferences: {
            columnHeaderNote: 'Quota details from cursor.com are off until you allow the unofficial source.',
            executablePlaceholder: executableName,
            unofficialQuotas: {
                fromSnapshot: snapshot => quotaModesFromQuotas(snapshot.quotas),
                discover: discoverCursorQuotas,
            },
            changeUnofficialSource: async (enable, { settings, cancellable, applyQuotaModes }) => {
                if (enable) {
                    appendLog('info', 'Services: validating the Cursor unofficial usage source.', 'user');
                    applyQuotaModes(await validateCursorUsageSource(cancellable));
                }
                if (cancellable.is_cancelled())
                    return false;
                if (!settings.set_boolean(UNOFFICIAL_SOURCE_SETTING, enable))
                    throw new Error('The setting could not be saved.');
                return true;
            },
        },
    };
}

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
        noRedirect: true,
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

async function refreshCursor(options: {
    executablePath: string;
    allowUnofficial: boolean;
    cancellable: Gio.Cancellable;
    timeoutSec: number;
}): Promise<UsageSnapshot> {
    const executable = await resolveExecutable(options.executablePath, [executableName], options.cancellable);
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
        const summary = await readCursorUsageSummary(options.cancellable);
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

async function readCursorUsageSummary(cancellable: Gio.Cancellable): Promise<unknown> {
    const token = await localAccessToken(cancellable);
    if (!token)
        throw new Error('No Cursor session was found. Sign in to the Cursor app or CLI.');
    return fetchUsageSummary(token, cancellable);
}

async function validateCursorUsageSource(cancellable: Gio.Cancellable): Promise<QuotaMode[]> {
    const quotas = quotaOptionsFromSummary(await readCursorUsageSummary(cancellable));
    if (quotas.length === 0)
        throw new Error('Cursor did not return any quota data.');
    return quotas;
}

async function discoverCursorQuotas(cancellable: Gio.Cancellable): Promise<QuotaMode[]> {
    const token = await localAccessToken(cancellable);
    if (!token)
        return [];
    const summary = await fetchUsageSummary(token, cancellable);
    return quotaOptionsFromSummary(summary);
}
