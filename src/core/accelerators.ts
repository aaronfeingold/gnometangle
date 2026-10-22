// Accelerator parsing that mirrors GTK's syntax closely enough to compare shortcuts
// stored in different GSettings schemas ("<Ctrl><Alt>Left" equals "<Alt><Control>Left").

const MODIFIER_ALIASES: Record<string, string> = {
  control: 'Control',
  ctrl: 'Control',
  ctl: 'Control',
  primary: 'Control',
  shift: 'Shift',
  shft: 'Shift',
  alt: 'Alt',
  mod1: 'Alt',
  super: 'Super',
  mod4: 'Super',
  meta: 'Meta',
  hyper: 'Hyper',
};

const MODIFIER_ORDER = ['Control', 'Shift', 'Alt', 'Super', 'Meta', 'Hyper'];

/** Returns a canonical form of a GTK accelerator, or null if it is empty or malformed. */
export function normalizeAccelerator(accelerator: string): string | null {
  let rest = accelerator.trim();
  const mods = new Set<string>();
  for (let m = /^<([^>]+)>/.exec(rest); m; m = /^<([^>]+)>/.exec(rest)) {
    const canonical = MODIFIER_ALIASES[m[1]!.toLowerCase()];
    if (!canonical) return null;
    mods.add(canonical);
    rest = rest.slice(m[0].length);
  }
  if (!rest || rest.includes('<') || rest.includes('>')) return null;
  const ordered = MODIFIER_ORDER.filter((mod) => mods.has(mod));
  return ordered.map((mod) => `<${mod}>`).join('') + rest.toLowerCase();
}

/** Builds a set of canonical accelerators for fast conflict lookups. */
export function acceleratorSet(accelerators: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const accel of accelerators) {
    const n = normalizeAccelerator(accel);
    if (n) set.add(n);
  }
  return set;
}

/** Returns `existing` without the entries that collide with `taken`. */
export function withoutConflicts(existing: readonly string[], taken: ReadonlySet<string>): string[] {
  return existing.filter((accel) => {
    const n = normalizeAccelerator(accel);
    return !n || !taken.has(n);
  });
}
