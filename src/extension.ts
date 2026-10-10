import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { appendLog, registerShellLogDBus, syncMinLogLevelFromSettings } from './gjs/log.js';
import { startLogService, stopLogService } from './gjs/logDBusServer.js';
import { bindUsageScheduler, emitUsageSnapshotsChanged } from './gjs/usageDBusServer.js';
import { ExtensionSettings } from './gjs/settings.js';
import { runShellSafe } from './gjs/shellSafe.js';
import { UsageIndicator } from './shell/indicator.js';
import { RefreshScheduler } from './shell/refreshScheduler.js';

export default class GenaiUsageExtension extends Extension {
    private settings?: ExtensionSettings;
    private scheduler?: RefreshScheduler;
    private indicator?: UsageIndicator;

    enable(): void {
        runShellSafe('Extension enable', () => {
            registerShellLogDBus();
            startLogService();
            const settings = new ExtensionSettings(this.dir);
            syncMinLogLevelFromSettings(settings);
            const scheduler = new RefreshScheduler(settings);
            const indicator = new UsageIndicator(this, settings, scheduler);
            this.settings = settings;
            this.scheduler = scheduler;
            this.indicator = indicator;
            bindUsageScheduler(scheduler);
            Main.panel.addToStatusArea(this.uuid, indicator.button);
            settings.watch(() => {
                runShellSafe('Settings changed (shell)', () => {
                    syncMinLogLevelFromSettings(settings);
                    scheduler.onSettingsChanged();
                    indicator.update();
                }, 'user');
            }, 'shell');
            scheduler.onChange = () => {
                runShellSafe('Usage snapshots changed', () => {
                    indicator.update();
                    emitUsageSnapshotsChanged(scheduler.snapshots());
                });
            };
            scheduler.start();
            indicator.update();
            appendLog('info', 'Extension enabled in GNOME Shell.', 'background');
        });
    }

    disable(): void {
        runShellSafe('Extension disable', () => {
            appendLog('info', 'Extension disabled in GNOME Shell.', 'background');
            bindUsageScheduler(null);
            stopLogService();
            this.scheduler?.stop();
            this.scheduler = undefined;
            this.indicator?.destroy();
            this.indicator = undefined;
            this.settings?.destroy();
            this.settings = undefined;
        });
    }
}
