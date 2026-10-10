import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import type { LogLevel } from '../gjs/log.js';
import { newLogTab } from './preferencesTab.js';
import {
    LOG_MAX_BYTES,
    readLog,
    refreshLogFromShell,
    subscribeLog,
} from '../gjs/log.js';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const LEVEL_IN_LINE = / \[(debug|info|warn|error)\]/;

export function createLogPage(): { page: Adw.PreferencesPage } {
    const page = newLogTab();

    const group = new Adw.PreferencesGroup({
        title: 'Extension log',
        description: `Held in GNOME Shell memory (up to ${Math.round(LOG_MAX_BYTES / 1000)}k characters, oldest dropped first). Closing settings does not erase it; reopen Log to fetch over D-Bus. Lines are color-coded by level. Secrets are redacted.`,
    });

    const buffer = new Gtk.TextBuffer();
    const view = new Gtk.TextView({
        buffer,
        editable: false,
        monospace: true,
        wrap_mode: Gtk.WrapMode.NONE,
        hexpand: true,
        left_margin: 12,
        right_margin: 12,
        top_margin: 8,
        bottom_margin: 8,
    });
    const scrolled = new Gtk.ScrolledWindow({
        min_content_height: 240,
        min_content_width: 320,
        hexpand: true,
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        css_classes: ['genai-log-scrolled'],
    });
    scrolled.propagate_natural_height = false;
    scrolled.propagate_natural_width = false;
    scrolled.child = view;
    group.add(scrolled);
    page.add(group);

    ensureLogLevelTags(buffer, Adw.StyleManager.get_default().dark);

    const paint = (): void => {
        const vadj = scrolled.get_vadjustment();
        const savedY = vadj.get_value();
        const text = readLog();
        buffer.set_text(text, -1);
        colorizeLogBuffer(buffer);
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            const upper = Math.max(0, vadj.get_upper() - vadj.get_page_size());
            vadj.set_value(Math.min(savedY, upper));
            return GLib.SOURCE_REMOVE;
        });
    };

    let styleHandler = 0;
    let unsubscribeLog: (() => void) | null = null;

    page.connect('map', () => {
        refreshLogFromShell();
        paint();
        if (unsubscribeLog === null)
            unsubscribeLog = subscribeLog(() => paint());
        if (styleHandler === 0) {
            styleHandler = Adw.StyleManager.get_default().connect('notify::dark', () => {
                ensureLogLevelTags(buffer, Adw.StyleManager.get_default().dark);
                colorizeLogBuffer(buffer);
            });
        }
    });
    page.connect('unmap', () => {
        unsubscribeLog?.();
        unsubscribeLog = null;
        if (styleHandler !== 0) {
            Adw.StyleManager.get_default().disconnect(styleHandler);
            styleHandler = 0;
        }
    });

    return { page };
}

function levelColors(dark: boolean): Record<LogLevel, string> {
    if (dark) {
        return {
            debug: '#8b949e',
            info: '#58a6ff',
            warn: '#d29922',
            error: '#f85149',
        };
    }
    return {
        debug: '#57606a',
        info: '#0969da',
        warn: '#9a6700',
        error: '#cf222e',
    };
}

function ensureLogLevelTags(buffer: Gtk.TextBuffer, dark: boolean): void {
    const colors = levelColors(dark);
    const table = buffer.get_tag_table();
    if (!table)
        return;
    for (const level of LOG_LEVELS) {
        const name = `log-${level}`;
        let tag = table.lookup(name);
        if (!tag) {
            tag = new Gtk.TextTag({ name, foreground: colors[level] });
            table.add(tag);
        } else {
            tag.foreground = colors[level];
        }
    }
}

function parseLineLevel(line: string): LogLevel {
    const match = LEVEL_IN_LINE.exec(line);
    const level = match?.[1];
    if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error')
        return level;
    return 'info';
}

function colorizeLogBuffer(buffer: Gtk.TextBuffer): void {
    const start = buffer.get_start_iter();
    const end = buffer.get_end_iter();
    const text = buffer.get_text(start, end, false);
    if (text.length === 0)
        return;

    let offset = 0;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.length > 0) {
            const level = parseLineLevel(line);
            const lineStart = buffer.get_iter_at_offset(offset);
            const lineEnd = buffer.get_iter_at_offset(offset + line.length);
            buffer.apply_tag_by_name(`log-${level}`, lineStart, lineEnd);
        }
        offset += line.length + (i < lines.length - 1 ? 1 : 0);
    }
}
