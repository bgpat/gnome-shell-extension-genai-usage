import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { runProcess } from '../../dist/gjs/subprocess.js';

const loop = GLib.MainLoop.new(null, false);
const cancellable = new Gio.Cancellable();

function fail(message) {
    console.error(message);
    loop.quit();
    imports.system.exit(1);
}

runProcess({
    argv: ['/bin/echo', 'ok'],
    timeoutSec: 5,
    cancellable,
}).then(result => {
    if (result.timedOut || result.stdout.trim() !== 'ok')
        fail(`echo failed: ${JSON.stringify({ timedOut: result.timedOut, exitCode: result.exitCode })}`);
    return runProcess({
        argv: ['/bin/sleep', '5'],
        timeoutSec: 1,
        cancellable,
    });
}).then(result => {
    if (!result.timedOut)
        fail('sleep was not stopped at the timeout');
    const cancel = new Gio.Cancellable();
    const pending = runProcess({
        argv: ['/bin/sleep', '5'],
        timeoutSec: 10,
        cancellable: cancel,
    });
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        cancel.cancel();
        return GLib.SOURCE_REMOVE;
    });
    return pending.then(() => {
        fail('cancelled process resolved');
    }, () => {
        console.log('gjs subprocess checks passed');
        loop.quit();
    });
}).catch(error => {
    fail(error instanceof Error ? error.message : String(error));
});

loop.run();
