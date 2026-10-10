import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { logText } from './logStore.js';
import { attachUsageService, detachUsageService } from './usageDBusServer.js';

export const LOG_BUS_NAME = 'io.github.bgpat.GenaiUsage';
export const LOG_OBJECT_PATH = '/io/github/bgpat/GenaiUsage/Log';

const LOG_INTERFACE_XML = `
<node>
  <interface name="io.github.bgpat.GenaiUsage.Log">
    <method name="GetLog">
      <arg type="s" direction="out" name="text"/>
    </method>
    <method name="AppendLog">
      <arg type="s" direction="in" name="level"/>
      <arg type="s" direction="in" name="kind"/>
      <arg type="s" direction="in" name="message"/>
    </method>
    <signal name="Changed">
      <arg type="s" name="text"/>
    </signal>
  </interface>
</node>`;

let exported: Gio.DBusExportedObject | null = null;
let busOwnerId = 0;
let connection: Gio.DBusConnection | null = null;
let appendHandler: ((level: string, kind: string, message: string) => void) | null = null;

const dbusImpl = {
    GetLog(): string {
        return logText();
    },
    AppendLog(level: string, kind: string, message: string): void {
        appendHandler?.(level, kind, message);
    },
};

export function setLogAppendHandler(
    handler: (level: string, kind: string, message: string) => void,
): void {
    appendHandler = handler;
}

export function emitLogChanged(fullText: string): void {
    if (!exported || !connection)
        return;
    try {
        exported.emit_signal(
            'Changed',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GIR duplicate GLib paths
            new GLib.Variant('(s)', [fullText]) as any,
        );
    } catch {
        // The settings window may not be listening.
    }
}

export function startLogService(): void {
    if (busOwnerId !== 0)
        return;
    exported = Gio.DBusExportedObject.wrapJSObject(LOG_INTERFACE_XML, dbusImpl);
    busOwnerId = Gio.bus_own_name(
        Gio.BusType.SESSION,
        LOG_BUS_NAME,
        Gio.BusNameOwnerFlags.ALLOW_REPLACEMENT,
        (conn, _name) => {
            connection = conn;
            exported?.export(conn, LOG_OBJECT_PATH);
            attachUsageService(conn);
        },
        (_conn, _name) => {
            detachUsageService();
            connection = null;
        },
        () => {
            detachUsageService();
            connection = null;
        },
    );
}

export function stopLogService(): void {
    detachUsageService();
    if (busOwnerId !== 0) {
        Gio.bus_unown_name(busOwnerId);
        busOwnerId = 0;
    }
    connection = null;
    exported = null;
}
