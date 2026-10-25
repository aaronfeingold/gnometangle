import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../src/core/actions.js';
import {
  applyGap,
  centerRect,
  computeTarget,
  mapToWorkArea,
  moveToEdge,
  moveToWorkArea,
  rectsClose,
  regionFor,
  regionToRect,
  resizeRect,
  type GeometryContext,
} from '../src/core/geometry.js';
import type { Rect } from '../src/core/types.js';

// A 1920x1080 monitor with a 32px top bar.
const WA: Rect = { x: 0, y: 32, width: 1920, height: 1048 };
const WINDOW: Rect = { x: 100, y: 100, width: 800, height: 600 };

const ctx = (overrides: Partial<GeometryContext> = {}): GeometryContext => ({
  workArea: WA,
  current: WINDOW,
  repeat: 0,
  gap: 0,
  almostMaximizeRatio: 0.9,
  sizeStep: 30,
  ...overrides,
});

const target = (id: Parameters<typeof computeTarget>[0], o: Partial<GeometryContext> = {}, cycle = true) =>
  computeTarget(id, ctx(o), cycle);

describe('halves', () => {
  it('snaps left and right halves', () => {
    expect(target('left-half')).toEqual({ x: 0, y: 32, width: 960, height: 1048 });
    expect(target('right-half')).toEqual({ x: 960, y: 32, width: 960, height: 1048 });
  });

  it('snaps top and bottom halves', () => {
    expect(target('top-half')).toEqual({ x: 0, y: 32, width: 1920, height: 524 });
    expect(target('bottom-half')).toEqual({ x: 0, y: 556, width: 1920, height: 524 });
  });

  it('cycles 1/2, 2/3, 1/3 and wraps around', () => {
    const widths = [0, 1, 2, 3].map((repeat) => target('left-half', { repeat })!.width);
    expect(widths).toEqual([960, 1280, 640, 960]);
    expect(target('right-half', { repeat: 1 })).toEqual({ x: 640, y: 32, width: 1280, height: 1048 });
  });

  it('does not cycle when cycling is disabled', () => {
    expect(target('left-half', { repeat: 1 }, false)!.width).toBe(960);
  });

  it('centers the center half', () => {
    expect(target('center-half')).toEqual({ x: 480, y: 32, width: 960, height: 1048 });
  });
});

describe('corners', () => {
  it('snaps each quarter', () => {
    expect(target('top-left')).toEqual({ x: 0, y: 32, width: 960, height: 524 });
    expect(target('top-right')).toEqual({ x: 960, y: 32, width: 960, height: 524 });
    expect(target('bottom-left')).toEqual({ x: 0, y: 556, width: 960, height: 524 });
    expect(target('bottom-right')).toEqual({ x: 960, y: 556, width: 960, height: 524 });
  });
});

describe('thirds and fourths', () => {
  it('snaps thirds that tile the screen exactly', () => {
    const a = target('first-third')!;
    const b = target('center-third')!;
    const c = target('last-third')!;
    expect([a.x, b.x, c.x]).toEqual([0, 640, 1280]);
    expect(a.width + b.width + c.width).toBe(1920);
  });

  it('cycles first third forward and last third backward', () => {
    expect([0, 1, 2].map((repeat) => target('first-third', { repeat })!.x)).toEqual([0, 640, 1280]);
    expect([0, 1, 2].map((repeat) => target('last-third', { repeat })!.x)).toEqual([1280, 640, 0]);
  });

  it('snaps two thirds', () => {
    expect(target('first-two-thirds')).toEqual({ x: 0, y: 32, width: 1280, height: 1048 });
    expect(target('last-two-thirds')).toEqual({ x: 640, y: 32, width: 1280, height: 1048 });
    expect(target('center-two-thirds')).toEqual({ x: 320, y: 32, width: 1280, height: 1048 });
  });

  it('snaps fourths and three fourths', () => {
    expect(target('first-fourth')!.x).toBe(0);
    expect(target('second-fourth')!.x).toBe(480);
    expect(target('third-fourth')!.x).toBe(960);
    expect(target('last-fourth')).toEqual({ x: 1440, y: 32, width: 480, height: 1048 });
    expect(target('first-three-fourths')!.width).toBe(1440);
    expect(target('last-three-fourths')).toEqual({ x: 480, y: 32, width: 1440, height: 1048 });
    expect(target('center-three-fourths')).toEqual({ x: 240, y: 32, width: 1440, height: 1048 });
  });

  it('stacks thirds vertically on a portrait monitor', () => {
    const portrait: Rect = { x: 0, y: 0, width: 1080, height: 1920 };
    expect(target('first-third', { workArea: portrait })).toEqual({ x: 0, y: 0, width: 1080, height: 640 });
    expect(regionFor('left-half', portrait, 0)).toEqual({ x0: 0, x1: 0.5, y0: 0, y1: 1 });
  });
});

