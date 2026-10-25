// Registers a shortcut for every action, and takes them away while an ignored app has focus.
// Mutter consumes a registered key even when we do nothing with it, so unregistering is what
// lets the key reach the app.

import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ACTIONS, SETTINGS, type ActionId } from './core/actions.js';

export class Keybindings {
  private registered = false;
  private focusHandler: number;
  private settingsHandler: number;

  constructor(
    private readonly settings: Gio.Settings,
    private readonly onAction: (action: ActionId) => void,
  ) {
    this.focusHandler = global.display.connect('notify::focus-window', () => this.sync());
    this.settingsHandler = settings.connect(`changed::${SETTINGS.ignoredApps}`, () => this.sync());
    this.sync();
  }

  destroy(): void {
    global.display.disconnect(this.focusHandler);
    this.settings.disconnect(this.settingsHandler);
    this.setRegistered(false);
  }

  private sync(): void {
    this.setRegistered(!this.focusedAppIgnored());
  }

  private focusedAppIgnored(): boolean {
    const win = global.display.get_focus_window();
    if (!win) return false;
    const app = Shell.WindowTracker.get_default().get_window_app(win);
    return app !== null && this.settings.get_strv(SETTINGS.ignoredApps).includes(app.get_id());
  }

  private setRegistered(registered: boolean): void {
    if (registered === this.registered) return;
    this.registered = registered;
    for (const action of ACTIONS) {
      if (registered) {
        Main.wm.addKeybinding(action.id, this.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, () =>
          this.onAction(action.id),
        );
      } else {
        Main.wm.removeKeybinding(action.id);
      }
    }
  }
}
