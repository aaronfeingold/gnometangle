import type { ActionId } from './actions.js';
import { rectsClose } from './geometry.js';
import type { Rect } from './types.js';

/** What the extension remembers about a window it has snapped. */
export interface WindowHistory {
  /** Frame before the first snap, used by Restore. */
  restore: Rect;
  lastAction: ActionId;
  /** Frame we asked for on the last snap. */
  lastTarget: Rect;
  repeat: number;
}

/**
 * Decides the repeat count and restore frame for a new snap. A repeat only counts when
 * the window still sits where we last put it; once the user moves it, history resets.
 */
export function nextHistory(
  previous: WindowHistory | undefined,
  action: ActionId,
  current: Rect,
): { repeat: number; restore: Rect } {
  const untouched = previous !== undefined && rectsClose(current, previous.lastTarget);
  if (!untouched) return { repeat: 0, restore: current };
  return {
    repeat: previous.lastAction === action ? previous.repeat + 1 : 0,
    restore: previous.restore,
  };
}
