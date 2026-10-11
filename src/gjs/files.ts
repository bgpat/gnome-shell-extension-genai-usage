import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function fileExists(file: Gio.File, cancellable: Gio.Cancellable): Promise<boolean> {
    return new Promise(resolve => {
        file.query_info_async(
            'standard::type',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (_source, result) => {
                try {
                    file.query_info_finish(result);
                    resolve(true);
                } catch {
                    resolve(false);
                }
            },
        );
    });
}

export function readFileBytes(
    file: Gio.File,
    cancellable: Gio.Cancellable | null = null,
): Promise<Uint8Array | undefined> {
    return new Promise(resolve => {
        file.load_contents_async(cancellable, (_source, result) => {
            try {
                const [, contents] = file.load_contents_finish(result);
                const raw = contents instanceof Uint8Array
                    ? contents
                    : new Uint8Array(contents as ArrayBuffer);
                resolve(raw);
            } catch {
                resolve(undefined);
            }
        });
    });
}

export function readFileText(file: Gio.File, cancellable: Gio.Cancellable): Promise<string | undefined> {
    return readFileBytes(file, cancellable).then(raw =>
        raw === undefined ? undefined : new TextDecoder().decode(raw));
}

export function configHome(): string {
    const xdg = GLib.getenv('XDG_CONFIG_HOME');
    if (xdg && xdg.startsWith('/'))
        return xdg;
    return GLib.build_filenamev([GLib.get_home_dir(), '.config']);
}
