import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { acceleratorSet } from './core/accelerators.js';
import { ACTIONS, SETTINGS, type ActionId } from './core/actions.js';
import { Indicator } from './indicator.js';
import { applyOverrides, restoreOverrides } from './overrides.js';
import { Snapper } from './snapper.js';
import { WindowMover } from './window.js';

const SHORTCUT_KEYS = new Set<string>(ACTIONS.map((action) => action.id));

export default class GnometangleExtension extends Extension {
  private settings: Gio.Settings | null = null;
  private mover: WindowMover | null = null;
  private snapper: Snapper | null = null;
  private settingsHandlers: number[] = [];
  private indicator: Indicator | null = null;

  override enable(): void {
    this.settings = this.getSettings();
    this.mover = new WindowMover();
    this.snapper = new Snapper(this.settings, this.mover);

    this.syncOverrides();

    for (const action of ACTIONS) {
      Main.wm.addKeybinding(action.id, this.settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, () =>
        this.run(action.id),
      );
    }

    this.settingsHandlers = [
      this.settings.connect('changed', (_settings: Gio.Settings, key: string) => {
        if (key === SETTINGS.overrideConflicts || SHORTCUT_KEYS.has(key)) this.syncOverrides();
      }),
      this.settings.connect(`changed::${SETTINGS.showIndicator}`, () => this.syncIndicator()),
    ];
    this.syncIndicator();
  }

  override disable(): void {
    this.indicator?.destroy();
    this.indicator = null;
    for (const action of ACTIONS) Main.wm.removeKeybinding(action.id);
    this.mover?.destroy();
    this.mover = null;
    this.snapper = null;
    if (this.settings) {
      for (const id of this.settingsHandlers) this.settings.disconnect(id);
      restoreOverrides(this.settings);
    }
    this.settingsHandlers = [];
    this.settings = null;
  }

  /** Runs an action on `win`, or on the focused window. Also the entry point the smoke test uses. */
  run(action: ActionId, win?: Meta.Window | null): void {
    this.snapper?.run(action, win);
  }

  private syncIndicator(): void {
    const show = this.settings?.get_boolean(SETTINGS.showIndicator) ?? false;
    if (show && !this.indicator) {
      const icon = Gio.icon_new_for_string(`${this.path}/icons/gnometangle-symbolic.svg`);
      this.indicator = new Indicator(this.settings!, icon, {
        run: (action, win) => this.run(action, win),
        openPreferences: () => this.openPreferences(),
      });
      Main.panel.addToStatusArea(this.uuid, this.indicator);
    } else if (!show && this.indicator) {
      this.indicator.destroy();
      this.indicator = null;
    }
  }

  /** With overrides off, an empty set gives back everything we removed, including after a crash. */
  private syncOverrides(): void {
    const settings = this.settings;
    if (!settings) return;
    const ours = settings.get_boolean(SETTINGS.overrideConflicts)
      ? acceleratorSet(ACTIONS.flatMap((action) => settings.get_strv(action.id)))
      : new Set<string>();
    applyOverrides(settings, ours);
  }
}
