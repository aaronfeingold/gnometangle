import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { releaseAccelerator } from './core/accelerators.js';
import { ACTIONS, GROUP_LABELS, SETTINGS, type ActionDef, type ActionGroup } from './core/actions.js';
import {
  lookupSettings,
  problemText,
  SHORTCUT_SCHEMAS,
  shortcutProblems,
  type ShortcutProblem,
} from './gnome-shortcuts.js';

export default class GnometanglePreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    window.set_default_size(640, 720);
    // Shortcuts first: the top bar menu's "Customize Shortcuts…" opens this window.
    window.add(buildShortcutsPage(settings, window));
    window.add(buildGeneralPage(settings, window));
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

function buildGeneralPage(settings: Gio.Settings, window: Adw.PreferencesWindow): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({ title: _('General'), icon_name: 'preferences-system-symbolic' });

  const layout = new Adw.PreferencesGroup({ title: _('Layout') });
  layout.add(spinRow(settings, SETTINGS.gapSize, _('Gap Size'), _('Pixels between windows and screen edges'), 0, 64));
  layout.add(
    spinRow(
      settings,
      SETTINGS.almostMaximizePercent,
      _('Almost Maximize Size'),
      _('Percent of the screen used by Almost Maximize'),
      50,
      100,
    ),
  );
  layout.add(
    spinRow(
      settings,
      SETTINGS.sizeStep,
      _('Resize Step'),
      _('Pixels added or removed by Make Larger and Make Smaller'),
      5,
      200,
    ),
  );
  page.add(layout);

  const behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
  behavior.add(
    switchRow(
      settings,
      SETTINGS.showIndicator,
      _('Show Icon in Top Bar'),
      _('A menu that lists every action with its shortcut, and runs it on click'),
    ),
  );
  behavior.add(
    switchRow(
      settings,
      SETTINGS.cycleSizes,
      _('Cycle Sizes on Repeat'),
      _('Pressing a half shortcut again cycles through 1/2, 2/3 and 1/3'),
    ),
  );
  behavior.add(
    switchRow(
      settings,
      SETTINGS.overrideConflicts,
      _('Opinionated Overrides'),
      _(
        'Removes the GNOME shortcuts that use the same keys as Gnometangle, such as Ctrl+Alt+Arrow for switching workspaces and Ctrl+Alt+Shift+Up for moving a window up a workspace. Turning this off puts them back.',
      ),
    ),
  );
  page.add(behavior);
  page.add(buildIgnoredAppsGroup(settings, window));

  return page;
}

const visibleApps = () =>
  Gio.AppInfo.get_all()
    .filter((app) => app.should_show() && app.get_id())
    .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

function appRow(title: string, icon: Gio.Icon | null, props: Partial<Adw.ActionRow.ConstructorProps> = {}) {
  const row = new Adw.ActionRow({ title, ...props });
  if (icon) row.add_prefix(new Gtk.Image({ gicon: icon, pixel_size: 32 }));
  return row;
}

