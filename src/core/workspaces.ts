import type { WorkspaceTarget } from './actions.js';

export interface WorkspacePlan {
  /** Zero-based index of the workspace to move to. */
  index: number;
  /** How many workspaces to add first, for a numbered target past the last one. */
  create: number;
}

/**
 * Works out where a window on workspace `current` (zero-based, of `count`) goes. Next and
 * previous stop at the ends, like GNOME's own shortcuts; a numbered workspace that doesn't
 * exist yet is created. Returns null when the window is already there or can't go further.
 */
export function workspacePlan(target: WorkspaceTarget, current: number, count: number): WorkspacePlan | null {
  let index: number;
  if (target === 'next') index = current + 1;
  else if (target === 'previous') index = current - 1;
  else index = target - 1;

  if (index < 0 || index === current) return null;
  if (typeof target !== 'number' && index >= count) return null;
  return { index, create: Math.max(0, index - count + 1) };
}
