import GdkPixbuf from 'gi://GdkPixbuf';

import { insideRoundedRect } from '../lib/roundedRect.js';

const ALPHA_CUTOFF = 16;

/** ~3px radius on a 14px top-bar icon (applied in source pixel space). */
export const PANEL_ICON_CORNER_RADIUS_RATIO = 0.22;

function loadRgbaPixbuf(raw: Uint8Array): GdkPixbuf.Pixbuf | undefined {
    if (raw.length < 8)
        return undefined;
    const loader = new GdkPixbuf.PixbufLoader();
    loader.write(raw);
    loader.close();
    const pixbuf = loader.get_pixbuf();
    if (!pixbuf || pixbuf.get_n_channels() < 4)
        return undefined;
    return pixbuf;
}

function savePng(pixbuf: GdkPixbuf.Pixbuf): Uint8Array | undefined {
    const [ok, buffer] = pixbuf.save_to_bufferv('png', [], []);
    if (!ok || !buffer?.length)
        return undefined;
    return buffer;
}

/** Crop transparent borders so panel icons do not look padded (e.g. Google favicon PNG). */
export function trimTransparentPngBytes(raw: Uint8Array): Uint8Array {
    const pixbuf = loadRgbaPixbuf(raw);
    if (!pixbuf)
        return raw;
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    if (width <= 1 || height <= 1)
        return raw;
    const rowstride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();
    const pixels = pixbuf.get_pixels();

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
        const row = y * rowstride;
        for (let x = 0; x < width; x++) {
            const alpha = pixels[row + x * channels + 3]!;
            if (alpha > ALPHA_CUTOFF) {
                if (x < minX)
                    minX = x;
                if (y < minY)
                    minY = y;
                if (x > maxX)
                    maxX = x;
                if (y > maxY)
                    maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY)
        return raw;
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW === width && cropH === height)
        return raw;
    const cropped = pixbuf.new_subpixbuf(minX, minY, cropW, cropH);
    return savePng(cropped) ?? raw;
}

/** Clip opaque pixels to a rounded rectangle (St.Icon ignores CSS border-radius on file icons). */
export function roundPngCornersBytes(
    raw: Uint8Array,
    radiusRatio = PANEL_ICON_CORNER_RADIUS_RATIO,
): Uint8Array {
    const pixbuf = loadRgbaPixbuf(raw);
    if (!pixbuf)
        return raw;
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const radius = Math.floor(Math.min(width, height) * radiusRatio);
    if (radius < 2)
        return raw;
    const rowstride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();
    const pixels = pixbuf.get_pixels();
    let changed = false;
    for (let y = 0; y < height; y++) {
        const row = y * rowstride;
        for (let x = 0; x < width; x++) {
            const offset = row + x * channels + 3;
            const alpha = pixels[offset]!;
            if (alpha === 0)
                continue;
            if (insideRoundedRect(x, y, width, height, radius))
                continue;
            pixels[offset] = 0;
            changed = true;
        }
    }
    if (!changed)
        return raw;
    return savePng(pixbuf) ?? raw;
}

export function isPngBytes(bytes: Uint8Array): boolean {
    return bytes.length >= 8
        && bytes[0] === 0x89
        && bytes[1] === 0x50
        && bytes[2] === 0x4E
        && bytes[3] === 0x47;
}

export function preparePanelIconPngBytes(
    bytes: Uint8Array,
    contentType: string | undefined,
): Uint8Array {
    const media = contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (media !== 'image/png' && !isPngBytes(bytes))
        return bytes;
    try {
        const trimmed = trimTransparentPngBytes(bytes);
        return roundPngCornersBytes(trimmed);
    } catch {
        return bytes;
    }
}

/** @deprecated Use {@link preparePanelIconPngBytes}. */
export function trimPanelIconPngIfNeeded(bytes: Uint8Array, contentType: string | undefined): Uint8Array {
    return preparePanelIconPngBytes(bytes, contentType);
}
