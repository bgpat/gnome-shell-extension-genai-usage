import { publicError } from './model.js';

export function shellErrorText(error: unknown): string {
    return publicError(error instanceof Error ? error.message : String(error));
}
