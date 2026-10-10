import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ExtensionSettings } from './gjs/settings.js';
import { UsageIndicator } from './shell/indicator.js';
import { RefreshScheduler } from './shell/refreshScheduler.js';

export default class GenaiUsageExtension extends Extension {
    private settings?: ExtensionSettings;
    private scheduler?: RefreshScheduler;
    private indicator?: UsageIndicator;

    enable(): void {
        const settings = new ExtensionSettings(this.dir);
        const scheduler = new RefreshScheduler(settings);
        const indicator = new UsageIndicator(this, settings, scheduler);
        this.settings = settings;
        this.scheduler = scheduler;
        this.indicator = indicator;
        Main.panel.addToStatusArea(this.uuid, indicator.button);
        settings.watch(() => {
            scheduler.restart();
            indicator.update();
        });
        scheduler.onChange = () => indicator.update();
        scheduler.start();
        indicator.update();
    }

    disable(): void {
        this.scheduler?.stop();
        this.scheduler = undefined;
        this.indicator?.destroy();
        this.indicator = undefined;
        this.settings?.destroy();
        this.settings = undefined;
    }
}
