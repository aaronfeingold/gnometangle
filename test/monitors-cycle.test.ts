import { describe, expect, it } from 'vitest';

import { nextHistory } from '../src/core/cycle.js';
import { neighborMonitor, orderMonitors } from '../src/core/monitors.js';
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
