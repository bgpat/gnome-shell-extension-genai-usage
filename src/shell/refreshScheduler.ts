import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { UsageSnapshot } from '../lib/model.js';
import { terminateCodexProcesses } from '../gjs/codexAppServer.js';
import { refreshProvider } from '../gjs/providers/registry.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { terminateTrackedProcesses } from '../gjs/subprocess.js';

export interface ProviderView {
    snapshot?: UsageSnapshot;
    error?: string;
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
        void this.refreshAll(true);
        this.arm();
    }

    stop(): void {
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
        this.arm();
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

    clearErrors(): void {
        for (const view of this.views.values())
            view.error = undefined;
        this.onChange?.();
    }

    async refreshAll(force: boolean): Promise<void> {
        const enabled = [...this.settings.enabledSet()];
        await Promise.all(enabled.map(id => this.refreshOne(id, force)));
    }

    async refreshOne(id: string, force: boolean): Promise<void> {
        if (this.cancellable.is_cancelled())
            return;
        if (!force && Date.now() < (this.nextAt.get(id) ?? 0))
            return;
        const snapshot = await refreshProvider(id, this.settings, this.cancellable);
        if (this.cancellable.is_cancelled())
            return;
        this.store(id, snapshot);
        this.onChange?.();
    }

    private store(id: string, snapshot: UsageSnapshot): void {
        const reason = snapshot.error
            ?? (snapshot.availability.state === 'unavailable' ? snapshot.availability.reason : undefined);
        const previous = this.views.get(id)?.snapshot;
        const keepCache = reason !== undefined
            && this.settings.cachedData === 'show'
            && previous?.availability.state === 'available';
        this.views.set(id, {
            snapshot: keepCache ? previous : snapshot,
            error: reason,
        });

        if (reason === undefined && snapshot.availability.state === 'available') {
            this.failures.set(id, 0);
            this.nextAt.delete(id);
            return;
        }
        const fails = (this.failures.get(id) ?? 0) + 1;
        this.failures.set(id, fails);
        const delay = Math.min(this.settings.refreshInterval * 60_000 * 2 ** (fails - 1), 30 * 60_000);
        this.nextAt.set(id, Date.now() + delay);
    }

    private arm(): void {
        this.disarm();
        if (!this.settings.autoRefresh)
            return;
        this.timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            this.settings.refreshInterval * 60,
            () => {
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
    }
}
