import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { fileExists } from './files.js';

export async function resolveExecutable(
    configured: string,
    names: readonly string[],
    cancellable: Gio.Cancellable,
): Promise<string | null> {
    const trimmed = configured.trim();
    if (trimmed !== '') {
        const exists = await fileExists(Gio.File.new_for_path(trimmed), cancellable);
        return exists ? trimmed : null;
    }

    for (const name of names) {
        const found = GLib.find_program_in_path(name);
        if (found)
            return found;
    }

    const home = GLib.get_home_dir();
    for (const name of names) {
        const candidate = GLib.build_filenamev([home, '.local', 'bin', name]);
        if (await fileExists(Gio.File.new_for_path(candidate), cancellable))
            return candidate;
    }
    return null;
}
