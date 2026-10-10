import Gio from 'gi://Gio';
import St from 'gi://St';

import { appendLog } from '../gjs/log.js';
import { providerGicon, refreshProviderGicon } from '../gjs/providerIcon.js';
import type { ExtensionSettings } from '../gjs/settings.js';

const ICON_CLASSES = 'genai-usage-provider-icon';

/** Matches stylesheet `#panel .genai-usage-provider-icon` icon-size. */
export const PANEL_BAR_ICON_SIZE = 14;

export function setStGicon(icon: St.Icon, gicon: Gio.Icon | null): void {
    (icon as unknown as { gicon: Gio.Icon | null }).gicon = gicon;
}

/** Inserts a top-bar/menu icon when a cached or freshly downloaded icon exists. */
export function attachProviderStIcon(
    box: St.BoxLayout,
    atIndex: number,
    providerId: string,
    settings: ExtensionSettings,
    cancellable: Gio.Cancellable,
    isCurrent: () => boolean,
    icons?: Map<string, St.Icon>,
    size = PANEL_BAR_ICON_SIZE,
): void {
    let icon: St.Icon | null = null;
    const apply = (gicon: Gio.Icon | undefined) => {
        if (!gicon)
            return;
        if (!icon) {
            icon = new St.Icon({ icon_size: size, style_class: ICON_CLASSES });
            icon.clip_to_allocation = false;
            box.insert_child_at_index(icon, atIndex);
            if (icons)
                icons.set(providerId, icon);
        }
        icon.icon_name = '';
        setStGicon(icon, gicon);
    };
    apply(providerGicon(providerId, settings));
    void refreshProviderGicon(providerId, settings, cancellable).then(gicon => {
        if (!gicon || cancellable.is_cancelled() || !isCurrent())
            return;
        apply(gicon);
        appendLog('info', `Icon updated for ${providerId} in shell UI`);
    }).catch(error => {
        appendLog(
            'warn',
            `Icon refresh failed for ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
        );
    });
}
