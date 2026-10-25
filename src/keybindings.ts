// Registers a shortcut for every action, and takes them away while an ignored app has focus.
// Mutter consumes a registered key even when we do nothing with it, so unregistering is what
// lets the key reach the app.

import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ACTIONS, SETTINGS, type ActionId } from './core/actions.js';

// addKeybinding() is typed as returning a plain number; NONE means Mutter refused the binding.
const REFUSED: number = Meta.KeyBindingAction.NONE;

export class Keybindings {
  private registered = false;
  /** Only these are ours to remove: a refused name belongs to whoever registered it first. */
  private added: string[] = [];
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
    if (!registered) {
      for (const id of this.added) Main.wm.removeKeybinding(id);
      this.added = [];
      return;
    }

    const refused: string[] = [];
    for (const action of ACTIONS) {
      const result = Main.wm.addKeybinding(
        action.id,
        this.settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => this.onAction(action.id),
      );
      if (result === REFUSED) refused.push(action.id);
      else this.added.push(action.id);
    }

    // Mutter refuses silently, so say which shortcuts won't work, and let the preferences show it.
    // Ignored apps re-register on focus changes, so only speak up when the list changes.
    const previous = this.settings.get_strv(SETTINGS.unregisteredShortcuts);
    if (previous.join() === refused.join()) return;
    this.settings.set_strv(SETTINGS.unregisteredShortcuts, refused);
    if (refused.length > 0) {
      console.warn(
        `Gnometangle: Mutter refused the keybindings for ${refused.join(', ')}; another keybinding uses the same name`,
      );
    }
  }
}
