import { behaviorOf, type ActionId, type Edge } from './actions.js';
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

/** Smallest size Make Smaller will shrink to, as a fraction of the work area. */
export const MIN_SIZE_RATIO = 0.25;

/** Pixels a window may land from the frame we asked for and still count as snapped: terminals round to whole cells. */
export const SNAP_TOLERANCE = 40;

/** Pixels an edge may sit from the work area's edge and still stay pinned on resize, to absorb rounding. */
export const EDGE_TOLERANCE = 2;

/** Returns the region an action targets, or null when the action is not region based. */
export function regionFor(action: ActionId, workArea: Rect, repeat: number, cycle = true): Region | null {
  const behavior = behaviorOf(action);
  if (behavior.kind !== 'region') return null;
  const { regions } = behavior;
  const region = regions[(cycle ? repeat : 0) % regions.length]!;
  if (behavior.majorAxis && workArea.height > workArea.width) {
    return { x0: region.y0, x1: region.y1, y0: region.x0, y1: region.x1 };
  }
  return region;
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
  const end = start + size;
  const areaEnd = areaStart + areaSize;
  const touchesStart = Math.abs(start - areaStart) <= EDGE_TOLERANCE;
  const touchesEnd = Math.abs(end - areaEnd) <= EDGE_TOLERANCE;
  const newSize = clamp(size + 2 * delta, Math.min(minSize, size), areaSize);
  const change = newSize - size;
  let newStart: number;
  if (touchesStart && !touchesEnd) newStart = start;
  else if (touchesEnd && !touchesStart) newStart = start - change;
  else newStart = start - Math.round(change / 2);
  return [clamp(newStart, areaStart, areaEnd - newSize), newSize];
}

/**
 * Grows or shrinks a window by `step` on each side, or only along `axis`. Edges pinned to the
 * work area stay pinned, so a window snapped to the left half grows to the right.
 */
export function resizeRect(rect: Rect, workArea: Rect, step: number, grow: boolean, axis?: 'width' | 'height'): Rect {
  const delta = grow ? step : -step;
  const [x, width] =
    axis === 'height'
      ? [rect.x, rect.width]
      : resizeAxis(rect.x, rect.width, workArea.x, workArea.width, delta, Math.round(workArea.width * MIN_SIZE_RATIO));
  const [y, height] =
    axis === 'width'
      ? [rect.y, rect.height]
      : resizeAxis(
          rect.y,
          rect.height,
          workArea.y,
          workArea.height,
          delta,
          Math.round(workArea.height * MIN_SIZE_RATIO),
        );
  return { x, y, width, height };
}

/** Slides a window against one edge of the work area, a gap away from it, keeping its size. */
export function moveToEdge(rect: Rect, workArea: Rect, edge: Edge, gap: number): Rect {
  const inner = applyGap(workArea, workArea, gap);
  const r = clampToWorkArea(rect, inner);
  switch (edge) {
    case 'left':
      return { ...r, x: inner.x };
    case 'right':
      return { ...r, x: inner.x + inner.width - r.width };
    case 'top':
      return { ...r, y: inner.y };
    case 'bottom':
      return { ...r, y: inner.y + inner.height - r.height };
  }
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

  const behavior = behaviorOf(action);
  switch (behavior.kind) {
    case 'almost-maximize': {
      const r = clamp(ctx.almostMaximizeRatio, 0.1, 1);
      const size = { x: 0, y: 0, width: Math.round(workArea.width * r), height: Math.round(workArea.height * r) };
      return centerRect(size, workArea);
    }
    case 'maximize-height': {
      const g = Math.max(0, gap);
      return { x: current.x, y: workArea.y + g, width: current.width, height: workArea.height - 2 * g };
    }
    case 'resize':
      return resizeRect(current, workArea, ctx.sizeStep, behavior.grow, behavior.axis);
    case 'move':
      return moveToEdge(current, workArea, behavior.edge, gap);
    case 'center':
      return centerRect(current, workArea);
    default:
      return null;
  }
}

/** True when every edge of `a` is within `tolerance` pixels of the same edge of `b`. */
export function rectsClose(a: Rect, b: Rect, tolerance = SNAP_TOLERANCE): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.x + a.width - (b.x + b.width)) <= tolerance &&
    Math.abs(a.y + a.height - (b.y + b.height)) <= tolerance
  );
}
