import type { Rect } from './types.js';

/** Monitor indices ordered left to right, then top to bottom, like Rectangle's display order. */
export function orderMonitors(geometries: readonly Rect[]): number[] {
  return geometries
    .map((g, index) => ({ g, index }))
    .sort((a, b) => a.g.x - b.g.x || a.g.y - b.g.y)
    .map(({ index }) => index);
}

/** The monitor after (direction 1) or before (direction -1) `current`, wrapping around. */
export function neighborMonitor(geometries: readonly Rect[], current: number, direction: 1 | -1): number {
  const order = orderMonitors(geometries);
  const pos = order.indexOf(current);
  if (pos < 0 || order.length < 2) return current;
  return order[(pos + direction + order.length) % order.length]!;
}
