import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import type Meta from 'gi://Meta';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { acceleratorLabel } from './core/accelerators.js';
import { ACTIONS, GROUP_LABELS, type ActionGroup, type ActionId } from './core/actions.js';

export interface IndicatorCallbacks {
  /** Runs an action on the window that had focus when the menu opened. */
  run: (action: ActionId, win: Meta.Window | null) => void;
  openPreferences: () => void;
}

/**
 * Top bar button whose menu lists every action, grouped like the preferences window, with its
 * current shortcut. Choosing an item runs the action, so the menu doubles as a cheat sheet.
 */
export class Indicator extends PanelMenu.Button {
  static {
    // Explicit name: the default (Gjs_Indicator) would clash with other extensions' classes.
    GObject.registerClass({ GTypeName: 'GnometangleIndicator' }, this);
  }

  private settings!: Gio.Settings;
  private callbacks!: IndicatorCallbacks;
  private settingsHandlers: number[] = [];
  private targetWindow: Meta.Window | null = null;

  constructor(settings: Gio.Settings, icon: Gio.Icon, callbacks: IndicatorCallbacks) {
    super(0.5, 'Gnometangle');
    this.settings = settings;
    this.callbacks = callbacks;
    this.add_child(new St.Icon({ gicon: icon, style_class: 'system-status-icon' }));

    // Opening the menu moves key focus to the shell, so remember the window to act on first.
    (this.menu as PopupMenu.PopupMenu).connect('open-state-changed', (_menu, open) => {
      if (open) this.targetWindow = global.display.get_focus_window();
    });
    this.buildMenu();
  }

  private buildMenu(): void {
    const menu = this.menu as PopupMenu.PopupMenu;
    const groups = new Map<ActionGroup, PopupMenu.PopupSubMenuMenuItem>();
    for (const action of ACTIONS) {
      let group = groups.get(action.group);
      if (!group) {
        group = new PopupMenu.PopupSubMenuMenuItem(GROUP_LABELS[action.group]);
        groups.set(action.group, group);
        menu.addMenuItem(group);
      }
      group.menu.addMenuItem(this.actionItem(action.id, action.label));
    }

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addAction('Customize Shortcuts…', () => this.callbacks.openPreferences());
  }

  private actionItem(id: ActionId, label: string): PopupMenu.PopupMenuItem {
    const item = new PopupMenu.PopupMenuItem(label);
    const shortcut = new St.Label({
      style_class: 'gnometangle-shortcut',
      x_expand: true,
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER,
    });
    item.add_child(shortcut);

    const refresh = () => {
      shortcut.text = acceleratorLabel(this.settings.get_strv(id)[0] ?? '');
    };
    refresh();
    this.settingsHandlers.push(this.settings.connect(`changed::${id}`, refresh));

    item.connect('activate', () => this.callbacks.run(id, this.targetWindow));
    return item;
  }

  override destroy(): void {
    for (const handler of this.settingsHandlers) this.settings.disconnect(handler);
    this.settingsHandlers = [];
    this.targetWindow = null;
    super.destroy();
  }
}