describe('size and position', () => {
  it('maximizes to the work area', () => {
    expect(target('maximize-window')).toEqual(WA);
  });

  it('almost maximizes centered at the configured ratio', () => {
    expect(target('almost-maximize')).toEqual({ x: 96, y: 85, width: 1728, height: 943 });
  });

  it('maximizes height and keeps horizontal position', () => {
    expect(target('maximize-height')).toEqual({ x: 100, y: 32, width: 800, height: 1048 });
    expect(target('maximize-height', { gap: 10 })).toEqual({ x: 100, y: 42, width: 800, height: 1028 });
  });

  it('centers without resizing', () => {
    expect(target('center')).toEqual({ x: 560, y: 256, width: 800, height: 600 });
    expect(centerRect({ x: 0, y: 0, width: 5000, height: 5000 }, WA)).toEqual(WA);
  });

  it('grows and shrinks around the center of a floating window', () => {
    expect(target('make-larger')).toEqual({ x: 70, y: 70, width: 860, height: 660 });
    expect(target('make-smaller')).toEqual({ x: 130, y: 130, width: 740, height: 540 });
  });

  it('keeps pinned edges pinned when resizing a snapped window', () => {
    const left = target('left-half')!;
    expect(resizeRect(left, WA, 30, true)).toEqual({ x: 0, y: 32, width: 1020, height: 1048 });
    expect(resizeRect(left, WA, 30, false)).toEqual({ x: 0, y: 62, width: 900, height: 988 });
    const right = target('right-half')!;
    expect(resizeRect(right, WA, 30, true)).toEqual({ x: 900, y: 32, width: 1020, height: 1048 });
  });

  it('never shrinks below a quarter of the work area', () => {
    let r = WINDOW;
    for (let i = 0; i < 50; i++) r = resizeRect(r, WA, 30, false);
    expect(r.width).toBe(480);
    expect(r.height).toBe(262);
  });

  // Restore, display and workspace moves need window history or other monitors and workspaces.
  const outside = [
    'restore',
    'next-display',
    'previous-display',
    'send-to-workspace-1',
    'send-to-workspace-9',
    'send-to-next-workspace',
    'send-to-previous-workspace',
  ] as const;

  it('returns null for actions handled outside geometry', () => {
    for (const id of outside) expect(target(id)).toBeNull();
  });

  it('handles every non-history action', () => {
    const handled = ACTIONS.filter((a) => !['restore', 'display', 'workspace'].includes(a.behavior.kind));
    expect(handled.length).toBe(ACTIONS.length - 14);
    for (const a of handled) expect(target(a.id), a.id).not.toBeNull();
  });
});

describe('gaps', () => {
  it('uses full gaps on screen edges and half gaps between windows', () => {
    const left = target('left-half', { gap: 10 })!;
    const right = target('right-half', { gap: 10 })!;
    expect(left).toEqual({ x: 10, y: 42, width: 945, height: 1028 });
    expect(right).toEqual({ x: 965, y: 42, width: 945, height: 1028 });
    expect(right.x - (left.x + left.width)).toBe(10);
  });

  it('keeps odd gaps exact between neighbours', () => {
    const left = target('left-half', { gap: 7 })!;
    const right = target('right-half', { gap: 7 })!;
    expect(right.x - (left.x + left.width)).toBe(7);
  });

  it('leaves the rect alone when the gap is zero', () => {
    const r = regionToRect({ x0: 0, x1: 0.5, y0: 0, y1: 1 }, WA);
    expect(applyGap(r, WA, 0)).toBe(r);
  });
});

