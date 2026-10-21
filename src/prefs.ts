import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { normalizeAccelerator } from './core/accelerators.js';
import { ACTIONS, GROUP_LABELS, SETTINGS, type ActionDef, type ActionGroup } from './core/actions.js';

export default class GnometanglePreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    window.set_default_size(640, 720);
    window.add(buildGeneralPage(settings));
    window.add(buildShortcutsPage(settings, window));
    return Promise.resolve();
  }
}

function spinRow(settings: Gio.Settings, key: string, title: string, subtitle: string, min: number, max: number) {
  const row = Adw.SpinRow.new_with_range(min, max, 1);
  row.set_title(title);
  row.set_subtitle(subtitle);
  settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function switchRow(settings: Gio.Settings, key: string, title: string, subtitle: string) {
  const row = new Adw.SwitchRow({ title, subtitle });
  settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function buildGeneralPage(settings: Gio.Settings): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic' });

  const layout = new Adw.PreferencesGroup({ title: 'Layout' });
  layout.add(spinRow(settings, SETTINGS.gapSize, 'Gap Size', 'Pixels between windows and screen edges', 0, 64));
  layout.add(
    spinRow(
      settings,
      SETTINGS.almostMaximizePercent,
      'Almost Maximize Size',
      'Percent of the screen used by Almost Maximize',
      50,
      100,
    ),
  );
  layout.add(
    spinRow(
      settings,
      SETTINGS.sizeStep,
      'Resize Step',
      'Pixels added or removed by Make Larger and Make Smaller',
      5,
      200,
    ),
  );
  page.add(layout);

  const behavior = new Adw.PreferencesGroup({ title: 'Behavior' });
  behavior.add(
    switchRow(
      settings,
      SETTINGS.cycleSizes,
      'Cycle Sizes on Repeat',
      'Pressing a half shortcut again cycles through 1/2, 2/3 and 1/3',
    ),
  );
  behavior.add(
    switchRow(
      settings,
      SETTINGS.overrideConflicts,
      'Override Conflicting GNOME Shortcuts',
      'Temporarily removes GNOME shortcuts that use the same keys, such as Ctrl+Alt+Arrow for workspaces. They are restored when the extension is disabled.',
    ),
  );
  page.add(behavior);

  return page;
}

function buildShortcutsPage(settings: Gio.Settings, window: Adw.PreferencesWindow): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({ title: 'Shortcuts', icon_name: 'input-keyboard-symbolic' });

  const top = new Adw.PreferencesGroup({
    description: 'Select a shortcut to change it. Press Backspace in the dialog to disable it.',
  });
  const resetAll = new Gtk.Button({ label: 'Reset All', valign: Gtk.Align.CENTER });
  resetAll.connect('clicked', () => {
    for (const action of ACTIONS) settings.reset(action.id);
  });
  top.set_header_suffix(resetAll);
  page.add(top);

  const groups = new Map<ActionGroup, Adw.PreferencesGroup>();
  for (const action of ACTIONS) {
    let group = groups.get(action.group);
    if (!group) {
      group = new Adw.PreferencesGroup({ title: GROUP_LABELS[action.group] });
      groups.set(action.group, group);
      page.add(group);
    }
    group.add(shortcutRow(settings, action, window));
  }
  return page;
}

function shortcutRow(settings: Gio.Settings, action: ActionDef, window: Adw.PreferencesWindow): Adw.ActionRow {
  const row = new Adw.ActionRow({ title: action.label, activatable: true });
  const label = new Gtk.ShortcutLabel({ disabled_text: 'Disabled', valign: Gtk.Align.CENTER });
  const reset = new Gtk.Button({
    icon_name: 'edit-undo-symbolic',
    tooltip_text: 'Reset to default',
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
  row.add_suffix(label);
  row.add_suffix(reset);

  const refresh = () => {
    const value = settings.get_strv(action.id);
    label.set_accelerator(value[0] ?? '');
    reset.set_visible(settings.get_user_value(action.id) !== null);
  };
  refresh();
  const handler = settings.connect(`changed::${action.id}`, refresh);
  row.connect('destroy', () => settings.disconnect(handler));

  reset.connect('clicked', () => settings.reset(action.id));
  row.connect('activated', () => captureShortcut(settings, action, window));
  return row;
}

function captureShortcut(settings: Gio.Settings, action: ActionDef, window: Adw.PreferencesWindow): void {
  const dialog = new Gtk.Window({
    title: 'Set Shortcut',
    modal: true,
    transient_for: window,
    resizable: false,
    default_width: 420,
  });
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    margin_top: 24,
    margin_bottom: 24,
    margin_start: 24,
    margin_end: 24,
  });
  box.append(new Gtk.Label({ label: `Press a new shortcut for ${action.label}`, css_classes: ['title-3'] }));
  box.append(new Gtk.Label({ label: 'Esc to cancel, Backspace to disable', css_classes: ['dim-label'], wrap: true }));
  dialog.set_child(box);

  const controller = new Gtk.EventControllerKey();
  controller.connect(
    'key-pressed',
    (_c: Gtk.EventControllerKey, keyval: number, keycode: number, state: Gdk.ModifierType) => {
      const mask = state & Gtk.accelerator_get_default_mod_mask();
      const key = Gdk.keyval_to_lower(keyval);

      if (mask === 0 && key === Gdk.KEY_Escape) {
        dialog.close();
        return true;
      }
      if (mask === 0 && key === Gdk.KEY_BackSpace) {
        settings.set_strv(action.id, []);
        dialog.close();
        return true;
      }
      // Wait for a non-modifier key, and require at least one modifier.
      if (mask === 0 || !Gtk.accelerator_valid(key, mask)) return true;

      const accel = Gtk.accelerator_name_with_keycode(null, key, keycode, mask);
      const taken = normalizeAccelerator(accel);
      for (const other of ACTIONS) {
        if (other.id === action.id) continue;
        const kept = settings.get_strv(other.id).filter((a) => normalizeAccelerator(a) !== taken);
        if (kept.length !== settings.get_strv(other.id).length) {
          settings.set_strv(other.id, kept);
          window.add_toast(new Adw.Toast({ title: `Removed the same shortcut from ${other.label}` }));
        }
      }
      settings.set_strv(action.id, [accel]);
      dialog.close();
      return true;
    },
  );
  dialog.add_controller(controller);
  dialog.present();
}
