import Gio from 'gi://Gio';

import { normalizeLayout, type LayoutState } from '../lib/layout.js';
import { type LogLevel, parseLogLevel } from '../lib/logLevel.js';
import { publicError } from '../lib/model.js';
import { KNOWN_PROVIDER_IDS } from '../lib/providers/catalog.js';
import type { CachedDataMode, QuotaPercentMode, UnavailableDisplay } from '../lib/presentation.js';
import { appendLog, syncMinLogLevelFromSettings } from './log.js';

export const MAIN_SCHEMA = 'org.gnome.shell.extensions.genai-usage';
export const PROVIDER_SCHEMA = 'org.gnome.shell.extensions.genai-usage.provider';
export const REFRESH_CHOICES = [1, 5, 15, 30] as const;

const MAIN_PATH = '/org/gnome/shell/extensions/genai-usage/';

export function providerSchemaId(id: string): string {
    if (!/^[a-z0-9-]+$/.test(id))
        throw new Error(`Invalid provider id ${id}`);
    return `${PROVIDER_SCHEMA}.${id}`;
}

export class ExtensionSettings {
    readonly extensionDir: Gio.File;
    readonly main: Gio.Settings;
    private readonly source: Gio.SettingsSchemaSource;
    private readonly providers = new Map<string, Gio.Settings>();
    private readonly bindings: { settings: Gio.Settings; id: number }[] = [];
    private onChanged: (() => void) | null = null;

    constructor(dir: Gio.File) {
        this.extensionDir = dir;
        const schemas = dir.get_child('schemas');
        const path = schemas.get_path();
        if (!path)
            throw new Error('Extension schema directory is missing');
        const source = Gio.SettingsSchemaSource.new_from_directory(
            path,
            Gio.SettingsSchemaSource.get_default(),
            false,
        );
        if (!source)
            throw new Error('Could not load GenAI Usage settings');
        this.source = source;
        this.main = this.open(MAIN_SCHEMA, MAIN_PATH);
    }

    private open(schemaId: string, path: string): Gio.Settings {
        const schema = this.source.lookup(schemaId, true);
        if (!schema)
            throw new Error(`Missing GSettings schema ${schemaId}`);
        return new Gio.Settings({ settings_schema: schema, path });
    }

    provider(id: string): Gio.Settings {
        const existing = this.providers.get(id);
        if (existing)
            return existing;
        const schemaId = providerSchemaId(id);
        const schema = this.source.lookup(schemaId, true);
        if (!schema)
            throw new Error(`Missing GSettings schema ${schemaId}`);
        const settings = new Gio.Settings({ settings_schema: schema });
        this.providers.set(id, settings);
        return settings;
    }

    watch(callback: () => void, logOrigin?: 'shell' | 'prefs'): void {
        this.onChanged = callback;
        this.bindChanged(this.main, 'main', logOrigin);
        for (const id of KNOWN_PROVIDER_IDS)
            this.bindChanged(this.provider(id), `provider/${id}`, logOrigin);
    }

    private bindChanged(settings: Gio.Settings, scope: string, logOrigin?: 'shell' | 'prefs'): void {
        const handler = settings.connect('changed', (_source, key: string) => {
            if (scope === 'main' && key === 'log-level')
                syncMinLogLevelFromSettings(this);
            if (logOrigin !== undefined) {
                appendLog(
                    'info',
                    `[${logOrigin}] Setting changed: ${scope}/${key}=${formatSettingValue(settings, key)}`,
                    'user',
                );
            }
            this.onChanged?.();
        });
        this.bindings.push({ settings, id: handler });
    }

    destroy(): void {
        this.onChanged = null;
        for (const binding of this.bindings)
            binding.settings.disconnect(binding.id);
        this.bindings.length = 0;
        this.providers.clear();
    }

    get autoRefresh(): boolean {
        return this.main.get_boolean('auto-refresh');
    }

    get refreshInterval(): number {
        const value = this.main.get_uint('refresh-interval');
        return (REFRESH_CHOICES as readonly number[]).includes(value) ? value : 5;
    }

    set refreshInterval(minutes: number) {
        if ((REFRESH_CHOICES as readonly number[]).includes(minutes))
            this.main.set_uint('refresh-interval', minutes);
    }

    get showProviderNames(): boolean {
        return this.main.get_boolean('show-provider-names');
    }

    get quotaPercentMode(): QuotaPercentMode {
        return this.main.get_string('quota-percent-mode') === 'used' ? 'used' : 'remaining';
    }

    get unavailableDisplay(): UnavailableDisplay {
        const value = this.main.get_string('unavailable-display');
        if (value === 'hide' || value === 'icon-only' || value === 'placeholder')
            return value;
        return 'placeholder';
    }

    get cachedData(): CachedDataMode {
        return this.main.get_string('cached-data') === 'hide' ? 'hide' : 'show';
    }

    get useWebIcons(): boolean {
        return this.main.get_boolean('use-web-icons');
    }

    get logLevel(): LogLevel {
        return parseLogLevel(this.main.get_string('log-level'));
    }

    layout(): LayoutState {
        return normalizeLayout(
            this.main.get_strv('provider-order'),
            this.main.get_strv('hidden-providers'),
            KNOWN_PROVIDER_IDS,
        );
    }

    setLayout(state: LayoutState): void {
        const normalized = normalizeLayout(state.order, state.hidden, KNOWN_PROVIDER_IDS);
        this.main.set_strv('provider-order', normalized.order);
        this.main.set_strv('hidden-providers', normalized.hidden);
    }

    enabled(id: string): boolean {
        return this.provider(id).get_boolean('enabled');
    }

    enabledSet(): Set<string> {
        return new Set(KNOWN_PROVIDER_IDS.filter(id => this.enabled(id)));
    }

    executablePath(id: string): string {
        return this.provider(id).get_string('executable-path');
    }

    topBarQuota(id: string): string {
        return this.provider(id).get_string('top-bar-quota');
    }

    setTopBarQuota(id: string, mode: string): void {
        this.provider(id).set_string('top-bar-quota', mode);
    }

    showPlan(id: string): boolean {
        return this.provider(id).get_boolean('show-plan');
    }

    showBilling(id: string): boolean {
        return this.provider(id).get_boolean('show-billing');
    }

    iconUrl(id: string): string {
        return this.provider(id).get_string('icon-url');
    }

    allowUnofficial(id: string): boolean {
        return this.provider(id).get_boolean('allow-unofficial-sources');
    }

    resetAll(): void {
        appendLog('info', 'All settings reset to defaults.', 'user');
        for (const key of this.main.list_keys())
            this.main.reset(key);
        for (const id of KNOWN_PROVIDER_IDS) {
            const settings = this.provider(id);
            for (const key of settings.list_keys())
                settings.reset(key);
        }
    }
}

function formatSettingValue(settings: Gio.Settings, key: string): string {
    let text = settings.get_value(key).print(false);
    if (text.length > 120)
        text = `${text.slice(0, 117)}...`;
    return publicError(text);
}
