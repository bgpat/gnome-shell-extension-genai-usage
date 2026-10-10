import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { refreshProvider } from '../gjs/providers/registry.js';
import {
    requestShellRefresh,
    shellSnapshotsAvailable,
    snapshotsFromShell,
    subscribeShellSnapshots,
} from '../gjs/usageDBusClient.js';
import { catalogEntry, KNOWN_PROVIDER_IDS } from '../lib/providers/catalog.js';
import { barEntries, barItemLabel } from '../lib/presentation.js';
import type { UsageSnapshot } from '../lib/model.js';
import { previewOrder, reorderTarget, type PillBound } from '../lib/barReorder.js';
import { placeProvider, visibleIds, type LayoutState } from '../lib/layout.js';
import { appendLog } from '../gjs/log.js';
import type { ExtensionSettings } from '../gjs/settings.js';
import { attachProviderGtkImage } from './providerIconView.js';

export class TopBarEditor {
    readonly widget: Gtk.Box;
    private readonly rowBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        hexpand: true,
        valign: Gtk.Align.CENTER,
    });
    private readonly shiftProvider = new Gtk.CssProvider();
    private shiftProviderReady = false;
    private readonly slideDeltas = new Map<string, number>();
    private readonly slideAnim: Adw.TimedAnimation;
    private writing = false;
    private loadingSnapshots = false;
    private draggingId: string | null = null;
    private dragStartIndex = 0;
    private dragOriginX = 0;
    private dragBounds: PillBound[] = [];
    private applyingPreview = false;
    private readonly pillIds = new Map<Gtk.Box, string>();
    private readonly cancellable = new Gio.Cancellable();
    private readonly snapshots = new Map<string, UsageSnapshot>();

    constructor(private readonly settings: ExtensionSettings) {
        const previewBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            css_classes: ['genai-topbar-preview'],
            margin_top: 2,
            margin_bottom: 2,
        });
        previewBar.append(this.rowBox);
        this.slideAnim = Adw.TimedAnimation.new(
            this.rowBox,
            1,
            0,
            180,
            Adw.CallbackAnimationTarget.new((value: number) => this.applySlide(value)),
        );
        this.slideAnim.easing = Adw.Easing.EASE_OUT_CUBIC;

        this.widget = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 14,
            margin_top: 6,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        this.widget.append(previewBar);

        subscribeShellSnapshots(() => {
            this.applyShellSnapshots(snapshotsFromShell());
        });
        this.widget.connect('map', () => {
            this.ensureShiftProvider();
            this.loadSnapshots();
        });
        this.render();
    }

    reload(): void {
        if (!this.draggingId)
            this.render();
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
        appendLog('info', 'Top bar provider order changed.', 'user');
        this.render();
    }

    private loadSnapshots(): void {
        if (this.loadingSnapshots || this.cancellable.is_cancelled())
            return;
        if (shellSnapshotsAvailable()) {
            this.applyShellSnapshots(snapshotsFromShell());
            requestShellRefresh();
            return;
        }
        this.loadingSnapshots = true;
        void (async () => {
            for (const id of KNOWN_PROVIDER_IDS) {
                if (this.cancellable.is_cancelled())
                    return;
                if (!this.enabled().has(id))
                    continue;
                const snapshot = await refreshProvider(id, this.settings, this.cancellable);
                if (this.cancellable.is_cancelled())
                    return;
                this.snapshots.set(id, snapshot);
            }
            this.loadingSnapshots = false;
            if (!this.draggingId)
                this.render();
        })();
    }

    private applyShellSnapshots(fromShell: ReadonlyMap<string, UsageSnapshot>): void {
        this.snapshots.clear();
        for (const [id, snapshot] of fromShell)
            this.snapshots.set(id, snapshot);
        if (!this.draggingId)
            this.render();
    }

    private render(): void {
        if (this.writing || this.draggingId)
            return;
        this.pillIds.clear();
        this.clearBoxChildren(this.rowBox);
        const ids = visibleIds(this.state(), this.enabled());
        if (ids.length === 0) {
            this.rowBox.append(new Gtk.Label({
                label: 'No enabled providers. Turn them on in the Services tab.',
                halign: Gtk.Align.CENTER,
                hexpand: true,
                css_classes: ['dim-label'],
            }));
            return;
        }
        for (let i = 0; i < ids.length; i++)
            this.rowBox.append(this.pill(ids[i]!, i));
    }

    private clearBoxChildren(box: Gtk.Box): void {
        let child = box.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            box.remove(child);
            child = next;
        }
    }

    private pillLabel(id: string): string {
        const entry = barEntries(
            [id],
            this.snapshots,
            providerId => this.settings.topBarQuota(providerId),
            this.settings.unavailableDisplay,
            this.settings.quotaPercentMode,
        ).find(item => item.providerId === id);
        if (!entry)
            return catalogEntry(id)?.displayName ?? id;
        return barItemLabel(entry, this.settings.showProviderNames) ?? entry.displayName;
    }

    private appendPillHandle(pill: Gtk.Box, id: string, index: number): void {
        const handle = new Gtk.Image({
            icon_name: 'list-drag-handle-symbolic',
            icon_size: Gtk.IconSize.NORMAL,
            css_classes: ['genai-topbar-pill-handle'],
        });
        handle.tooltip_text = 'Drag horizontally to reorder.';
        this.useCursor(handle, 'grab');
        const gesture = new Gtk.GestureDrag({ button: Gdk.BUTTON_PRIMARY });
        gesture.propagation_phase = Gtk.PropagationPhase.CAPTURE;
        gesture.set_exclusive(true);
        gesture.connect('drag-begin', () => {
            this.draggingId = id;
            this.dragStartIndex = index;
            this.dragBounds = this.captureBounds();
            this.dragOriginX = this.rowPointerX(pill, gesture) ?? 0;
            pill.add_css_class('genai-topbar-pill-dragging');
            this.rowBox.add_css_class('genai-topbar-row-dragging');
            this.useCursor(pill, 'grabbing');
            this.useCursor(handle, 'grabbing');
            this.useCursor(this.rowBox, 'grabbing');
        });
        gesture.connect('drag-update', (_gesture, offsetX) => {
            if (this.draggingId !== id)
                return;
            this.showPreview(this.pointerInRow(pill, gesture, offsetX));
        });
        gesture.connect('drag-end', (_gesture, offsetX) => {
            if (this.draggingId !== id)
                return;
            const pointerX = this.pointerInRow(pill, gesture, offsetX);
            const target = reorderTarget(this.dragBounds, id, this.dragStartIndex, pointerX, this.visualIds());
            this.draggingId = null;
            this.dragBounds = [];
            this.dragOriginX = 0;
            this.clearSlide();
            pill.remove_css_class('genai-topbar-pill-dragging');
            this.rowBox.remove_css_class('genai-topbar-row-dragging');
            this.useCursor(pill, 'grab');
            this.useCursor(handle, 'grab');
            this.useCursor(this.rowBox, null);
            if (target === null) {
                const saved = visibleIds(this.state(), this.enabled());
                if (!sameIds(this.visualIds(), saved))
                    this.render();
                return;
            }
            this.commit(placeProvider(this.state(), this.enabled(), id, 'visible', target));
        });
        pill.add_controller(gesture);
        pill.append(handle);
    }

    private appendPillLabel(pill: Gtk.Box, id: string): void {
        const label = new Gtk.Label({
            label: this.pillLabel(id),
            xalign: 0,
            selectable: false,
            can_focus: false,
        });
        label.add_css_class('genai-topbar-pill-label');
        pill.append(label);
    }

    private pill(id: string, index: number): Gtk.Box {
        const pill = new Gtk.Box({
            spacing: 8,
            css_classes: ['genai-topbar-pill'],
            orientation: Gtk.Orientation.HORIZONTAL,
        });
        this.pillIds.set(pill, id);
        pill.name = pillCssName(id);
        this.appendPillHandle(pill, id, index);
        attachProviderGtkImage(pill, id, this.settings, this.cancellable, 18);
        this.appendPillLabel(pill, id);
        pill.tooltip_text = 'Drag to reorder.';
        this.useCursor(pill, 'grab');
        return pill;
    }

    private useCursor(widget: Gtk.Widget, name: 'grab' | 'grabbing' | null): void {
        if (name === null) {
            widget.set_cursor(null);
            return;
        }
        widget.set_cursor(Gdk.Cursor.new_from_name(name, null) as never);
    }

    /** Pointer X in the row. Falls back to the press point plus the gesture offset. */
    private pointerInRow(widget: Gtk.Widget, gesture: Gtk.GestureDrag, fallbackOffsetX: number): number {
        return this.rowPointerX(widget, gesture) ?? this.dragOriginX + fallbackOffsetX;
    }

    private rowPointerX(handle: Gtk.Widget, gesture: Gtk.GestureDrag): number | null {
        const [ok, x, y] = gesture.get_point(null);
        if (!ok)
            return null;
        const [translated, rowX] = handle.translate_coordinates(this.rowBox, x, y);
        return translated ? rowX : null;
    }

    private captureBounds(): PillBound[] {
        const bounds: PillBound[] = [];
        let fallbackX = 0;
        for (const pill of this.pillChildren()) {
            const id = this.pillIds.get(pill);
            if (!id)
                continue;
            const alloc = pill.get_allocation();
            const [ok, x] = pill.translate_coordinates(this.rowBox, 0, 0);
            const left = ok ? x : fallbackX;
            bounds.push({ id, x: left, width: alloc.width });
            fallbackX = left + alloc.width + this.rowBox.spacing;
        }
        return bounds;
    }

    private showPreview(offsetX: number): void {
        if (!this.draggingId || this.applyingPreview)
            return;
        const next = previewOrder(this.dragBounds, this.draggingId, offsetX, this.visualIds());
        if (sameIds(next, this.visualIds()))
            return;
        this.applyingPreview = true;
        try {
            const spacing = this.rowBox.spacing;
            const oldXs = layoutXs(this.visualIds(), this.dragBounds, spacing);
            const newXs = layoutXs(next, this.dragBounds, spacing);
            this.setVisualOrder(next);
            this.slideDeltas.clear();
            for (const pillId of next) {
                const delta = (oldXs.get(pillId) ?? 0) - (newXs.get(pillId) ?? 0);
                if (delta !== 0)
                    this.slideDeltas.set(pillId, delta);
            }
            this.applySlide(1);
            this.slideAnim.play();
        } finally {
            this.applyingPreview = false;
        }
    }

    private setVisualOrder(ids: string[]): void {
        const byId = new Map<string, Gtk.Box>();
        for (const pill of this.pillChildren()) {
            const pillId = this.pillIds.get(pill);
            if (pillId)
                byId.set(pillId, pill);
        }
        let previous: Gtk.Widget | null = null;
        for (const pillId of ids) {
            const pill = byId.get(pillId);
            if (!pill)
                continue;
            this.rowBox.reorder_child_after(pill, previous);
            previous = pill;
        }
    }

    private visualIds(): string[] {
        const ids: string[] = [];
        for (const pill of this.pillChildren()) {
            const pillId = this.pillIds.get(pill);
            if (pillId)
                ids.push(pillId);
        }
        return ids;
    }

    private ensureShiftProvider(): void {
        if (this.shiftProviderReady)
            return;
        Gtk.StyleContext.add_provider_for_display(
            this.widget.get_display(),
            this.shiftProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1,
        );
        this.shiftProviderReady = true;
    }

    private applySlide(progress: number): void {
        const lines: string[] = [];
        for (const [pillId, delta] of this.slideDeltas) {
            const px = Math.round(delta * progress);
            if (px !== 0)
                lines.push(`#${pillCssName(pillId)} { transform: translate(${px}px, 0px); }`);
        }
        this.shiftProvider.load_from_string(lines.length > 0 ? lines.join('\n') : '/* */');
    }

    private clearSlide(): void {
        this.slideDeltas.clear();
        this.slideAnim.skip();
        this.applySlide(0);
    }

    private pillChildren(): Gtk.Box[] {
        const pills: Gtk.Box[] = [];
        for (let child = this.rowBox.get_first_child(); child; child = child.get_next_sibling()) {
            if (child instanceof Gtk.Box && child.has_css_class('genai-topbar-pill'))
                pills.push(child);
        }
        return pills;
    }
}

function pillCssName(id: string): string {
    return `genai-pill-${id.replace(/[^a-z0-9-]/g, '')}`;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

function layoutXs(order: readonly string[], bounds: readonly PillBound[], spacing: number): Map<string, number> {
    const widths = new Map(bounds.map(bound => [bound.id, bound.width]));
    const xs = new Map<string, number>();
    let x = 0;
    for (const id of order) {
        xs.set(id, x);
        x += (widths.get(id) ?? 0) + spacing;
    }
    return xs;
}
