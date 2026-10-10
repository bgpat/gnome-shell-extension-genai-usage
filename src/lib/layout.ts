export interface LayoutState {
    order: string[];
    hidden: string[];
}

export type LayoutArea = 'visible' | 'hidden';

export function normalizeLayout(order: string[], hidden: string[], knownIds: readonly string[]): LayoutState {
    const known = new Set(knownIds);
    const seen = new Set<string>();
    const nextOrder: string[] = [];
    for (const id of order) {
        if (!known.has(id) || seen.has(id))
            continue;
        seen.add(id);
        nextOrder.push(id);
    }
    for (const id of knownIds) {
        if (!seen.has(id))
            nextOrder.push(id);
    }
    const hiddenSet = new Set(hidden.filter(id => known.has(id)));
    return {
        order: nextOrder,
        hidden: nextOrder.filter(id => hiddenSet.has(id)),
    };
}

export function visibleIds(state: LayoutState, enabled: ReadonlySet<string>): string[] {
    const hidden = new Set(state.hidden);
    return state.order.filter(id => enabled.has(id) && !hidden.has(id));
}

export function hiddenIds(state: LayoutState, enabled: ReadonlySet<string>): string[] {
    const hidden = new Set(state.hidden);
    return state.order.filter(id => enabled.has(id) && hidden.has(id));
}

function inArea(id: string, state: LayoutState, enabled: ReadonlySet<string>, area: LayoutArea): boolean {
    if (!enabled.has(id))
        return false;
    const hidden = state.hidden.includes(id);
    return area === 'hidden' ? hidden : !hidden;
}

function rewriteArea(state: LayoutState, enabled: ReadonlySet<string>, area: LayoutArea, nextIds: string[]): LayoutState {
    let index = 0;
    const order = state.order.map(id => {
        if (!inArea(id, state, enabled, area))
            return id;
        return nextIds[index++] ?? id;
    });
    const hidden = new Set(state.hidden);
    return { order, hidden: order.filter(id => hidden.has(id)) };
}

export function nudge(
    state: LayoutState,
    enabled: ReadonlySet<string>,
    id: string,
    direction: -1 | 1,
): LayoutState {
    const area: LayoutArea = state.hidden.includes(id) ? 'hidden' : 'visible';
    const ids = state.order.filter(item => inArea(item, state, enabled, area));
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length)
        return state;
    const swapped = [...ids];
    const current = swapped[index];
    const other = swapped[target];
    if (current === undefined || other === undefined)
        return state;
    swapped[index] = other;
    swapped[target] = current;
    return rewriteArea(state, enabled, area, swapped);
}

export function placeProvider(
    state: LayoutState,
    enabled: ReadonlySet<string>,
    id: string,
    area: LayoutArea,
    index: number,
): LayoutState {
    if (!enabled.has(id) || !state.order.includes(id))
        return state;
    const hidden = new Set(state.hidden);
    if (area === 'hidden')
        hidden.add(id);
    else
        hidden.delete(id);

    const without = state.order.filter(item => item !== id);
    const draft: LayoutState = {
        order: without,
        hidden: without.filter(item => hidden.has(item)),
    };
    const target = draft.order.filter(item => inArea(item, draft, enabled, area));
    const clamped = Math.max(0, Math.min(index, target.length));
    const before = target[clamped];
    let order: string[];
    if (before === undefined) {
        const last = target[target.length - 1];
        if (last === undefined)
            order = [...without, id];
        else {
            const pos = without.indexOf(last);
            order = [...without.slice(0, pos + 1), id, ...without.slice(pos + 1)];
        }
    } else {
        const pos = without.indexOf(before);
        order = [...without.slice(0, pos), id, ...without.slice(pos)];
    }
    return {
        order,
        hidden: order.filter(item => hidden.has(item)),
    };
}

export function transfer(
    state: LayoutState,
    enabled: ReadonlySet<string>,
    id: string,
    area: LayoutArea,
): LayoutState {
    return placeProvider(state, enabled, id, area, Number.MAX_SAFE_INTEGER);
}

export const DEFAULT_LAYOUT: LayoutState = {
    order: ['chatgpt', 'cursor'],
    hidden: [],
};
