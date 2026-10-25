import { describe, expect, it } from 'vitest';

import { ACTIONS, type ActionBehavior } from '../src/core/actions.js';

// Keybinding names GNOME registers itself (org.gnome.desktop.wm.keybindings,
// org.gnome.mutter[.wayland].keybindings, org.gnome.shell.keybindings), minus the numbered
// workspace/application/session ones. Mutter refuses a second keybinding with the same name, so
// an action id from this list would never get its shortcut.
const GNOME_KEYBINDINGS = [
  'activate-window-menu',
  'always-on-top',
  'begin-move',
  'begin-resize',
  'cancel-input-capture',
  'close',
  'cycle-group',
  'cycle-group-backward',
  'cycle-panels',
  'cycle-panels-backward',
  'cycle-windows',
  'cycle-windows-backward',
  'focus-active-notification',
  'lower',
  'maximize',
  'maximize-horizontally',
  'maximize-vertically',
  'minimize',
  'move-to-center',
  'move-to-corner-ne',
  'move-to-corner-nw',
  'move-to-corner-se',
  'move-to-corner-sw',
  'move-to-monitor-down',
  'move-to-monitor-left',
  'move-to-monitor-right',
  'move-to-monitor-up',
  'move-to-side-e',
  'move-to-side-n',
  'move-to-side-s',
  'move-to-side-w',
  'move-to-workspace-down',
  'move-to-workspace-last',
  'move-to-workspace-left',
  'move-to-workspace-right',
  'move-to-workspace-up',
  'panel-main-menu',
  'panel-run-dialog',
  'raise',
  'raise-or-lower',
  'restore-shortcuts',
  'rotate-monitor',
  'screenshot',
  'screenshot-window',
  'set-spew-mark',
  'shift-overview-down',
  'shift-overview-up',
  'show-desktop',
  'show-screen-recording-ui',
  'show-screenshot-ui',
  'switch-applications',
  'switch-applications-backward',
  'switch-group',
  'switch-group-backward',
  'switch-input-source',
  'switch-input-source-backward',
  'switch-monitor',
  'switch-panels',
  'switch-panels-backward',
  'switch-to-workspace-down',
  'switch-to-workspace-last',
  'switch-to-workspace-left',
  'switch-to-workspace-right',
  'switch-to-workspace-up',
  'switch-windows',
  'switch-windows-backward',
  'toggle-above',
  'toggle-application-view',
  'toggle-fullscreen',
  'toggle-maximized',
  'toggle-message-tray',
  'toggle-on-all-workspaces',
  'toggle-overview',
  'toggle-quick-settings',
  'toggle-tiled-left',
  'toggle-tiled-right',
  'unmaximize',
];

describe('ACTIONS', () => {
  it('has unique ids', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never reuses a built-in GNOME keybinding name', () => {
    expect(ACTIONS.map((a) => a.id).filter((id) => GNOME_KEYBINDINGS.includes(id))).toEqual([]);
  });
});

describe('action behaviors', () => {
  it('give every region action at least one region inside the work area', () => {
    for (const action of ACTIONS) {
      const behavior: ActionBehavior = action.behavior;
      if (behavior.kind !== 'region') continue;
      expect(behavior.regions.length, action.id).toBeGreaterThan(0);
      for (const r of behavior.regions) {
        expect(0 <= r.x0 && r.x0 < r.x1 && r.x1 <= 1 && 0 <= r.y0 && r.y0 < r.y1 && r.y1 <= 1, action.id).toBe(true);
      }
    }
  });

  it('cover restore and both display directions', () => {
    const kinds = ACTIONS.map((a): ActionBehavior => a.behavior);
    expect(kinds.filter((b) => b.kind === 'restore')).toHaveLength(1);
    expect(kinds.flatMap((b) => (b.kind === 'display' ? [b.direction] : [])).sort()).toEqual([-1, 1]);
  });
});
