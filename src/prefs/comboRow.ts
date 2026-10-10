import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

/**
 * Libadwaita's default ComboRow labels are capped at 20 characters (see adw-combo-row.c setup_item).
 * Show the full selection as the row subtitle and use a list factory without that cap in the popover.
 */
export function prepareComboRow(row: Adw.ComboRow): void {
    row.use_subtitle = true;
    row.subtitle_lines = 3;
    row.connect('notify::selected', () => refreshComboRowSubtitle(row));

    const factory = Gtk.SignalListItemFactory.new();
    factory.connect('setup', (_factory, listItem: Gtk.ListItem) => {
        const label = Gtk.Label.new(null);
        label.xalign = 0;
        label.valign = Gtk.Align.CENTER;
        label.max_width_chars = -1;
        listItem.set_child(label);
    });
    factory.connect('bind', (_factory, listItem: Gtk.ListItem) => {
        const item = listItem.get_item();
        const label = listItem.get_child() as Gtk.Label;
        if (item instanceof Gtk.StringObject)
            label.label = item.get_string();
    });
    row.list_factory = factory;
}

/** Subtitle is driven by libadwaita when use_subtitle is on; re-sync after programmatic selection changes. */
export function refreshComboRowSubtitle(row: Adw.ComboRow): void {
    if (!row.use_subtitle)
        return;
    const item = row.selected_item;
    if (item instanceof Gtk.StringObject)
        row.subtitle = item.get_string();
}
