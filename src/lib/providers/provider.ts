import type Gio from 'gi://Gio';

import type { UsageSnapshot } from '../model.js';
import type { ExtensionSettings } from '../../gjs/settings.js';

export interface QuotaMode {
    id: string;
    label: string;
}

export interface SecretPrompt {
    title: string;
    instructions: string;
    placeholder: string;
    help?: { uri: string; label: string; onOpen?: () => void };
    /** Return a message to keep the dialog open, or undefined on success. */
    validate: (value: string, cancellable: Gio.Cancellable, setStatus: (message: string) => void) => Promise<string | undefined>;
}

export interface UsageSourceContext {
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
    id: string;
    displayName: string;
    defaultIconUrl: string;
    showsCreditBalance?: boolean;
    refresh: (settings: ExtensionSettings, cancellable: Gio.Cancellable) => Promise<UsageSnapshot>;
    preferences: ProviderPreferences;
    requiresUnofficial?: boolean;
}
