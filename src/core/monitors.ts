import type { DisplayTarget, Edge } from './actions.js';
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

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** Compares scores element by element, the first difference deciding. */
const lessThan = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};

/**
 * The nearest monitor in `edge`'s direction of the physical layout, or `current` if there is none.
 * Monitors that line up with the current one (overlap on the other axis) win over diagonal ones.
 */
export function monitorInDirection(geometries: readonly Rect[], current: number, edge: Edge): number {
  const from = geometries[current];
  if (!from) return current;
  const horizontal = edge === 'left' || edge === 'right';
  let best = current;
  let bestScore: [number, number, number] | null = null;
  geometries.forEach((g, index) => {
    if (index === current) return;
    let gap: number;
    if (edge === 'right') gap = g.x - (from.x + from.width);
    else if (edge === 'left') gap = from.x - (g.x + g.width);
    else if (edge === 'bottom') gap = g.y - (from.y + from.height);
    else gap = from.y - (g.y + g.height);
    if (gap < 0) return;
    const shared = horizontal
      ? overlap(from.y, from.y + from.height, g.y, g.y + g.height)
      : overlap(from.x, from.x + from.width, g.x, g.x + g.width);
    const offset = horizontal
      ? Math.abs(g.y + g.height / 2 - (from.y + from.height / 2))
      : Math.abs(g.x + g.width / 2 - (from.x + from.width / 2));
    const score: [number, number, number] = [shared > 0 ? 0 : 1, gap, offset];
    if (!bestScore || lessThan(score, bestScore)) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Resolves a display target to a monitor index, or `current` when there is nowhere to go. */
export function resolveDisplay(geometries: readonly Rect[], current: number, target: DisplayTarget): number {
  if (target === 'next') return neighborMonitor(geometries, current, 1);
  if (target === 'previous') return neighborMonitor(geometries, current, -1);
  if (typeof target === 'number') return orderMonitors(geometries)[target - 1] ?? current;
  return monitorInDirection(geometries, current, target);
}
