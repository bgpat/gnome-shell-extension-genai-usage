import { createChatGptProvider } from './chatgpt/provider.js';
import { createCursorProvider } from './cursor/provider.js';
import { createJevProvider } from './jev/provider.js';
import type { Provider } from './provider.js';

// Shared with Bun tests. The factories load GJS only when a provider operation runs.
export const PROVIDERS: readonly Provider[] = [createChatGptProvider(), createCursorProvider(), createJevProvider()];

export const KNOWN_PROVIDER_IDS = PROVIDERS.map(provider => provider.id);

export function providerById(id: string): Provider | undefined {
    return PROVIDERS.find(provider => provider.id === id);
}