describe('mapToWorkArea', () => {
  it('keeps relative position and size across monitors', () => {
    const from: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const to: Rect = { x: 1920, y: 0, width: 2560, height: 1440 };
    const leftHalf = { x: 0, y: 0, width: 960, height: 1080 };
    expect(mapToWorkArea(leftHalf, from, to)).toEqual({ x: 1920, y: 0, width: 1280, height: 1440 });
  });

  it('keeps the result inside the target', () => {
    const from: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
    const to: Rect = { x: 1000, y: 0, width: 500, height: 500 };
    const r = mapToWorkArea({ x: 900, y: 900, width: 400, height: 400 }, from, to);
    expect(r.x + r.width).toBeLessThanOrEqual(1500);
    expect(r.y + r.height).toBeLessThanOrEqual(500);
  });
});

describe('moveToWorkArea', () => {
  const from: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
  const to: Rect = { x: 1920, y: 0, width: 1280, height: 1024 };

  it('keeps the size of floating windows', () => {
    const r = moveToWorkArea({ x: 710, y: 290, width: 500, height: 500 }, from, to, false);
    expect(r).toEqual({ x: 2310, y: 262, width: 500, height: 500 });
  });

  it('scales snapped windows', () => {
    const r = moveToWorkArea({ x: 0, y: 0, width: 960, height: 1080 }, from, to, true);
    expect(r).toEqual({ x: 1920, y: 0, width: 640, height: 1024 });
  });

  it('shrinks floating windows that do not fit', () => {
    const r = moveToWorkArea({ x: 0, y: 0, width: 1800, height: 1000 }, from, to, false);
    expect(r).toEqual({ x: 1920, y: 0, width: 1280, height: 1000 });
  });
});

describe('rectsClose', () => {
  it('tolerates small differences such as terminal size increments', () => {
    expect(rectsClose(WINDOW, { ...WINDOW, width: WINDOW.width - 7 })).toBe(true);
    expect(rectsClose(WINDOW, { ...WINDOW, x: WINDOW.x + 200 })).toBe(false);
  });
});

describe('width and height only', () => {
  it('resizes one dimension and leaves the other alone', () => {
    expect(target('larger-width')).toEqual({ x: 70, y: 100, width: 860, height: 600 });
    expect(target('smaller-width')).toEqual({ x: 130, y: 100, width: 740, height: 600 });
    expect(target('larger-height')).toEqual({ x: 100, y: 70, width: 800, height: 660 });
    expect(target('smaller-height')).toEqual({ x: 100, y: 130, width: 800, height: 540 });
  });

  it('keeps pinned edges pinned', () => {
    const left = target('left-half')!;
    expect(resizeRect(left, WA, 30, true, 'width')).toEqual({ x: 0, y: 32, width: 1020, height: 1048 });
    expect(resizeRect(left, WA, 30, false, 'height')).toEqual({ x: 0, y: 62, width: 960, height: 988 });
  });
});

describe('move to an edge', () => {
  it('slides to each edge without resizing', () => {
    expect(target('move-left')).toEqual({ x: 0, y: 100, width: 800, height: 600 });
    expect(target('move-right')).toEqual({ x: 1120, y: 100, width: 800, height: 600 });
    expect(target('move-up')).toEqual({ x: 100, y: 32, width: 800, height: 600 });
    expect(target('move-down')).toEqual({ x: 100, y: 480, width: 800, height: 600 });
  });

  it('stays a gap away from the edge', () => {
    expect(target('move-left', { gap: 10 })).toEqual({ x: 10, y: 100, width: 800, height: 600 });
    expect(target('move-down', { gap: 10 })).toEqual({ x: 100, y: 470, width: 800, height: 600 });
  });

  it('pulls a window that hangs off the screen back inside', () => {
    const offscreen: Rect = { x: -300, y: 900, width: 800, height: 600 };
    expect(moveToEdge(offscreen, WA, 'top', 0)).toEqual({ x: 0, y: 32, width: 800, height: 600 });
    expect(moveToEdge({ ...offscreen, width: 5000 }, WA, 'left', 0)).toEqual({
      x: 0,
      y: 480,
      width: 1920,
      height: 600,
    });
  });
});

describe('fourths', () => {
  it('have Ctrl+Alt+1 to 4 as defaults', () => {
    const fourths = ['first-fourth', 'second-fourth', 'third-fourth', 'last-fourth'];
    const defaults = fourths.map((id) => ACTIONS.find((a) => a.id === id)!.defaults);
    expect(defaults).toEqual([['<Control><Alt>1'], ['<Control><Alt>2'], ['<Control><Alt>3'], ['<Control><Alt>4']]);
  });
});
