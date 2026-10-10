import { shellErrorText } from '../lib/shellError.js';
import type { LogKind } from './logFormat.js';
import { appendLog } from './log.js';

export { shellErrorText } from '../lib/shellError.js';

/** Run Shell UI / GObject code that TypeScript cannot validate; log and continue. */
export function runShellSafe(
    context: string,
    fn: () => void,
    kind: LogKind = 'background',
): void {
    try {
        fn();
    } catch (error) {
        appendLog('error', `${context}: ${shellErrorText(error)}`, kind);
    }
}
