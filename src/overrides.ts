// Temporarily removes GNOME shortcuts that collide with ours (for example Ctrl+Alt+Left
// for workspace switching). Originals are saved in our own settings before anything is
// changed, so they are restored on disable, and also on the next enable after a crash.

import Gio from 'gi://Gio';

import { withoutConflicts } from './core/accelerators.js';
import { SETTINGS } from './core/actions.js';
import { parseSavedOverrides, restoreSaved, type SavedOverrides } from './core/overrides.js';

/** GNOME schemas whose string-array keys are keyboard shortcuts. */
const SHORTCUT_SCHEMAS = [
  'org.gnome.desktop.wm.keybindings',
  'org.gnome.mutter.keybindings',
  'org.gnome.mutter.wayland.keybindings',
  'org.gnome.shell.keybindings',
];

function lookupSettings(schemaId: string): Gio.Settings | null {
  const source = Gio.SettingsSchemaSource.get_default();
  const schema = source?.lookup(schemaId, true);
  return schema ? new Gio.Settings({ settings_schema: schema }) : null;
}

function readSaved(settings: Gio.Settings): SavedOverrides {
  return parseSavedOverrides(settings.get_string(SETTINGS.overriddenShortcuts));
}

/** Puts back every GNOME shortcut we removed that the user hasn't changed since, then forgets them. */
export function restoreOverrides(settings: Gio.Settings): void {
  restoreSaved(readSaved(settings), lookupSettings);
  settings.set_string(SETTINGS.overriddenShortcuts, '');
  Gio.Settings.sync();
}

/** Removes GNOME shortcuts that use any accelerator in `taken`, remembering the originals. */
export function applyOverrides(settings: Gio.Settings, taken: ReadonlySet<string>): void {
  const saved: SavedOverrides = {};
  const changes: Array<[Gio.Settings, string, string[]]> = [];

  for (const schemaId of SHORTCUT_SCHEMAS) {
    const gnome = lookupSettings(schemaId);
    if (!gnome) continue;
    for (const key of gnome.settings_schema.list_keys()) {
      const value = gnome.get_value(key);
      if (value.get_type_string() !== 'as') continue;
      const current = value.deepUnpack<string[]>();
      const filtered = withoutConflicts(current, taken);
      if (filtered.length === current.length) continue;
      (saved[schemaId] ??= {})[key] = { original: current, applied: filtered };
      changes.push([gnome, key, filtered]);
    }
  }

  if (changes.length === 0) return;
  // Save first so a crash midway never loses the user's original shortcuts.
  settings.set_string(SETTINGS.overriddenShortcuts, JSON.stringify(saved));
  for (const [gnome, key, value] of changes) gnome.set_strv(key, value);
  Gio.Settings.sync();
}

export function hasPendingOverrides(settings: Gio.Settings): boolean {
  return Object.keys(readSaved(settings)).length > 0;
}
