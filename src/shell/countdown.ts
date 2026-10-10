import GLib from 'gi://GLib';

export class Countdown {
    private sourceId = 0;

    constructor(private readonly onTick: () => void) {}

    start(): void {
        this.stop();
        this.onTick();
        this.sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this.onTick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop(): void {
        if (this.sourceId === 0)
            return;
        GLib.source_remove(this.sourceId);
        this.sourceId = 0;
    }
}
