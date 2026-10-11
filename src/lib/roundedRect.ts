export function insideRoundedRect(
    posX: number,
    posY: number,
    rectWidth: number,
    rectHeight: number,
    cornerRadius: number,
): boolean {
    const effectiveRadius = Math.min(cornerRadius, rectWidth / 2, rectHeight / 2);
    if (effectiveRadius <= 0)
        return true;
    if (posX >= effectiveRadius && posX < rectWidth - effectiveRadius)
        return true;
    if (posY >= effectiveRadius && posY < rectHeight - effectiveRadius)
        return true;
    if (posX < effectiveRadius && posY < effectiveRadius) {
        const offsetX = effectiveRadius - posX - 0.5;
        const offsetY = effectiveRadius - posY - 0.5;
        return offsetX * offsetX + offsetY * offsetY <= effectiveRadius * effectiveRadius;
    }
    if (posX >= rectWidth - effectiveRadius && posY < effectiveRadius) {
        const offsetX = posX - (rectWidth - effectiveRadius) + 0.5;
        const offsetY = effectiveRadius - posY - 0.5;
        return offsetX * offsetX + offsetY * offsetY <= effectiveRadius * effectiveRadius;
    }
    if (posX < effectiveRadius && posY >= rectHeight - effectiveRadius) {
        const offsetX = effectiveRadius - posX - 0.5;
        const offsetY = posY - (rectHeight - effectiveRadius) + 0.5;
        return offsetX * offsetX + offsetY * offsetY <= effectiveRadius * effectiveRadius;
    }
    const offsetX = posX - (rectWidth - effectiveRadius) + 0.5;
    const offsetY = posY - (rectHeight - effectiveRadius) + 0.5;
    return offsetX * offsetX + offsetY * offsetY <= effectiveRadius * effectiveRadius;
}
