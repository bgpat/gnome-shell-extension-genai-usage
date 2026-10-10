import { isRecord } from '../../model.js';

const USER_ID_CHARS = /^[A-Za-z0-9._-]+$/;

export interface CursorSession {
    accessToken: string;
    userId: string;
    expiresAt: number;
}

const BASE64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(segment: string): string {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of normalized) {
        const value = BASE64_TABLE.indexOf(char);
        if (value < 0)
            throw new Error('Invalid base64');
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }
    return new TextDecoder().decode(Uint8Array.from(bytes));
}

export function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1])
        return undefined;
    try {
        const parsed: unknown = JSON.parse(decodeBase64Url(parts[1]));
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

export function sessionFromAccessToken(token: string, nowSec: number): CursorSession | undefined {
    const trimmed = token.trim();
    if (trimmed === '')
        return undefined;
    const payload = decodeJwtPayload(trimmed);
    if (!payload)
        return undefined;
    const subject = typeof payload['sub'] === 'string' ? payload['sub'] : '';
    const userId = subject.split('|').filter(part => part.length > 0).at(-1) ?? '';
    if (!USER_ID_CHARS.test(userId))
        return undefined;
    const exp = payload['exp'];
    if (typeof exp !== 'number' || !Number.isFinite(exp))
        return undefined;
    if (exp - nowSec <= 60)
        return undefined;
    return { accessToken: trimmed, userId, expiresAt: exp };
}

export function cookieHeader(session: CursorSession): string {
    return `WorkosCursorSessionToken=${session.userId}%3A%3A${session.accessToken}`;
}

export function tokenFromAuthJson(text: string): string | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!isRecord(parsed))
        return undefined;
    const token = parsed['accessToken'];
    if (typeof token !== 'string')
        return undefined;
    const trimmed = token.trim();
    return trimmed === '' ? undefined : trimmed;
}

export function decodeSqliteToken(raw: string): string | undefined {
    let text = raw.trim();
    if (text.includes('\0'))
        text = text.replaceAll('\0', '').trim();
    if (text === '' || text === 'null')
        return undefined;
    return text;
}
