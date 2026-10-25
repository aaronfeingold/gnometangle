// Runs actions on windows: computes the target frame, and remembers each window's history
// so repeats cycle sizes and Restore can put it back.

import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { SETTINGS, behaviorOf, type ActionId } from './core/actions.js';
import { nextHistory, type WindowHistory } from './core/cycle.js';
import { computeTarget, mapToWorkArea, moveToWorkArea, rectsClose } from './core/geometry.js';
import { neighborMonitor } from './core/monitors.js';
import { currentWorkArea, frameRect, toRect, type WindowMover } from './window.js';

const SNAPPABLE_TYPES = new Set([Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG]);

export class Snapper {
  private history = new WeakMap<Meta.Window, WindowHistory>();

  constructor(
    private readonly settings: Gio.Settings,
    private readonly mover: WindowMover,
  ) {}

  /** Runs an action on `win`, or on the focused window when called from a shortcut. */
  run(action: ActionId, win: Meta.Window | null = global.display.get_focus_window()): void {
    const settings = this.settings;
    if (!win || !win.get_compositor_private() || !SNAPPABLE_TYPES.has(win.get_window_type())) return;

    const behavior = behaviorOf(action);
    if (behavior.kind === 'restore') {
      this.restore(win);
      return;
    }
    if (behavior.kind === 'display') {
      this.moveToDisplay(win, behavior.direction);
      return;
    }

    const current = frameRect(win);
    const workArea = currentWorkArea(win);
    const cycle = settings.get_boolean(SETTINGS.cycleSizes);
    const previous = this.history.get(win);
    const { repeat, restore } = nextHistory(previous, action, current);

    const target = computeTarget(
      action,
      {
        workArea,
        current,
        repeat,
        gap: settings.get_int(SETTINGS.gapSize),
        almostMaximizeRatio: settings.get_int(SETTINGS.almostMaximizePercent) / 100,
        sizeStep: settings.get_int(SETTINGS.sizeStep),
      },
      cycle,
    );
    if (!target) return;

    this.history.set(win, { restore, lastAction: action, lastTarget: target, repeat });
    this.mover.apply(win, target);
  }

  private restore(win: Meta.Window): void {
    const entry = this.history.get(win);
    if (!entry) return;
    this.history.delete(win);
    this.mover.apply(win, entry.restore);
  }

  private moveToDisplay(win: Meta.Window, direction: 1 | -1): void {
    const display = global.display;
    const count = display.get_n_monitors();
    if (count < 2) return;
    const geometries = Array.from({ length: count }, (_, i) => toRect(display.get_monitor_geometry(i)));
    const from = win.get_monitor();
    const to = neighborMonitor(geometries, from, direction);
    if (to === from) return;

    const fromArea = toRect(win.get_work_area_for_monitor(from));
    const toArea = toRect(win.get_work_area_for_monitor(to));
    const current = frameRect(win);
    const entry = this.history.get(win);
    const snapped = entry !== undefined && rectsClose(current, entry.lastTarget);
    const target = moveToWorkArea(current, fromArea, toArea, snapped);

    // Keep cycling and restore working on the new display.
    if (entry) {
      this.history.set(win, {
        ...entry,
        lastTarget: target,
        restore: mapToWorkArea(entry.restore, fromArea, toArea),
      });
    }
    this.mover.apply(win, target);
  }
}
