import { describe, expect, it } from 'vitest';

import { ACTIONS, behaviorOf } from '../src/core/actions.js';
import { previewOf } from '../src/core/preview.js';

const inside = (v: number) => v >= 0 && v <= 1;

describe('previewOf', () => {
  it('gives every action a preview', () => {
    for (const action of ACTIONS) expect(previewOf(action.behavior), action.id).toBeDefined();
  });

  it('keeps every layout on the miniature screen', () => {
    for (const action of ACTIONS) {
      const preview = previewOf(action.behavior);
      if (preview.kind !== 'layout') continue;
      for (const r of [preview.window, preview.before].filter((r) => r !== undefined)) {
        expect([r.x0, r.x1, r.y0, r.y1].every(inside), action.id).toBe(true);
        expect(r.x1 > r.x0 && r.y1 > r.y0, action.id).toBe(true);
      }
    }
  });

  it('shows the first size of a cycling action', () => {
    expect(previewOf(behaviorOf('left-half'))).toEqual({ kind: 'layout', window: { x0: 0, x1: 0.5, y0: 0, y1: 1 } });
    expect(previewOf(behaviorOf('last-third'))).toMatchObject({ window: { x0: 2 / 3, x1: 1 } });
  });

  it('follows the Almost Maximize setting', () => {
    const preview = previewOf(behaviorOf('almost-maximize'), 0.8);
    if (preview.kind !== 'layout') throw new Error('expected a layout');
    for (const [got, want] of [
      [preview.window.x0, 0.1],
      [preview.window.x1, 0.9],
      [preview.window.y0, 0.1],
      [preview.window.y1, 0.9],
    ])
      expect(got).toBeCloseTo(want!);
  });

  it('draws the old size for resize actions', () => {
    const larger = previewOf(behaviorOf('make-larger'));
    const smaller = previewOf(behaviorOf('make-smaller'));
    if (larger.kind !== 'layout' || smaller.kind !== 'layout') throw new Error('expected layouts');
    expect(larger.window.x1 - larger.window.x0).toBeGreaterThan(larger.before!.x1 - larger.before!.x0);
    expect(smaller.window).toEqual(larger.before);

    const width = previewOf(behaviorOf('larger-width'));
    if (width.kind !== 'layout') throw new Error('expected a layout');
    expect(width.window.y1 - width.window.y0).toBeCloseTo(width.before!.y1 - width.before!.y0);
  });

  it('uses icons for actions without a fixed position', () => {
    expect(previewOf(behaviorOf('restore'))).toEqual({ kind: 'icon', icon: 'edit-undo-symbolic' });
    expect(previewOf(behaviorOf('move-up'))).toEqual({ kind: 'icon', icon: 'go-up-symbolic' });
    expect(previewOf(behaviorOf('rotate-display-left'))).toEqual({ kind: 'icon', icon: 'object-rotate-left-symbolic' });
  });
});
