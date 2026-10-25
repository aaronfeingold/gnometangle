import { describe, expect, it } from 'vitest';

import { nextHistory } from '../src/core/cycle.js';
import { monitorInDirection, neighborMonitor, orderMonitors, resolveDisplay } from '../src/core/monitors.js';
import type { Rect } from '../src/core/types.js';

const mon = (x: number, y = 0): Rect => ({ x, y, width: 1920, height: 1080 });

describe('monitors', () => {
  it('orders monitors left to right regardless of index', () => {
    expect(orderMonitors([mon(1920), mon(0), mon(3840)])).toEqual([1, 0, 2]);
  });

  it('wraps around in both directions', () => {
    const monitors = [mon(1920), mon(0), mon(3840)];
    expect(neighborMonitor(monitors, 1, 1)).toBe(0);
    expect(neighborMonitor(monitors, 2, 1)).toBe(1);
    expect(neighborMonitor(monitors, 1, -1)).toBe(2);
  });

  it('stays put with a single monitor', () => {
    expect(neighborMonitor([mon(0)], 0, 1)).toBe(0);
  });
});

describe('nextHistory', () => {
  const frame: Rect = { x: 10, y: 10, width: 500, height: 400 };
  const half: Rect = { x: 0, y: 0, width: 960, height: 1080 };

  it('starts fresh and remembers the original frame', () => {
    expect(nextHistory(undefined, 'left-half', frame)).toEqual({ repeat: 0, restore: frame });
  });

  it('counts repeats while the window has not moved', () => {
    const prev = { restore: frame, lastAction: 'left-half' as const, lastTarget: half, repeat: 1 };
    expect(nextHistory(prev, 'left-half', half)).toEqual({ repeat: 2, restore: frame });
  });

  it('keeps the original restore frame across different actions', () => {
    const prev = { restore: frame, lastAction: 'left-half' as const, lastTarget: half, repeat: 0 };
    expect(nextHistory(prev, 'right-half', half)).toEqual({ repeat: 0, restore: frame });
  });

  it('resets after the user moves the window', () => {
    const prev = { restore: frame, lastAction: 'left-half' as const, lastTarget: half, repeat: 2 };
    const moved = { ...half, x: 600 };
    expect(nextHistory(prev, 'left-half', moved)).toEqual({ repeat: 0, restore: moved });
  });
});

describe('monitorInDirection', () => {
  // A laptop below-left of a wide monitor, with a portrait monitor to the wide one's right:
  //   [ wide 0 ][ portrait 2 ]
  //  [laptop 1]
  const wide: Rect = { x: 0, y: 0, width: 2560, height: 1440 };
  const laptop: Rect = { x: -400, y: 1440, width: 1920, height: 1200 };
  const portrait: Rect = { x: 2560, y: 0, width: 1080, height: 1920 };
  const layout = [wide, laptop, portrait];

  it('follows the physical layout', () => {
    expect(monitorInDirection(layout, 0, 'right')).toBe(2);
    expect(monitorInDirection(layout, 0, 'bottom')).toBe(1);
    expect(monitorInDirection(layout, 1, 'top')).toBe(0);
    expect(monitorInDirection(layout, 2, 'left')).toBe(0);
  });

  it('stays put when nothing is in that direction', () => {
    expect(monitorInDirection(layout, 0, 'top')).toBe(0);
    expect(monitorInDirection(layout, 2, 'right')).toBe(2);
  });

  it('prefers a monitor that lines up over a diagonal one', () => {
    // Two monitors to the right: one level with the current one, one lower but closer.
    const level: Rect = { x: 2000, y: 0, width: 1920, height: 1080 };
    const lower: Rect = { x: 1920, y: 1080, width: 1920, height: 1080 };
    expect(monitorInDirection([mon(0), lower, level], 0, 'right')).toBe(2);
  });

  it('picks the closest of several in line', () => {
    expect(monitorInDirection([mon(0), mon(3840), mon(1920)], 0, 'right')).toBe(2);
  });
});

describe('resolveDisplay', () => {
  const layout = [mon(1920), mon(0), mon(3840)];

  it('numbers displays left to right', () => {
    expect([1, 2, 3].map((n) => resolveDisplay(layout, 0, n))).toEqual([1, 0, 2]);
  });

  it('stays put for a display number that does not exist', () => {
    expect(resolveDisplay(layout, 0, 4)).toBe(0);
  });

  it('handles next, previous and directions', () => {
    expect(resolveDisplay(layout, 1, 'next')).toBe(0);
    expect(resolveDisplay(layout, 1, 'previous')).toBe(2);
    expect(resolveDisplay(layout, 0, 'left')).toBe(1);
  });
});
