// Runs actions on windows: computes the target frame, and remembers each window's history
// so repeats cycle sizes and Restore can put it back.

import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { SETTINGS, behaviorOf, type ActionId } from './core/actions.js';
import { nextHistory, type WindowHistory } from './core/cycle.js';
import { computeTarget, mapToWorkArea, moveToWorkArea, rectsClose } from './core/geometry.js';
import { orderMonitors, resolveDisplay } from './core/monitors.js';
import type { Rect } from './core/types.js';
import { workspacePlan } from './core/workspaces.js';
import type { DisplayTarget, WorkspaceTarget } from './core/actions.js';
import { currentWorkArea, frameRect, toRect, type WindowMover } from './window.js';

const SNAPPABLE_TYPES = new Set([Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG]);

export class Snapper {
  private history = new WeakMap<Meta.Window, WindowHistory>();

  constructor(
    private readonly settings: Gio.Settings,
    private readonly mover: WindowMover,
    /** Shows each display's number, in display order. */
    private readonly identifyDisplays: (monitors: readonly number[]) => void,
  ) {}

  /** Runs an action on `win`, or on the focused window when called from a shortcut. */
  run(action: ActionId, win: Meta.Window | null = global.display.get_focus_window()): void {
    const settings = this.settings;
    const behavior = behaviorOf(action);
    // These work without a window.
    if (behavior.kind === 'identify-displays') {
      this.identifyDisplays(orderMonitors(monitorGeometries()));
      return;
    }
    if (behavior.kind === 'focus-display') {
      this.focusDisplay(behavior.target, win);
      return;
    }
    if (!win || !win.get_compositor_private() || !SNAPPABLE_TYPES.has(win.get_window_type())) return;

    if (behavior.kind === 'restore') {
      this.restore(win);
      return;
    }
    if (behavior.kind === 'display') {
      this.moveToDisplay(win, behavior.target);
      return;
    }
    if (behavior.kind === 'workspace') {
      this.moveToWorkspace(win, behavior.target);
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

  /** The frame and history stay as they are, so a snapped window keeps its layout there. */
  private moveToWorkspace(win: Meta.Window, target: WorkspaceTarget): void {
    if (win.is_on_all_workspaces()) return;
    const manager = global.workspace_manager;
    const current = win.get_workspace()?.index() ?? manager.get_active_workspace_index();
    const plan = workspacePlan(target, current, manager.get_n_workspaces());
    if (!plan) return;

    const time = global.get_current_time();
    for (let i = 0; i < plan.create; i++) manager.append_new_workspace(false, time);
    const workspace = manager.get_workspace_by_index(plan.index);
    if (!workspace) return;
    win.change_workspace(workspace);
    if (this.settings.get_boolean(SETTINGS.workspaceFollow)) workspace.activate_with_focus(win, time);
  }

  /** Focuses the top window on the next or previous display, starting from `win`'s or the pointer's. */
  private focusDisplay(target: 'next' | 'previous', win: Meta.Window | null): void {
    const from = win?.get_monitor() ?? global.display.get_current_monitor();
    const to = resolveDisplay(monitorGeometries(), from, target);
    if (to === from) return;
    const workspace = global.workspace_manager.get_active_workspace();
    const candidates = workspace
      .list_windows()
      .filter((w) => w.get_monitor() === to && !w.minimized && SNAPPABLE_TYPES.has(w.get_window_type()));
    const top = global.display.sort_windows_by_stacking(candidates).at(-1);
    top?.activate(global.get_current_time());
  }

  private moveToDisplay(win: Meta.Window, displayTarget: DisplayTarget): void {
    const geometries = monitorGeometries();
    if (geometries.length < 2) return;
    const from = win.get_monitor();
    const to = resolveDisplay(geometries, from, displayTarget);
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
    // Mutter limits a resize to the monitor the window is on, which with mixed scales cuts a
    // snapped window short on a larger display. Moving it onto the target monitor first avoids that.
    win.move_to_monitor(to);
    this.mover.apply(win, target);
  }
}

function monitorGeometries(): Rect[] {
  const display = global.display;
  return Array.from({ length: display.get_n_monitors() }, (_, i) => toRect(display.get_monitor_geometry(i)));
}
