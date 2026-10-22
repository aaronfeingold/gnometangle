import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { isMaximized, unmaximize } from './compat.js';
import { acceleratorSet } from './core/accelerators.js';
import { ACTIONS, SETTINGS, type ActionId } from './core/actions.js';
import { nextHistory, type WindowHistory } from './core/cycle.js';
import { computeTarget, mapToWorkArea, moveToWorkArea, rectsClose } from './core/geometry.js';
import { neighborMonitor } from './core/monitors.js';
import type { Rect } from './core/types.js';
import { applyOverrides, hasPendingOverrides, restoreOverrides } from './overrides.js';

const SNAPPABLE_TYPES = new Set([Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG]);

const toRect = (r: { x: number; y: number; width: number; height: number }): Rect => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});

export default class GnometangleExtension extends Extension {
  private settings: Gio.Settings | null = null;
  private history = new WeakMap<Meta.Window, WindowHistory>();
  private settingsHandlers: number[] = [];
  private idleSources = new Set<number>();

  override enable(): void {
    this.settings = this.getSettings();
    this.history = new WeakMap();

    // A previous session may have ended without disable() running.
    if (hasPendingOverrides(this.settings)) restoreOverrides(this.settings);
    this.syncOverrides();

    for (const action of ACTIONS) {
      Main.wm.addKeybinding(action.id, this.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, () =>
        this.run(action.id),
      );
    }

    const resync = () => this.resyncOverrides();
    this.settingsHandlers = [
      this.settings.connect(`changed::${SETTINGS.overrideConflicts}`, resync),
      ...ACTIONS.map((action) => this.settings!.connect(`changed::${action.id}`, resync)),
    ];
  }

  override disable(): void {
    for (const action of ACTIONS) Main.wm.removeKeybinding(action.id);
    for (const id of this.idleSources) GLib.source_remove(id);
    this.idleSources.clear();
    if (this.settings) {
      for (const id of this.settingsHandlers) this.settings.disconnect(id);
      restoreOverrides(this.settings);
    }
    this.settingsHandlers = [];
    this.settings = null;
    this.history = new WeakMap();
  }

  private syncOverrides(): void {
    const settings = this.settings;
    if (!settings?.get_boolean(SETTINGS.overrideConflicts)) return;
    const ours = acceleratorSet(ACTIONS.flatMap((action) => settings.get_strv(action.id)));
    applyOverrides(settings, ours);
  }

  private resyncOverrides(): void {
    if (!this.settings) return;
    restoreOverrides(this.settings);
    this.syncOverrides();
  }

  private run(action: ActionId): void {
    const settings = this.settings;
    const win = global.display.get_focus_window();
    if (!settings || !win || !SNAPPABLE_TYPES.has(win.get_window_type())) return;

    if (action === 'restore') {
      this.restore(win);
      return;
    }
    if (action === 'next-display' || action === 'previous-display') {
      this.moveToDisplay(win, action === 'next-display' ? 1 : -1);
      return;
    }

    const current = toRect(win.get_frame_rect());
    const workArea = toRect(win.get_work_area_current_monitor());
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
    this.apply(win, target);
  }

  private restore(win: Meta.Window): void {
    const entry = this.history.get(win);
    if (!entry) return;
    this.history.delete(win);
    this.apply(win, entry.restore);
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
    const current = toRect(win.get_frame_rect());
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
    this.apply(win, target);
  }

  private apply(win: Meta.Window, rect: Rect): void {
    if (win.is_fullscreen()) win.unmake_fullscreen();
    const wasMaximized = isMaximized(win);
    if (wasMaximized) unmaximize(win);

    const { x, y, width, height } = rect;
    if (win.allows_resize()) win.move_resize_frame(true, x, y, width, height);
    else win.move_frame(true, x, y);

    // Unmaximizing restores the old size asynchronously on Wayland, which can override
    // the frame we just set. Apply it once more after the shell is idle.
    if (wasMaximized) {
      const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this.idleSources.delete(id);
        if (win.get_compositor_private()) {
          if (win.allows_resize()) win.move_resize_frame(true, x, y, width, height);
          else win.move_frame(true, x, y);
        }
        return GLib.SOURCE_REMOVE;
      });
      this.idleSources.add(id);
    }
  }
}
