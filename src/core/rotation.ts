import type { Rotation } from './actions.js';

/** A logical monitor as Mutter's display configuration lists it. */
export interface LogicalMonitor {
  x: number;
  y: number;
  scale: number;
  /** Mutter's transform: 0 normal, 1 a quarter turn clockwise, 2 upside down, 3 counterclockwise (4-7 flipped). */
  transform: number;
  primary: boolean;
  connectors: readonly string[];
}

/** A monitor's current mode. */
export interface Mode {
  id: string;
  width: number;
  height: number;
}

/** GNOME Settings calls 1 "Portrait Right" and 3 "Portrait Left". */
export const TRANSFORMS: Record<Rotation, number> = { normal: 0, right: 1, left: 3 };

/** Size a monitor takes in the layout for its mode, scale and rotation. */
export function logicalSize(mode: Mode, scale: number, transform: number, physical: boolean): [number, number] {
  let [width, height] = transform % 2 ? [mode.height, mode.width] : [mode.width, mode.height];
  if (!physical) [width, height] = [Math.round(width / scale), Math.round(height / scale)];
  return [width, height];
}

/**
 * The layout with the monitor on `connector` rotated: monitors to its right or below it shift by
 * the change in its size so the layout stays connected, and the top-left corner stays at 0,0.
 * Returns null when there is nothing to do: an unknown connector, or already rotated that way.
 * `physical` is Mutter's physical layout mode, where positions are in pixels rather than scaled.
 */
export function rotationPlan(
  monitors: readonly LogicalMonitor[],
  modes: ReadonlyMap<string, Mode>,
  connector: string,
  rotation: Rotation,
  physical: boolean,
): LogicalMonitor[] | null {
  const target = monitors.find((m) => m.connectors.includes(connector));
  const mode = modes.get(connector);
  const transform = TRANSFORMS[rotation];
  if (!target || !mode || target.transform === transform) return null;

  const [oldWidth, oldHeight] = logicalSize(mode, target.scale, target.transform, physical);
  const [newWidth, newHeight] = logicalSize(mode, target.scale, transform, physical);
  const moved = monitors.map((m) => {
    if (m === target) return { ...m, transform };
    return {
      ...m,
      x: m.x >= target.x + oldWidth ? m.x + newWidth - oldWidth : m.x,
      y: m.y >= target.y + oldHeight ? m.y + newHeight - oldHeight : m.y,
    };
  });
  const minX = Math.min(...moved.map((m) => m.x));
  const minY = Math.min(...moved.map((m) => m.y));
  return moved.map((m) => ({ ...m, x: m.x - minX, y: m.y - minY }));
}
