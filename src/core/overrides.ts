// Bookkeeping for the GNOME shortcuts we remove. Kept free of GNOME imports so the restore
// rules can be unit tested; src/overrides.ts does the GSettings lookups.

/** One GNOME key we changed: its value before, and the filtered value we wrote. */
export interface SavedShortcut {
  original: string[];
  /** Missing in entries saved by 0.1.x, which only recorded the original. */
  applied?: string[];
}

/** Saved shortcuts by GSettings schema id, then key. */
export type SavedOverrides = Record<string, Record<string, SavedShortcut>>;

/** The part of Gio.Settings that restoring needs, so tests can pass a fake. */
export interface ShortcutStore {
  get_strv(key: string): string[];
  set_strv(key: string, value: string[]): unknown;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Parses the `overridden-shortcuts` setting, dropping anything malformed. */
export function parseSavedOverrides(raw: string): SavedOverrides {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null) return {};

  const saved: SavedOverrides = {};
  for (const [schemaId, keys] of Object.entries(data as Record<string, unknown>)) {
    if (typeof keys !== 'object' || keys === null) continue;
    for (const [key, entry] of Object.entries(keys as Record<string, unknown>)) {
      let parsed: SavedShortcut | null = null;
      if (isStringArray(entry)) {
        parsed = { original: entry };
      } else if (typeof entry === 'object' && entry !== null) {
        const { original, applied } = entry as Record<string, unknown>;
        if (isStringArray(original)) parsed = isStringArray(applied) ? { original, applied } : { original };
      }
      if (parsed) (saved[schemaId] ??= {})[key] = parsed;
    }
  }
  return saved;
}

const sameShortcuts = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((accel, i) => accel === b[i]);

/**
 * The value to put back for a saved key, or null to leave it alone. If the key no longer holds
 * what we wrote, the user changed that GNOME shortcut since, and their change wins.
 */
export function restoredValue(saved: SavedShortcut, current: readonly string[]): string[] | null {
  if (saved.applied && !sameShortcuts(saved.applied, current)) return null;
  return saved.original;
}

/** Writes back every saved shortcut the user hasn't changed since we removed it. */
export function restoreSaved(saved: SavedOverrides, lookup: (schemaId: string) => ShortcutStore | null): void {
  for (const [schemaId, keys] of Object.entries(saved)) {
    const store = lookup(schemaId);
    if (!store) continue;
    for (const [key, entry] of Object.entries(keys)) {
      const value = restoredValue(entry, store.get_strv(key));
      if (value) store.set_strv(key, value);
    }
  }
}
