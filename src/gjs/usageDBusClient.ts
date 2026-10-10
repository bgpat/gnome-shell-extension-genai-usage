import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { snapshotsFromJson } from '../lib/snapshotJson.js';
import type { UsageSnapshot } from '../lib/model.js';
import { LOG_BUS_NAME } from './logDBusServer.js';
import { USAGE_OBJECT_PATH } from './usageDBusServer.js';

const USAGE_INTERFACE = 'io.github.bgpat.GenaiUsage.Usage';

let proxy: Gio.DBusProxy | null = null;
let signalId = 0;
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners)
        listener();
}

function ensureProxy(): Gio.DBusProxy | null {
    if (proxy)
        return proxy;
    try {
        proxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            LOG_BUS_NAME,
            USAGE_OBJECT_PATH,
            USAGE_INTERFACE,
            null,
        );
    } catch {
        proxy = null;
        return null;
    }
    if (signalId === 0) {
        signalId = proxy.connect('g-signal', (_p, sender, name, params) => {
            if (sender !== LOG_BUS_NAME || name !== 'Changed')
                return;
            notify();
        });
    }
    return proxy;
}

export function shellSnapshotsAvailable(): boolean {
    return ensureProxy() !== null;
}

export function snapshotsFromShell(): Map<string, UsageSnapshot> {
    const bus = ensureProxy();
    if (!bus)
        return new Map();
    try {
        const variant = bus.call_sync(
            'GetSnapshots',
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        const json = variantString(variant.get_child_value(0)) ?? '';
        return snapshotsFromJson(json);
    } catch {
        return new Map();
    }
}

export function requestShellRefresh(): boolean {
    const bus = ensureProxy();
    if (!bus)
        return false;
    try {
        bus.call_sync(
            'RefreshAll',
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        return true;
    } catch {
        return false;
    }
}

export function subscribeShellSnapshots(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function disconnectUsageClient(): void {
    if (proxy && signalId !== 0) {
        proxy.disconnect(signalId);
        signalId = 0;
    }
    proxy = null;
    listeners.clear();
}

function variantString(value: GLib.Variant): string | null {
    const raw = value.get_string();
    if (raw === null)
        return null;
    return Array.isArray(raw) ? raw[0] : raw;
}
