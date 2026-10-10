export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

const RANK: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

export function parseLogLevel(value: string): LogLevel {
    if (LOG_LEVELS.includes(value as LogLevel))
        return value as LogLevel;
    return 'error';
}

/** True when `level` is at or above `minimum` (more severe or equal). */
export function logLevelAtLeast(level: LogLevel, minimum: LogLevel): boolean {
    return RANK[level] >= RANK[minimum];
}
