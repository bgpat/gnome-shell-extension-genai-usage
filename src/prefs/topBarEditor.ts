import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { catalogEntry, KNOWN_PROVIDER_IDS } from '../lib/providers/catalog.js';
import {
    hiddenIds,
    nudge,
    placeProvider,
    transfer,
    visibleIds,
    type LayoutArea,
    type LayoutState,
} from '../lib/layout.js';
import type { ExtensionSettings } from '../gjs/settings.js';

export class TopBarEditor {
    readonly widget: Gtk.Box;
    private readonly visibleBox = new Gtk.Box({ spacing: 8, hexpand: true });
    private readonly hiddenBox = new Gtk.Box({ spacing: 8, hexpand: true });
    private writing = false;

    constructor(private readonly settings: ExtensionSettings) {
        this.widget = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 6,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        this.widget.append(new Gtk.Label({
            label: 'Visible in the top bar',
            halign: Gtk.Align.START,
        }));
        this.widget.append(this.visibleBox);
        this.widget.append(new Gtk.Label({
            label: 'Hidden',
            halign: Gtk.Align.START,
        }));
        this.widget.append(this.hiddenBox);
        this.installDrop(this.visibleBox, 'visible');
        this.installDrop(this.hiddenBox, 'hidden');
        const reset = new Gtk.Button({ label: 'Reset layout', halign: Gtk.Align.START });
        reset.connect('clicked', () => {
            this.writing = true;
            this.settings.resetLayout();
            this.writing = false;
            this.reload();
        });
        this.widget.append(reset);
        this.reload();
    }

    reload(): void {
        if (this.writing)
            return;
        this.fill(this.visibleBox, visibleIds(this.state(), this.enabled()), 'visible');
        this.fill(this.hiddenBox, hiddenIds(this.state(), this.enabled()), 'hidden');
    }

    private state(): LayoutState {
        return this.settings.layout();
    }

    private enabled(): Set<string> {
        return this.settings.enabledSet();
    }

    private commit(next: LayoutState): void {
        this.writing = true;
        this.settings.setLayout(next);
        this.writing = false;
        this.reload();
    }

    private fill(box: Gtk.Box, ids: string[], area: LayoutArea): void {
        let child = box.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            box.remove(child);
            child = next;
        }
        if (ids.length === 0) {
            box.append(new Gtk.Label({
                label: area === 'visible' ? 'Nothing visible' : 'Nothing hidden',
                halign: Gtk.Align.START,
            }));
            return;
        }
        ids.forEach((id, index) => box.append(this.chip(id, area, index)));
    }

    private chip(id: string, area: LayoutArea, index: number): Gtk.Box {
        const entry = catalogEntry(id);
        const chip = new Gtk.Box({
            spacing: 6,
            css_classes: ['card'],
            margin_top: 2,
            margin_bottom: 2,
        });
        chip.append(new Gtk.Label({ label: entry?.displayName ?? id }));
        const earlier = new Gtk.Button({ label: 'Earlier', tooltip_text: 'Move earlier (Ctrl+Left)' });
        earlier.connect('clicked', () => this.commit(nudge(this.state(), this.enabled(), id, -1)));
        const later = new Gtk.Button({ label: 'Later', tooltip_text: 'Move later (Ctrl+Right)' });
        later.connect('clicked', () => this.commit(nudge(this.state(), this.enabled(), id, 1)));
        const across = new Gtk.Button({
            label: area === 'visible' ? 'Hide' : 'Show',
            tooltip_text: area === 'visible' ? 'Hide from the top bar (Ctrl+Down)' : 'Show in the top bar (Ctrl+Up)',
        });
        across.connect('clicked', () => {
            this.commit(transfer(this.state(), this.enabled(), id, area === 'visible' ? 'hidden' : 'visible'));
        });
        chip.append(earlier);
        chip.append(later);
        chip.append(across);

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            if ((state & Gdk.ModifierType.CONTROL_MASK) === 0)
                return false;
            if (keyval === Gdk.KEY_Left) {
                this.commit(nudge(this.state(), this.enabled(), id, -1));
                return true;
            }
            if (keyval === Gdk.KEY_Right) {
                this.commit(nudge(this.state(), this.enabled(), id, 1));
                return true;
            }
            if (keyval === Gdk.KEY_Up) {
                this.commit(transfer(this.state(), this.enabled(), id, 'visible'));
                return true;
            }
            if (keyval === Gdk.KEY_Down) {
                this.commit(transfer(this.state(), this.enabled(), id, 'hidden'));
                return true;
            }
            return false;
        });
        chip.add_controller(keys);
        chip.focusable = true;

        const drag = new Gtk.DragSource();
        drag.actions = moveAction();
        drag.connect('prepare', () => Gdk.ContentProvider.new_for_value(id));
        chip.add_controller(drag);

        const drop = Gtk.DropTarget.new(GObject.TYPE_STRING, moveAction());
        drop.connect('drop', (_target, value) => {
            const dropped = droppedId(value);
            if (!dropped)
                return false;
            this.commit(placeProvider(this.state(), this.enabled(), dropped, area, index));
            return true;
        });
        chip.add_controller(drop);
        return chip;
    }

    private installDrop(box: Gtk.Box, area: LayoutArea): void {
        const drop = Gtk.DropTarget.new(GObject.TYPE_STRING, moveAction());
        drop.connect('drop', (_target, value) => {
            const dropped = droppedId(value);
            if (!dropped)
                return false;
            const ids = area === 'visible'
                ? visibleIds(this.state(), this.enabled())
                : hiddenIds(this.state(), this.enabled());
            this.commit(placeProvider(this.state(), this.enabled(), dropped, area, ids.length));
            return true;
        });
        box.add_controller(drop);
    }
}

type MoveAction = Parameters<typeof Gtk.DropTarget.new>[1];

function moveAction(): MoveAction {
    return Gdk.DragAction.MOVE as MoveAction;
}

function droppedId(value: unknown): string | undefined {
    if (typeof value !== 'string')
        return undefined;
    return (KNOWN_PROVIDER_IDS as readonly string[]).includes(value) ? value : undefined;
}
