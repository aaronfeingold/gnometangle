// Reads the shortcuts GNOME stores in GSettings. Uses only Gio, so both the shell and the
// preferences window can use it.

import Gio from 'gi://Gio';

import { ACTIONS, SETTINGS } from './core/actions.js';
import { findConflicts, type ShortcutOwner } from './core/conflicts.js';

/** GNOME schemas whose string-array keys are window manager and shell shortcuts. */
export const SHORTCUT_SCHEMAS = [
  'org.gnome.desktop.wm.keybindings',
  'org.gnome.mutter.keybindings',
  'org.gnome.mutter.wayland.keybindings',
  'org.gnome.shell.keybindings',
];

// Settings' Keyboard Shortcuts: built-in launchers (Ubuntu's Ctrl+Alt+T terminal lives here) and
// the user's custom shortcuts, each stored at its own path.
const MEDIA_KEYS = 'org.gnome.settings-daemon.plugins.media-keys';
const CUSTOM_KEYBINDING = 'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';

function lookupSchema(schemaId: string): Gio.SettingsSchema | null {
  return Gio.SettingsSchemaSource.get_default()?.lookup(schemaId, true) ?? null;
}

export function lookupSettings(schemaId: string): Gio.Settings | null {
  const schema = lookupSchema(schemaId);
  return schema ? new Gio.Settings({ settings_schema: schema }) : null;
}

/** Every shortcut GNOME and the user's custom shortcuts currently use, labelled for display. */
export function systemShortcuts(): ShortcutOwner[] {
  const owners: ShortcutOwner[] = [];
  for (const schemaId of [...SHORTCUT_SCHEMAS, MEDIA_KEYS]) {
    const settings = lookupSettings(schemaId);
    if (!settings) continue;
    for (const key of settings.settings_schema.list_keys()) {
      if (key === 'custom-keybindings') continue;
      const value = settings.get_value(key);
      if (value.get_type_string() !== 'as') continue;
      const accelerators = value.deepUnpack<string[]>();
      if (accelerators.length === 0) continue;
      owners.push({ label: settings.settings_schema.get_key(key).get_summary() || key, accelerators });
    }
  }

  const customSchema = lookupSchema(CUSTOM_KEYBINDING);
  const mediaKeys = lookupSettings(MEDIA_KEYS);
  if (customSchema && mediaKeys) {
    for (const path of mediaKeys.get_strv('custom-keybindings')) {
      const custom = new Gio.Settings({ settings_schema: customSchema, path });
      const binding = custom.get_string('binding');
      if (binding) owners.push({ label: custom.get_string('name') || binding, accelerators: [binding] });
    }
  }
  return owners;
}

export interface ShortcutProblem {
  /** Mutter refused to register the action's keybinding at all. */
  refused: boolean;
  /** Other shortcuts on the same keys; only one of them runs. */
  usedBy: string[];
}

/**
 * Why a shortcut won't work, for display. Takes the caller's gettext, since the shell and the
 * preferences window import it from different modules.
 */
export function problemText(problem: ShortcutProblem, _: (text: string) => string): string {
  if (problem.refused) return _('Not registered: another keybinding has the same name');
  // Translators: %s is a list of other shortcuts' names, such as "Switch to workspace left".
  return _('Also used by %s').replace('%s', problem.usedBy.join(', '));
}

/** Problems with our shortcuts, by action id. Actions without problems are left out. */
export function shortcutProblems(settings: Gio.Settings): Map<string, ShortcutProblem> {
  const ours = new Map(ACTIONS.map((action) => [action.id as string, settings.get_strv(action.id)]));
  const conflicts = findConflicts(ours, systemShortcuts());
  const problems = new Map<string, ShortcutProblem>();
  for (const id of settings.get_strv(SETTINGS.unregisteredShortcuts)) problems.set(id, { refused: true, usedBy: [] });
  for (const [id, usedBy] of conflicts) problems.set(id, { refused: problems.has(id), usedBy });
  return problems;
}
