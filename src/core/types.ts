export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A region expressed as fractions of a work area, from 0 to 1 on each axis. */
export interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
