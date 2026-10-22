import type { ActionId } from './actions.js';
import type { Rect, Region } from './types.js';

export interface GeometryOptions {
  /** Pixels between windows and around the work area edges. */
  gap: number;
  /** Fraction of the work area used by Almost Maximize, for example 0.9. */
  almostMaximizeRatio: number;
  /** Pixels added or removed on each side by Make Larger and Make Smaller. */
  sizeStep: number;
}

export interface GeometryContext extends GeometryOptions {
  workArea: Rect;
  /** The window's current frame. */
  current: Rect;
  /** How many times this action has been repeated in a row on this window (0 on first press). */
  repeat: number;
}

/** Sizes Rectangle cycles through when a half action is repeated. */
export const HALF_CYCLE = [1 / 2, 2 / 3, 1 / 3] as const;

/** Smallest size Make Smaller will shrink to, as a fraction of the work area. */
export const MIN_SIZE_RATIO = 0.25;

const FULL: Region = { x0: 0, x1: 1, y0: 0, y1: 1 };

const span = (a: number, b: number): [number, number] => [a, b];

/**
 * Segments for the "thirds" and "fourths" families along the major axis, so on a portrait
 * monitor thirds stack vertically like Rectangle does.
 */
function segment(workArea: Rect, [a, b]: [number, number]): Region {
  return workArea.height > workArea.width ? { x0: 0, x1: 1, y0: a, y1: b } : { x0: a, x1: b, y0: 0, y1: 1 };
}

const THIRDS = [span(0, 1 / 3), span(1 / 3, 2 / 3), span(2 / 3, 1)];

/** Returns the region an action targets, or null when the action is not region based. */
export function regionFor(action: ActionId, workArea: Rect, repeat: number, cycle = true): Region | null {
  const i = cycle ? repeat : 0;
  const half = HALF_CYCLE[i % HALF_CYCLE.length]!;
  switch (action) {
    case 'left-half':
      return { x0: 0, x1: half, y0: 0, y1: 1 };
    case 'right-half':
      return { x0: 1 - half, x1: 1, y0: 0, y1: 1 };
    case 'top-half':
      return { x0: 0, x1: 1, y0: 0, y1: half };
    case 'bottom-half':
      return { x0: 0, x1: 1, y0: 1 - half, y1: 1 };
    case 'center-half':
      return { x0: 0.25, x1: 0.75, y0: 0, y1: 1 };
    case 'top-left':
      return { x0: 0, x1: 0.5, y0: 0, y1: 0.5 };
    case 'top-right':
      return { x0: 0.5, x1: 1, y0: 0, y1: 0.5 };
    case 'bottom-left':
      return { x0: 0, x1: 0.5, y0: 0.5, y1: 1 };
    case 'bottom-right':
      return { x0: 0.5, x1: 1, y0: 0.5, y1: 1 };
    case 'first-third':
      return segment(workArea, THIRDS[i % 3]!);
    case 'center-third':
      return segment(workArea, THIRDS[1]!);
    case 'last-third':
      return segment(workArea, THIRDS[2 - (i % 3)]!);
    case 'first-two-thirds':
      return segment(workArea, span(0, 2 / 3));
    case 'center-two-thirds':
      return segment(workArea, span(1 / 6, 5 / 6));
    case 'last-two-thirds':
      return segment(workArea, span(1 / 3, 1));
    case 'first-fourth':
      return segment(workArea, span(0, 0.25));
    case 'second-fourth':
      return segment(workArea, span(0.25, 0.5));
    case 'third-fourth':
      return segment(workArea, span(0.5, 0.75));
    case 'last-fourth':
      return segment(workArea, span(0.75, 1));
    case 'first-three-fourths':
      return segment(workArea, span(0, 0.75));
    case 'center-three-fourths':
      return segment(workArea, span(0.125, 0.875));
    case 'last-three-fourths':
      return segment(workArea, span(0.25, 1));
    case 'maximize':
      return FULL;
    default:
      return null;
  }
}

