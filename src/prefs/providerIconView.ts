import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { providerGicon, refreshProviderGicon } from '../gjs/providerIcon.js';
import type { ExtensionSettings } from '../gjs/settings.js';

/** Appends a preferences icon when a cached or freshly downloaded icon exists. */
export function attachProviderGtkImage(
    container: Gtk.Box,
    providerId: string,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
    pixelSize = 24,
): void {
    let image: Gtk.Image | null = null;
    const apply = (gicon: Gio.Icon | undefined) => {
        if (!gicon || cancellable.is_cancelled())
            return;
        if (!image) {
            image = new Gtk.Image({ gicon, pixel_size: pixelSize });
            container.append(image);
        } else {
            image.gicon = gicon;
        }
    };
    apply(providerGicon(providerId, settings));
    void refreshProviderGicon(providerId, settings, cancellable).then(apply);
}

/** Adds a provider icon prefix on a row when an icon becomes available. */
export function attachProviderGtkImagePrefix(
    row: Adw.ActionRow,
    providerId: string,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
    pixelSize = 24,
): void {
    let image: Gtk.Image | null = null;
    const apply = (gicon: Gio.Icon | undefined) => {
        if (!gicon || cancellable.is_cancelled())
            return;
        if (!image) {
            image = new Gtk.Image({ gicon, pixel_size: pixelSize });
            row.add_prefix(image);
        } else {
            image.gicon = gicon;
        }
    };
    apply(providerGicon(providerId, settings));
    void refreshProviderGicon(providerId, settings, cancellable).then(apply);
}
