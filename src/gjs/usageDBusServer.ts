import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { snapshotsToJson } from '../lib/snapshotJson.js';
import type { UsageSnapshot } from '../lib/model.js';
import type { RefreshScheduler } from '../shell/refreshScheduler.js';
import { appendLog } from './log.js';
import { runShellSafe, shellErrorText } from './shellSafe.js';

export const USAGE_OBJECT_PATH = '/io/github/bgpat/GenaiUsage/Usage';

const USAGE_INTERFACE_XML = `
<node>
  <interface name="io.github.bgpat.GenaiUsage.Usage">
    <method name="GetSnapshots">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="RefreshAll"/>
    <signal name="Changed">
      <arg type="s" name="json"/>
    </signal>
  </interface>
</node>`;

let exported: Gio.DBusExportedObject | null = null;
let connection: Gio.DBusConnection | null = null;
let scheduler: RefreshScheduler | null = null;

const dbusImpl = {
    GetSnapshots(): string {
        try {
            return snapshotsToJson(scheduler?.snapshots() ?? new Map());
        } catch (error) {
            appendLog('error', `GetSnapshots failed: ${shellErrorText(error)}`, 'background');
            return snapshotsToJson(new Map());
        }
    },
    RefreshAll(): void {
        runShellSafe('D-Bus RefreshAll', () => scheduler?.refreshAllAsync(true), 'user');
    },
};

export function bindUsageScheduler(next: RefreshScheduler | null): void {
    scheduler = next;
}

export function emitUsageSnapshotsChanged(snapshots: ReadonlyMap<string, UsageSnapshot>): void {
    if (!exported || !connection)
        return;
    runShellSafe('Usage Changed signal', () => {
        exported!.emit_signal(
            'Changed',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GIR duplicate GLib paths
            new GLib.Variant('(s)', [snapshotsToJson(snapshots)]) as any,
        );
    });
}

export function attachUsageService(conn: Gio.DBusConnection): void {
    if (exported)
        return;
    exported = Gio.DBusExportedObject.wrapJSObject(USAGE_INTERFACE_XML, dbusImpl);
    connection = conn;
    exported.export(conn, USAGE_OBJECT_PATH);
}

export function detachUsageService(): void {
    if (exported && connection) {
        try {
            exported.unexport();
        } catch {
            // Already gone.
        }
    }
    connection = null;
    exported = null;
}
