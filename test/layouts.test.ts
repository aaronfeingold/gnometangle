import { describe, expect, it } from 'vitest';

import { behaviorOf, CUSTOM_LAYOUT_DEFAULTS, customLayoutKey } from '../src/core/actions.js';
import { computeTarget } from '../src/core/geometry.js';
import { layoutRegion } from '../src/core/layouts.js';

describe('layoutRegion', () => {
  it('converts percents to fractions', () => {
    expect(layoutRegion([0, 60, 0, 100], 1)).toEqual({ x0: 0, x1: 0.6, y0: 0, y1: 1 });
  });

  it('orders swapped edges and clamps them to the screen', () => {
    expect(layoutRegion([70, 20, 120, -5], 1)).toEqual({ x0: 0.2, x1: 0.7, y0: 0, y1: 1 });
  });

  it('keeps a minimum size, even at the screen edge', () => {
    expect(layoutRegion([50, 50, 0, 100], 1)).toMatchObject({ x0: 0.5, x1: 0.55 });
    expect(layoutRegion([100, 100, 0, 100], 1)).toMatchObject({ x0: 0.95, x1: 1 });
  });

  it("falls back to the slot's default for a malformed value", () => {
    expect(layoutRegion([], 2)).toEqual({ x0: 0.6, x1: 1, y0: 0, y1: 1 });
    expect(layoutRegion([1, 2, Number.NaN, 4], 3)).toEqual({ x0: 0, x1: 0.4, y0: 0, y1: 1 });
  });

  it('defaults to two 60/40 pairs that tile the screen', () => {
    const [a, b, c, d] = CUSTOM_LAYOUT_DEFAULTS.map((edges, i) => layoutRegion(edges, i + 1));
    expect(a!.x1).toBe(b!.x0);
    expect(c!.x1).toBe(d!.x0);
    expect(customLayoutKey(1)).toBe('custom-layout-1-edges');
  });
});

describe('custom layout geometry', () => {
  const workArea = { x: 0, y: 0, width: 2000, height: 1000 };
  const ctx = { workArea, current: workArea, repeat: 0, gap: 0, almostMaximizeRatio: 0.9, sizeStep: 30 };

  it('places the window in its slot', () => {
    const customLayouts = [layoutRegion([0, 60, 0, 100], 1), layoutRegion([60, 100, 0, 50], 2)];
    expect(computeTarget('custom-layout-1', { ...ctx, customLayouts })).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 1000,
    });
    expect(computeTarget('custom-layout-2', { ...ctx, customLayouts })).toEqual({
      x: 1200,
      y: 0,
      width: 800,
      height: 500,
    });
  });

  it("uses the slot's default without layouts", () => {
    expect(behaviorOf('custom-layout-2').kind).toBe('custom');
    expect(computeTarget('custom-layout-2', ctx)).toEqual({ x: 1200, y: 0, width: 800, height: 1000 });
  });
});
