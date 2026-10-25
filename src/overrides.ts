// Temporarily removes GNOME shortcuts that collide with ours (for example Ctrl+Alt+Left
// for workspace switching). Originals are saved in our own settings before anything is
// changed, so they are restored on disable, and also on the next enable after a crash.

import Gio from 'gi://Gio';

import { SETTINGS } from './core/actions.js';
import {
  parseSavedOverrides,
  planOverrides,
  restoreSaved,
  type SavedOverrides,
  type ShortcutKey,
} from './core/overrides.js';
import { lookupSettings, SHORTCUT_SCHEMAS } from './gnome-shortcuts.js';

function readSaved(settings: Gio.Settings): SavedOverrides {
  return parseSavedOverrides(settings.get_string(SETTINGS.overriddenShortcuts));
}

/** Puts back every GNOME shortcut we removed that the user hasn't changed since, then forgets them. */
export function restoreOverrides(settings: Gio.Settings): void {
  restoreSaved(readSaved(settings), lookupSettings);
  settings.set_string(SETTINGS.overriddenShortcuts, '');
  Gio.Settings.sync();
}

function writeSaved(settings: Gio.Settings, saved: SavedOverrides): void {
  const raw = Object.keys(saved).length > 0 ? JSON.stringify(saved) : '';
  if (raw !== settings.get_string(SETTINGS.overriddenShortcuts)) settings.set_string(SETTINGS.overriddenShortcuts, raw);
}

/**
 * Brings GNOME's shortcuts in line with `taken`: removes the entries that use those accelerators,
 * and puts back ones removed earlier that no longer collide. Also cleans up after a session that
 * ended without disable(). Only keys whose value changes are written.
 */
export function applyOverrides(settings: Gio.Settings, taken: ReadonlySet<string>): void {
  const stores = new Map<string, Gio.Settings>();
  const keys: ShortcutKey[] = [];
  for (const schemaId of SHORTCUT_SCHEMAS) {
    const gnome = lookupSettings(schemaId);
    if (!gnome) continue;
    stores.set(schemaId, gnome);
    for (const key of gnome.settings_schema.list_keys()) {
      const value = gnome.get_value(key);
      if (value.get_type_string() === 'as') keys.push({ schemaId, key, current: value.deepUnpack<string[]>() });
    }
  }

  const previous = readSaved(settings);
  const plan = planOverrides(keys, previous, taken);
  if (plan.writes.length === 0) {
    writeSaved(settings, plan.saved);
    return;
  }

  // Keep both old and new originals saved while writing, so a crash midway never loses one.
  const merged: SavedOverrides = { ...previous };
  for (const [schemaId, entries] of Object.entries(plan.saved)) merged[schemaId] = { ...merged[schemaId], ...entries };
  writeSaved(settings, merged);
  for (const { schemaId, key, value } of plan.writes) stores.get(schemaId)!.set_strv(key, value);
  writeSaved(settings, plan.saved);
  Gio.Settings.sync();
}
