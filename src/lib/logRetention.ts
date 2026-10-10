/** Maximum characters kept in the log. Oldest text is dropped first. */
export const LOG_MAX_BYTES = 64_000;

export function trimLog(text: string): string {
    if (text.length <= LOG_MAX_BYTES)
        return text;
    return text.slice(-LOG_MAX_BYTES);
}
