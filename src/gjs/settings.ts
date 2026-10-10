import Gio from 'gi://Gio';

import { DEFAULT_LAYOUT, normalizeLayout, type LayoutState } from '../lib/layout.js';
import { KNOWN_PROVIDER_IDS } from '../lib/providers/catalog.js';
import type { CachedDataMode, UnavailableDisplay } from '../lib/presentation.js';

export const MAIN_SCHEMA = 'org.gnome.shell.extensions.genai-usage';
export const PROVIDER_SCHEMA = 'org.gnome.shell.extensions.genai-usage.provider';
export const REFRESH_CHOICES = [1, 5, 15, 30] as const;

const MAIN_PATH = '/org/gnome/shell/extensions/genai-usage/';

function providerPath(id: string): string {
    if (!/^[a-z0-9-]+$/.test(id))
        throw new Error(`Invalid provider id ${id}`);
    return `/org/gnome/shell/extensions/genai-usage/providers/${id}/`;
}

export class ExtensionSettings {
    readonly main: Gio.Settings;
    private readonly source: Gio.SettingsSchemaSource;
    private readonly providers = new Map<string, Gio.Settings>();
    private readonly bindings: { settings: Gio.Settings; id: number }[] = [];
    private onChanged: (() => void) | null = null;

    constructor(dir: Gio.File) {
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
        const settings = this.open(PROVIDER_SCHEMA, providerPath(id));
        this.providers.set(id, settings);
        if (this.onChanged) {
            const handler = settings.connect('changed', () => this.onChanged?.());
            this.bindings.push({ settings, id: handler });
        }
        return settings;
    }

    watch(callback: () => void): void {
        this.onChanged = callback;
        const handler = this.main.connect('changed', () => this.onChanged?.());
        this.bindings.push({ settings: this.main, id: handler });
        for (const settings of this.providers.values()) {
            const id = settings.connect('changed', () => this.onChanged?.());
            this.bindings.push({ settings, id });
        }
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

    resetLayout(): void {
        this.setLayout(DEFAULT_LAYOUT);
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
        for (const key of this.main.list_keys())
            this.main.reset(key);
        for (const id of KNOWN_PROVIDER_IDS) {
            const settings = this.provider(id);
            for (const key of settings.list_keys())
                settings.reset(key);
        }
    }
}
