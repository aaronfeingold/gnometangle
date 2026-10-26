import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../src/core/actions.js';
import { logicalSize, rotationPlan, type LogicalMonitor, type Mode } from '../src/core/rotation.js';

const laptop: Mode = { id: '1920x1080@60', width: 1920, height: 1080 };
const external: Mode = { id: '2560x1440@60', width: 2560, height: 1440 };
const modes = new Map([
  ['eDP-1', laptop],
  ['DP-1', external],
]);

const monitor = (connector: string, x: number, y = 0, scale = 1, transform = 0): LogicalMonitor => ({
  x,
  y,
  scale,
  transform,
  primary: connector === 'eDP-1',
  connectors: [connector],
});

const positions = (plan: LogicalMonitor[] | null) => plan?.map((m) => [m.connectors[0], m.x, m.y, m.transform]);

describe('logicalSize', () => {
  it('swaps width and height for a quarter turn either way', () => {
    expect(logicalSize(laptop, 1, 1, false)).toEqual([1080, 1920]);
    expect(logicalSize(laptop, 1, 3, false)).toEqual([1080, 1920]);
    expect(logicalSize(laptop, 1, 2, false)).toEqual([1920, 1080]);
  });

  it('divides by the scale in the logical layout but not the physical one', () => {
    expect(logicalSize(laptop, 2, 1, false)).toEqual([540, 960]);
    expect(logicalSize(laptop, 2, 1, true)).toEqual([1080, 1920]);
  });
});

describe('rotationPlan', () => {
  it('turns a lone display into portrait', () => {
    expect(positions(rotationPlan([monitor('eDP-1', 0)], modes, 'eDP-1', 'right', false))).toEqual([
      ['eDP-1', 0, 0, 1],
    ]);
    expect(positions(rotationPlan([monitor('eDP-1', 0)], modes, 'eDP-1', 'left', false))).toEqual([['eDP-1', 0, 0, 3]]);
  });

  it('pulls a display on the right in to stay next to the narrower portrait one', () => {
    const layout = [monitor('eDP-1', 0), monitor('DP-1', 1920)];
    expect(positions(rotationPlan(layout, modes, 'eDP-1', 'right', false))).toEqual([
      ['eDP-1', 0, 0, 1],
      ['DP-1', 1080, 0, 0],
    ]);
  });

  it('leaves a display on the left where it is', () => {
    const layout = [monitor('DP-1', 0), monitor('eDP-1', 2560)];
    expect(positions(rotationPlan(layout, modes, 'eDP-1', 'left', false))).toEqual([
      ['DP-1', 0, 0, 0],
      ['eDP-1', 2560, 0, 3],
    ]);
  });

  it('moves a display below down by the extra height', () => {
    const layout = [monitor('eDP-1', 0), monitor('DP-1', 0, 1080)];
    expect(positions(rotationPlan(layout, modes, 'eDP-1', 'right', false))).toEqual([
      ['eDP-1', 0, 0, 1],
      ['DP-1', 0, 1920, 0],
    ]);
  });

  it('uses scaled sizes in the logical layout', () => {
    const layout = [monitor('eDP-1', 0, 0, 2), monitor('DP-1', 960)];
    expect(positions(rotationPlan(layout, modes, 'eDP-1', 'right', false))).toEqual([
      ['eDP-1', 0, 0, 1],
      ['DP-1', 540, 0, 0],
    ]);
  });

  it('turns back to landscape, pushing the neighbour out again', () => {
    const layout = [monitor('eDP-1', 0, 0, 1, 1), monitor('DP-1', 1080)];
    expect(positions(rotationPlan(layout, modes, 'eDP-1', 'normal', false))).toEqual([
      ['eDP-1', 0, 0, 0],
      ['DP-1', 1920, 0, 0],
    ]);
  });

  it('rotates an external display without moving the laptop', () => {
    const layout = [monitor('eDP-1', 0), monitor('DP-1', 1920)];
    expect(positions(rotationPlan(layout, modes, 'DP-1', 'left', false))).toEqual([
      ['eDP-1', 0, 0, 0],
      ['DP-1', 1920, 0, 3],
    ]);
  });

  it('keeps scale and primary as they were', () => {
    const plan = rotationPlan([monitor('eDP-1', 0, 0, 1.5)], modes, 'eDP-1', 'right', false);
    expect(plan?.[0]).toMatchObject({ scale: 1.5, primary: true });
  });

  it('does nothing when already rotated that way or for an unknown display', () => {
    expect(rotationPlan([monitor('eDP-1', 0, 0, 1, 1)], modes, 'eDP-1', 'right', false)).toBeNull();
    expect(rotationPlan([monitor('eDP-1', 0)], modes, 'eDP-1', 'normal', false)).toBeNull();
    expect(rotationPlan([monitor('eDP-1', 0)], modes, 'HDMI-1', 'right', false)).toBeNull();
  });
});

describe('rotate actions', () => {
  it('turn right, left and back, with no default shortcuts', () => {
    const rotate = ACTIONS.filter((a) => a.behavior.kind === 'rotate-display');
    expect(rotate.map((a) => [a.id, a.defaults])).toEqual([
      ['rotate-display-right', []],
      ['rotate-display-left', []],
      ['reset-display-rotation', []],
    ]);
  });
});
