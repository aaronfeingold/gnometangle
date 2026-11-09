import { CUSTOM_LAYOUT_DEFAULTS, type Region } from './actions.js';

/** Smallest width or height a custom layout can have, in percent, so a slip in the preferences can't make it vanish. */
export const MIN_LAYOUT_PERCENT = 5;

const clampPercent = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/** Orders one axis's two edges and widens them to the minimum size, staying within 0–100. */
function span(a: number, b: number): [number, number] {
  let lo = Math.min(clampPercent(a), clampPercent(b));
  let hi = Math.max(clampPercent(a), clampPercent(b));
  if (hi - lo < MIN_LAYOUT_PERCENT) {
    hi = Math.min(100, lo + MIN_LAYOUT_PERCENT);
    lo = hi - MIN_LAYOUT_PERCENT;
  }
  return [lo, hi];
}

/**
 * Turns a custom layout's stored [left, right, top, bottom] percents into a region. Swapped,
 * out-of-range or too-small edges are fixed up, and a malformed value falls back to `slot`'s default.
 */
export function layoutRegion(edges: readonly number[], slot: number): Region {
  const valid = edges.length === 4 && edges.every((v) => Number.isFinite(v));
  const [l, r, t, b] = valid ? edges : (CUSTOM_LAYOUT_DEFAULTS[slot - 1] ?? [0, 100, 0, 100]);
  const [x0, x1] = span(l!, r!);
  const [y0, y1] = span(t!, b!);
  return { x0: x0 / 100, x1: x1 / 100, y0: y0 / 100, y1: y1 / 100 };
}