function buildIgnoredAppsGroup(settings: Gio.Settings, window: Adw.PreferencesWindow): Adw.PreferencesGroup {
  const key = SETTINGS.ignoredApps;
  const group = new Adw.PreferencesGroup({
    title: _('Ignored Apps'),
    description: _(
      "Gnometangle's shortcuts are turned off while one of these apps has focus, so the app gets those keys. The top bar menu still works.",
    ),
  });
  const add = new Gtk.Button({
    icon_name: 'list-add-symbolic',
    tooltip_text: _('Add App'),
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
  add.connect('clicked', () =>
    chooseApp(window, (id) => {
      const ids = settings.get_strv(key);
      if (!ids.includes(id)) settings.set_strv(key, [...ids, id]);
    }),
  );
  group.set_header_suffix(add);

  let rows: Adw.ActionRow[] = [];
  const refresh = () => {
    for (const row of rows) group.remove(row);
    const apps = new Map(visibleApps().map((app) => [app.get_id(), app]));
    const ids = settings.get_strv(key);
    rows = ids.map((id) => {
      const app = apps.get(id);
      const row = appRow(app?.get_display_name() ?? id, app?.get_icon() ?? null, { subtitle: id });
      const remove = new Gtk.Button({
        icon_name: 'user-trash-symbolic',
        tooltip_text: _('Remove'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
      });
      remove.connect('clicked', () =>
        settings.set_strv(
          key,
          settings.get_strv(key).filter((other) => other !== id),
        ),
      );
      row.add_suffix(remove);
      return row;
    });
    if (rows.length === 0) rows = [new Adw.ActionRow({ title: _('No ignored apps'), css_classes: ['dim-label'] })];
    for (const row of rows) group.add(row);
  };
  refresh();
  const handler = settings.connect(`changed::${key}`, refresh);
  group.connect('destroy', () => settings.disconnect(handler));
  return group;
}

function chooseApp(window: Adw.PreferencesWindow, onChosen: (id: string) => void): void {
  const dialog = new Gtk.Window({
    title: _('Add App'),
    modal: true,
    transient_for: window,
    default_width: 420,
    default_height: 520,
  });
  const search = new Gtk.SearchEntry({ placeholder_text: _('Search apps') });
  const list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
  for (const app of visibleApps()) {
    const row = appRow(app.get_display_name(), app.get_icon(), { activatable: true });
    row.connect('activated', () => {
      onChosen(app.get_id()!);
      dialog.close();
    });
    list.append(row);
  }
  list.set_filter_func((row) =>
    (row as Adw.ActionRow).title.toLowerCase().includes(search.get_text().trim().toLowerCase()),
  );
  search.connect('search-changed', () => list.invalidate_filter());

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12,
  });
  box.append(search);
  box.append(new Gtk.ScrolledWindow({ child: list, vexpand: true, hscrollbar_policy: Gtk.PolicyType.NEVER }));
  dialog.set_child(box);

  const keys = new Gtk.EventControllerKey();
  keys.connect('key-pressed', (_c: Gtk.EventControllerKey, keyval: number) => {
    if (keyval !== Gdk.KEY_Escape) return false;
    dialog.close();
    return true;
  });
  dialog.add_controller(keys);
  dialog.present();
  search.grab_focus();
}

function buildShortcutsPage(settings: Gio.Settings, window: Adw.PreferencesWindow): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({ title: _('Shortcuts'), icon_name: 'input-keyboard-symbolic' });

  const top = new Adw.PreferencesGroup({
    description: _('Select a shortcut to change it. Press Backspace in the dialog to disable it.'),
  });
  const resetAll = new Gtk.Button({ label: _('Reset All'), valign: Gtk.Align.CENTER });
  resetAll.connect('clicked', () => {
    for (const action of ACTIONS) settings.reset(action.id);
  });
  top.set_header_suffix(resetAll);
  page.add(top);

  const groups = new Map<ActionGroup, Adw.PreferencesGroup>();
  const showProblems: Array<(problems: ReadonlyMap<string, ShortcutProblem>) => void> = [];
  for (const action of ACTIONS) {
    let group = groups.get(action.group);
    if (!group) {
      group = new Adw.PreferencesGroup({ title: _(GROUP_LABELS[action.group]) });
      groups.set(action.group, group);
      page.add(group);
    }
    const [row, showProblem] = shortcutRow(settings, action, window);
    group.add(row);
    showProblems.push(showProblem);
  }

  // Recheck whenever our shortcuts or GNOME's change while the window is open.
  const recheck = () => {
    const problems = shortcutProblems(settings);
    for (const show of showProblems) show(problems);
  };
  recheck();
  const watched = [
    settings,
    ...[...SHORTCUT_SCHEMAS, 'org.gnome.settings-daemon.plugins.media-keys'].flatMap((id) => lookupSettings(id) ?? []),
  ];
  const handlers = watched.map((watchedSettings) => watchedSettings.connect('changed', recheck));
  page.connect('destroy', () => watched.forEach((watchedSettings, i) => watchedSettings.disconnect(handlers[i]!)));
  return page;
}

function shortcutRow(
  settings: Gio.Settings,
  action: ActionDef,
  window: Adw.PreferencesWindow,
): [Adw.ActionRow, (problems: ReadonlyMap<string, ShortcutProblem>) => void] {
  const row = new Adw.ActionRow({ title: _(action.label), activatable: true });
  // Offers a rebind: the reason is in the tooltip, and clicking opens the shortcut recorder.
  const warning = new Gtk.Button({
    icon_name: 'dialog-warning-symbolic',
    valign: Gtk.Align.CENTER,
    css_classes: ['flat', 'warning'],
    visible: false,
  });
  warning.connect('clicked', () => captureShortcut(settings, action, window));
  row.add_suffix(warning);
  const label = new Gtk.ShortcutLabel({ disabled_text: _('Disabled'), valign: Gtk.Align.CENTER });
  const reset = new Gtk.Button({
    icon_name: 'edit-undo-symbolic',
    tooltip_text: _('Reset to default'),
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

  const showProblem = (problems: ReadonlyMap<string, ShortcutProblem>) => {
    const problem = problems.get(action.id);
    warning.set_visible(problem !== undefined);
    if (problem) warning.set_tooltip_text(`${problemText(problem, _)}\n${_('Click to choose other keys.')}`);
  };
  return [row, showProblem];
}

function captureShortcut(settings: Gio.Settings, action: ActionDef, window: Adw.PreferencesWindow): void {
  const dialog = new Gtk.Window({
    title: _('Set Shortcut'),
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
  // Translators: %s is an action name, such as "Left Half".
  const prompt = _('Press a new shortcut for %s').replace('%s', _(action.label));
  box.append(new Gtk.Label({ label: prompt, css_classes: ['title-3'] }));
  box.append(
    new Gtk.Label({ label: _('Esc to cancel, Backspace to disable'), css_classes: ['dim-label'], wrap: true }),
  );
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
      const shortcuts = new Map(ACTIONS.map((a) => [a.id, settings.get_strv(a.id)]));
      for (const [id, kept] of releaseAccelerator(shortcuts, action.id, accel)) {
        settings.set_strv(id, kept);
        const label = _(ACTIONS.find((a) => a.id === id)!.label);
        // Translators: %s is an action name, such as "Left Half".
        window.add_toast(new Adw.Toast({ title: _('Removed the same shortcut from %s').replace('%s', label) }));
      }
      settings.set_strv(action.id, [accel]);
      dialog.close();
      return true;
    },
  );
  dialog.add_controller(controller);
  dialog.present();
}
