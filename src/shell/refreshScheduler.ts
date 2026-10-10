import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { formatRemaining } from '../lib/format.js';
import type { UsageSnapshot } from '../lib/model.js';
import { selectQuota } from '../lib/quota.js';
import { terminateCodexProcesses } from '../gjs/codexAppServer.js';
import { refreshProvider } from '../gjs/providers/registry.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { appendLog } from '../gjs/log.js';
import { terminateTrackedProcesses } from '../gjs/subprocess.js';

export interface ProviderView {
    snapshot?: UsageSnapshot;
}

export class RefreshScheduler {
    private timer = 0;
    private cancellable = new Gio.Cancellable();
    private readonly views = new Map<string, ProviderView>();
    private readonly failures = new Map<string, number>();
    private readonly nextAt = new Map<string, number>();
    onChange: (() => void) | null = null;

    constructor(private readonly settings: ExtensionSettings) {}

    start(): void {
        this.cancellable = new Gio.Cancellable();
        appendLog('info', 'Refresh scheduler started.', 'background');
        void this.refreshAll(true);
        this.arm();
    }

    stop(): void {
        appendLog('info', 'Refresh scheduler stopped.', 'background');
        this.disarm();
        this.cancellable.cancel();
        terminateTrackedProcesses();
        terminateCodexProcesses();
        this.views.clear();
        this.failures.clear();
        this.nextAt.clear();
        this.onChange = null;
    }

    restart(): void {
        appendLog('debug', 'Refresh scheduler restarted (settings changed).', 'background');
        this.arm();
    }

    /** Re-arm the timer and fetch fresh provider data (Shell is the single source of truth). */
    onSettingsChanged(): void {
        this.restart();
        void this.refreshAll(true);
    }

    view(id: string): ProviderView {
        return this.views.get(id) ?? {};
    }

    snapshots(): Map<string, UsageSnapshot> {
        const map = new Map<string, UsageSnapshot>();
        for (const [id, view] of this.views) {
            if (view.snapshot)
                map.set(id, view.snapshot);
        }
        return map;
    }

    async refreshAll(force: boolean): Promise<void> {
        const enabled = [...this.settings.enabledSet()];
        appendLog(
            'info',
            `Refresh all: force=${force}, providers=[${enabled.join(', ')}]`,
            force ? 'user' : 'background',
        );
        await Promise.all(enabled.map(id => this.refreshOne(id, force)));
        appendLog('debug', 'Refresh all finished.', 'background');
        this.onChange?.();
    }

    async refreshOne(id: string, force: boolean): Promise<void> {
        if (this.cancellable.is_cancelled())
            return;
        const waitUntil = this.nextAt.get(id) ?? 0;
        if (!force && Date.now() < waitUntil) {
            appendLog('debug', `${id} refresh skipped until ${new Date(waitUntil).toISOString()}`, 'background');
            return;
        }
        appendLog('info', `${id} refresh started`, 'background');
        const snapshot = await refreshProvider(id, this.settings, this.cancellable);
        if (this.cancellable.is_cancelled())
            return;
        this.store(id, snapshot);
    }

    private store(id: string, snapshot: UsageSnapshot): void {
        const unavailableReason = snapshot.availability.state === 'unavailable'
            ? snapshot.availability.reason
            : undefined;
        const previous = this.views.get(id)?.snapshot;
        const keepCache = (unavailableReason !== undefined || snapshot.error !== undefined)
            && this.settings.cachedData === 'show'
            && previous?.availability.state === 'available';
        if (keepCache) {
            appendLog('info', `${id} refresh: keeping cached snapshot after failure`, 'background');
        }
        this.views.set(id, {
            snapshot: keepCache ? previous : snapshot,
        });

        const stored = keepCache ? previous! : snapshot;

        if (snapshot.error && unavailableReason === undefined) {
            appendLog('warn', `${id} refresh: ${snapshot.error}`, 'background');
        }

        if (unavailableReason === undefined && stored.availability.state === 'available') {
            const quota = selectQuota(stored.quotas, this.settings.topBarQuota(id));
            const remaining = formatRemaining(quota?.remainingPercent);
            appendLog(
                'info',
                remaining ? `${id} refresh: ok (${remaining})` : `${id} refresh: ok`,
                'background',
            );
            this.failures.set(id, 0);
            this.nextAt.delete(id);
            return;
        }
        if (unavailableReason !== undefined) {
            appendLog('warn', `${id} refresh: ${unavailableReason}`, 'background');
        }
        const fails = (this.failures.get(id) ?? 0) + 1;
        this.failures.set(id, fails);
        const delay = Math.min(this.settings.refreshInterval * 60_000 * 2 ** (fails - 1), 30 * 60_000);
        this.nextAt.set(id, Date.now() + delay);
        appendLog(
            'debug',
            `${id} refresh backoff: ${fails} failure(s), next after ${Math.round(delay / 1000)}s`,
            'background',
        );
    }

    private arm(): void {
        this.disarm();
        if (!this.settings.autoRefresh) {
            appendLog('debug', 'Automatic refresh timer disabled.', 'background');
            return;
        }
        const minutes = this.settings.refreshInterval;
        appendLog('info', `Automatic refresh timer armed (${minutes} min).`, 'background');
        this.timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            minutes * 60,
            () => {
                appendLog('debug', 'Automatic refresh timer fired.', 'background');
                void this.refreshAll(false);
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    private disarm(): void {
        if (this.timer === 0)
            return;
        GLib.source_remove(this.timer);
        this.timer = 0;
        appendLog('debug', 'Automatic refresh timer disarmed.', 'background');
    }
}
