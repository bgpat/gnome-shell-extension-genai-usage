import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function iconCacheRoot(): Gio.File {
    return Gio.File.new_for_path(GLib.build_filenamev([
        GLib.get_user_cache_dir(),
        'genai-usage',
        'icons',
    ]));
}
