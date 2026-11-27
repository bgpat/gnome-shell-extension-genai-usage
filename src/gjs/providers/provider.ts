import type Gio from 'gi://Gio';

import type { UsageSnapshot } from '../../lib/model.js';
import type { ProviderCatalogEntry, QuotaMode } from '../../lib/providers/catalog.js';
import type { ExtensionSettings } from '../settings.js';

export interface SecretPrompt {
    title: string;
    instructions: string;
    placeholder: string;
    help?: { uri: string; label: string; onOpen?: () => void };
    /** Return a message to keep the dialog open, or undefined on success. */
    validate: (value: string, cancellable: Gio.Cancellable, setStatus: (message: string) => void) => Promise<string | undefined>;
}

interface UsageSourceContext {
    settings: Gio.Settings;
    cancellable: Gio.Cancellable;
    promptForSecret: (prompt: SecretPrompt) => Promise<boolean>;
    applyQuotaModes: (modes: readonly QuotaMode[]) => void;
}

interface ProviderPreferences {
    columnHeaderNote?: string;
    executablePlaceholder?: string;
    quotaModes?: readonly QuotaMode[];
    emptyQuotaLabel?: string;
    unofficialQuotas?: {
        fromSnapshot: (snapshot: UsageSnapshot) => QuotaMode[];
        discover: (cancellable: Gio.Cancellable) => Promise<QuotaMode[]>;
    };
    changeUnofficialSource?: (enable: boolean, context: UsageSourceContext) => Promise<boolean>;
}

export interface Provider {
    entry: ProviderCatalogEntry;
    refresh: (settings: ExtensionSettings, cancellable: Gio.Cancellable) => Promise<UsageSnapshot>;
    preferences: ProviderPreferences;
    requiresUnofficial?: boolean;
}
