export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Defined next to the action table, which build.mjs evaluates and so can't import it from here.
export type { Region } from './actions.js';
