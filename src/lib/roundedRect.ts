export function insideRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): boolean {
    const r = Math.min(radius, width / 2, height / 2);
    if (r <= 0)
        return true;
    if (x >= r && x < width - r)
        return true;
    if (y >= r && y < height - r)
        return true;
    if (x < r && y < r) {
        const dx = r - x - 0.5;
        const dy = r - y - 0.5;
        return dx * dx + dy * dy <= r * r;
    }
    if (x >= width - r && y < r) {
        const dx = x - (width - r) + 0.5;
        const dy = r - y - 0.5;
        return dx * dx + dy * dy <= r * r;
    }
    if (x < r && y >= height - r) {
        const dx = r - x - 0.5;
        const dy = y - (height - r) + 0.5;
        return dx * dx + dy * dy <= r * r;
    }
    const dx = x - (width - r) + 0.5;
    const dy = y - (height - r) + 0.5;
    return dx * dx + dy * dy <= r * r;
}
