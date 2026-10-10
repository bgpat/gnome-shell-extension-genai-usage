/** How far into the next service box the dragged box must reach before swapping. */
const ENTER_FRACTION = 0.25;

export interface PillBound {
    id: string;
    x: number;
    width: number;
}

/**
 * Order to show while the pointer is down.
 * Swap only once the pointer is inside the next service box. A swap sticks
 * until the pointer leaves that box.
 */
export function previewOrder(
    bounds: readonly PillBound[],
    draggedId: string,
    pointerX: number,
    currentIds: readonly string[],
): string[] {
    const start = bounds.map(bound => bound.id);
    const dragged = bounds.find(bound => bound.id === draggedId);
    if (!dragged)
        return currentIds.length > 0 ? [...currentIds] : start;
    const current = currentIds.length > 0 ? currentIds : start;
    const next = start.filter(id => id !== draggedId);
    let index = 0;
    for (const id of start) {
        if (id === draggedId)
            continue;
        const other = bounds.find(bound => bound.id === id);
        if (!other)
            continue;
        if (placeAfter(dragged, other, pointerX, current))
            index++;
    }
    next.splice(index, 0, draggedId);
    return next;
}

/** Insertion index to commit. `null` means the order did not change. */
export function reorderTarget(
    bounds: readonly PillBound[],
    draggedId: string,
    _startIndex: number,
    pointerX: number,
    currentIds: readonly string[],
): number | null {
    const start = bounds.map(bound => bound.id);
    const next = previewOrder(bounds, draggedId, pointerX, currentIds);
    if (next.length === start.length && next.every((id, index) => id === start[index]))
        return null;
    return next.indexOf(draggedId);
}

function placeAfter(
    dragged: PillBound,
    other: PillBound,
    pointerX: number,
    currentIds: readonly string[],
): boolean {
    const draggedAt = currentIds.indexOf(dragged.id);
    const otherAt = currentIds.indexOf(other.id);
    const currentlyAfter = draggedAt >= 0 && otherAt >= 0 && draggedAt > otherAt;
    const otherIsToTheRight = other.x + other.width / 2 >= dragged.x + dragged.width / 2;
    const inside = pointerX >= other.x && pointerX < other.x + other.width;
    if (otherIsToTheRight) {
        if (currentlyAfter)
            return pointerX >= other.x;
        return inside && pointerX >= other.x + other.width * ENTER_FRACTION;
    }
    if (!currentlyAfter)
        return pointerX > other.x + other.width;
    return !(inside && pointerX <= other.x + other.width * (1 - ENTER_FRACTION));
}
