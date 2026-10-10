import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { LogKind, LogLevel } from './logFormat.js';
import { LOG_BUS_NAME, LOG_OBJECT_PATH } from './logDBusServer.js';

const LOG_INTERFACE = 'io.github.bgpat.GenaiUsage.Log';

let mirror = '';
const listeners = new Set<() => void>();
let proxy: Gio.DBusProxy | null = null;
let signalId = 0;

function notify(): void {
    for (const listener of listeners)
        listener();
}

function setMirror(text: string): void {
    if (text === mirror)
        return;
    mirror = text;
    notify();
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
            LOG_OBJECT_PATH,
            LOG_INTERFACE,
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
            const text = variantString(params.get_child_value(0));
            if (text !== null)
                setMirror(text);
        });
    }
    return proxy;
}

export function refreshLogFromShell(): void {
    const bus = ensureProxy();
    if (!bus) {
        setMirror('');
        return;
    }
    try {
        const variant = bus.call_sync(
            'GetLog',
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        setMirror(variantString(variant.get_child_value(0)) ?? '');
    } catch {
        setMirror('');
    }
}

export function appendLogOnShell(level: LogLevel, message: string, kind: LogKind): boolean {
    const bus = ensureProxy();
    if (!bus)
        return false;
    try {
        bus.call_sync(
            'AppendLog',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GIR duplicate GLib paths
            new GLib.Variant('(sss)', [level, kind, message]) as any,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
        );
        return true;
    } catch {
        return false;
    }
}

export function prefsLogText(): string {
    return mirror;
}

export function subscribePrefsLog(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function variantString(value: GLib.Variant): string | null {
    const raw = value.get_string();
    if (raw === null)
        return null;
    return Array.isArray(raw) ? raw[0] : raw;
}

export function disconnectLogClient(): void {
    if (proxy && signalId !== 0) {
        proxy.disconnect(signalId);
        signalId = 0;
    }
    proxy = null;
}