/** Converts a fractional region to pixels. Adjacent regions share edges exactly. */
export function regionToRect(region: Region, workArea: Rect): Rect {
  const left = workArea.x + Math.round(region.x0 * workArea.width);
  const right = workArea.x + Math.round(region.x1 * workArea.width);
  const top = workArea.y + Math.round(region.y0 * workArea.height);
  const bottom = workArea.y + Math.round(region.y1 * workArea.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Insets a rect by the gap: a full gap on edges touching the work area, half a gap on
 * interior edges, so two neighbouring windows end up exactly one gap apart.
 */
export function applyGap(rect: Rect, workArea: Rect, gap: number): Rect {
  if (gap <= 0) return rect;
  const lo = Math.ceil(gap / 2);
  const hi = Math.floor(gap / 2);
  const left = rect.x <= workArea.x ? gap : lo;
  const top = rect.y <= workArea.y ? gap : lo;
  const right = rect.x + rect.width >= workArea.x + workArea.width ? gap : hi;
  const bottom = rect.y + rect.height >= workArea.y + workArea.height ? gap : hi;
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(1, rect.width - left - right),
    height: Math.max(1, rect.height - top - bottom),
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Moves a rect inside the work area, shrinking it first if it is too large. */
export function clampToWorkArea(rect: Rect, workArea: Rect): Rect {
  const width = Math.min(rect.width, workArea.width);
  const height = Math.min(rect.height, workArea.height);
  return {
    x: clamp(rect.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(rect.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height,
  };
}

export function centerRect(rect: Rect, workArea: Rect): Rect {
  const width = Math.min(rect.width, workArea.width);
  const height = Math.min(rect.height, workArea.height);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

function resizeAxis(
  start: number,
  size: number,
  areaStart: number,
  areaSize: number,
  delta: number,
  minSize: number,
): [number, number] {
  const tolerance = 2;
  const end = start + size;
  const areaEnd = areaStart + areaSize;
  const touchesStart = Math.abs(start - areaStart) <= tolerance;
  const touchesEnd = Math.abs(end - areaEnd) <= tolerance;
  const newSize = clamp(size + 2 * delta, Math.min(minSize, size), areaSize);
  const change = newSize - size;
  let newStart: number;
  if (touchesStart && !touchesEnd) newStart = start;
  else if (touchesEnd && !touchesStart) newStart = start - change;
  else newStart = start - Math.round(change / 2);
  return [clamp(newStart, areaStart, areaEnd - newSize), newSize];
}

/**
 * Grows or shrinks a window by `step` on each side. Edges pinned to the work area stay
 * pinned, so a window snapped to the left half grows to the right.
 */
export function resizeRect(rect: Rect, workArea: Rect, step: number, grow: boolean): Rect {
  const delta = grow ? step : -step;
  const [x, width] = resizeAxis(
    rect.x,
    rect.width,
    workArea.x,
    workArea.width,
    delta,
    Math.round(workArea.width * MIN_SIZE_RATIO),
  );
  const [y, height] = resizeAxis(
    rect.y,
    rect.height,
    workArea.y,
    workArea.height,
    delta,
    Math.round(workArea.height * MIN_SIZE_RATIO),
  );
  return { x, y, width, height };
}

/** Maps a rect from one work area to another, keeping its relative position and size. */
export function mapToWorkArea(rect: Rect, from: Rect, to: Rect): Rect {
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return clampToWorkArea(
    {
      x: to.x + Math.round((rect.x - from.x) * sx),
      y: to.y + Math.round((rect.y - from.y) * sy),
      width: Math.round(rect.width * sx),
      height: Math.round(rect.height * sy),
    },
    to,
  );
}

/**
 * Moves a window to another work area. Snapped windows scale with the work area so they keep
 * their layout; floating windows keep their size and the relative position of their center.
 */
export function moveToWorkArea(rect: Rect, from: Rect, to: Rect, scale: boolean): Rect {
  if (scale) return mapToWorkArea(rect, from, to);
  const cx = (rect.x + rect.width / 2 - from.x) / from.width;
  const cy = (rect.y + rect.height / 2 - from.y) / from.height;
  const width = Math.min(rect.width, to.width);
  const height = Math.min(rect.height, to.height);
  return clampToWorkArea(
    {
      x: to.x + Math.round(cx * to.width - width / 2),
      y: to.y + Math.round(cy * to.height - height / 2),
      width,
      height,
    },
    to,
  );
}

/**
 * Computes the target frame for every action that resolves to a rectangle on the current
 * monitor. Restore and display moves need window history or other monitors, so they are
 * handled by the caller and return null here.
 */
export function computeTarget(action: ActionId, ctx: GeometryContext, cycle = true): Rect | null {
  const { workArea, current, gap } = ctx;
  const region = regionFor(action, workArea, ctx.repeat, cycle);
  if (region) return applyGap(regionToRect(region, workArea), workArea, gap);

  switch (action) {
    case 'almost-maximize': {
      const r = clamp(ctx.almostMaximizeRatio, 0.1, 1);
      const size = { x: 0, y: 0, width: Math.round(workArea.width * r), height: Math.round(workArea.height * r) };
      return centerRect(size, workArea);
    }
    case 'maximize-height': {
      const g = Math.max(0, gap);
      return { x: current.x, y: workArea.y + g, width: current.width, height: workArea.height - 2 * g };
    }
    case 'make-smaller':
      return resizeRect(current, workArea, ctx.sizeStep, false);
    case 'make-larger':
      return resizeRect(current, workArea, ctx.sizeStep, true);
    case 'center':
      return centerRect(current, workArea);
    default:
      return null;
  }
}

/** True when every edge of `a` is within `tolerance` pixels of the same edge of `b`. */
export function rectsClose(a: Rect, b: Rect, tolerance = 40): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.x + a.width - (b.x + b.width)) <= tolerance &&
    Math.abs(a.y + a.height - (b.y + b.height)) <= tolerance
  );
}
