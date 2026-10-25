// Reading and setting window frames through Mutter.

import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';

import { isMaximized, unmaximize } from './compat.js';
import type { Rect } from './core/types.js';

/** Copies a Mtk/Meta rectangle into a plain Rect, which core/ works with. */
export const toRect = (r: { x: number; y: number; width: number; height: number }): Rect => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});

export const frameRect = (win: Meta.Window): Rect => toRect(win.get_frame_rect());

export const currentWorkArea = (win: Meta.Window): Rect => toRect(win.get_work_area_current_monitor());

function setFrame(win: Meta.Window, { x, y, width, height }: Rect): void {
  if (win.allows_resize()) win.move_resize_frame(true, x, y, width, height);
  else win.move_frame(true, x, y);
}

/** Moves windows. Owns the idle callbacks that moving schedules, so disable can remove them. */
export class WindowMover {
  private idleSources = new Set<number>();

  apply(win: Meta.Window, rect: Rect): void {
    if (win.is_fullscreen()) win.unmake_fullscreen();
    const wasMaximized = isMaximized(win);
    if (wasMaximized) unmaximize(win);
    setFrame(win, rect);

    // Unmaximizing restores the old size asynchronously on Wayland, which can override
    // the frame we just set. Apply it once more after the shell is idle.
    if (wasMaximized) {
      const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this.idleSources.delete(id);
        if (win.get_compositor_private()) setFrame(win, rect);
        return GLib.SOURCE_REMOVE;
      });
      this.idleSources.add(id);
    }
  }

  destroy(): void {
    for (const id of this.idleSources) GLib.source_remove(id);
    this.idleSources.clear();
  }
}
