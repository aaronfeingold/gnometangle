import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import type Meta from 'gi://Meta';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { acceleratorLabel } from './core/accelerators.js';
import { ACTIONS, GROUP_LABELS, type ActionGroup, type ActionId } from './core/actions.js';
import { problemText, shortcutProblems, type ShortcutProblem } from './gnome-shortcuts.js';

export interface IndicatorCallbacks {
  /** Runs an action on the window that had focus when the menu opened. */
  run: (action: ActionId, win: Meta.Window | null) => void;
  openPreferences: () => void;
}

/**
 * Top bar button whose menu lists every action, grouped like the preferences window, with its
 * current shortcut. Choosing an item runs the action, so the menu doubles as a cheat sheet.
 * Shortcuts that won't work get a warning icon and the reason.
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
  private showProblems: Array<(problems: ReadonlyMap<string, ShortcutProblem>) => void> = [];

  constructor(settings: Gio.Settings, icon: Gio.Icon, callbacks: IndicatorCallbacks) {
    super(0.5, 'Gnometangle');
    this.settings = settings;
    this.callbacks = callbacks;
    this.add_child(new St.Icon({ gicon: icon, style_class: 'system-status-icon' }));

    // Opening the menu moves key focus to the shell, so remember the window to act on first.
    (this.menu as PopupMenu.PopupMenu).connect('open-state-changed', (_menu, open) => {
      if (!open) return;
      this.targetWindow = global.display.get_focus_window();
      // Other shortcuts can change at any time, so check when the menu is about to be seen.
      const problems = shortcutProblems(this.settings);
      for (const show of this.showProblems) show(problems);
    });
    this.buildMenu();
  }

  private buildMenu(): void {
    const menu = this.menu as PopupMenu.PopupMenu;
    const groups = new Map<ActionGroup, PopupMenu.PopupSubMenuMenuItem>();
    for (const action of ACTIONS) {
      let group = groups.get(action.group);
      if (!group) {
        group = new PopupMenu.PopupSubMenuMenuItem(_(GROUP_LABELS[action.group]), true);
        groups.set(action.group, group);
        menu.addMenuItem(group);
        const ids = ACTIONS.filter((a) => a.group === action.group).map((a) => a.id as string);
        // Groups start collapsed, so the group's own icon says when one of its shortcuts has a problem.
        const icon = group.icon!; // created by the `true` (wantIcon) above
        icon.icon_name = 'dialog-warning-symbolic';
        icon.add_style_class_name('gnometangle-warning');
        icon.hide();
        this.showProblems.push((problems) => {
          icon.visible = ids.some((id) => problems.has(id));
        });
      }
      group.menu.addMenuItem(this.actionItem(action.id, _(action.label)));
    }

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    menu.addAction(_('Customize Shortcuts…'), () => this.callbacks.openPreferences());
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
    const warning = new St.Icon({
      icon_name: 'dialog-warning-symbolic',
      style_class: 'popup-menu-icon gnometangle-warning',
      visible: false,
    });
    item.add_child(warning);

    let problem: ShortcutProblem | undefined;
    const refresh = () => {
      const keys = acceleratorLabel(this.settings.get_strv(id)[0] ?? '');
      shortcut.text = problem ? `${keys}  ${problemText(problem, _)}` : keys;
      warning.visible = problem !== undefined;
    };
    refresh();
    this.settingsHandlers.push(this.settings.connect(`changed::${id}`, refresh));
    this.showProblems.push((problems) => {
      problem = problems.get(id);
      refresh();
    });

    item.connect('activate', () => this.callbacks.run(id, this.targetWindow));
    return item;
  }

  override destroy(): void {
    for (const handler of this.settingsHandlers) this.settings.disconnect(handler);
    this.settingsHandlers = [];
    this.showProblems = [];
    this.targetWindow = null;
    super.destroy();
  }
}
