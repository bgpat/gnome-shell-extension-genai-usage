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

export function readFileText(file: Gio.File, cancellable: Gio.Cancellable): Promise<string | undefined> {
    return new Promise(resolve => {
        file.load_contents_async(cancellable, (_source, result) => {
            try {
                const [, contents] = file.load_contents_finish(result);
                resolve(new TextDecoder().decode(contents));
            } catch {
                resolve(undefined);
            }
        });
    });
}

export function configHome(): string {
    const xdg = GLib.getenv('XDG_CONFIG_HOME');
    if (xdg && xdg.startsWith('/'))
        return xdg;
    return GLib.build_filenamev([GLib.get_home_dir(), '.config']);
}
