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

// Display order matches the README ("Ctrl+Alt+Shift+Up", "Ctrl+Alt+Super+Right").
const LABEL_MODIFIERS: [string, string][] = [
  ['Control', 'Ctrl'],
  ['Alt', 'Alt'],
  ['Shift', 'Shift'],
  ['Super', 'Super'],
  ['Meta', 'Meta'],
  ['Hyper', 'Hyper'],
];

const KEY_LABELS: Record<string, string> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  return: 'Enter',
  kp_enter: 'Enter',
  backspace: 'Backspace',
  minus: '-',
  equal: '=',
  plus: '+',
  comma: ',',
  period: '.',
  slash: '/',
  backslash: '\\',
  semicolon: ';',
  apostrophe: "'",
  grave: '`',
  bracketleft: '[',
  bracketright: ']',
  space: 'Space',
  tab: 'Tab',
  escape: 'Esc',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  page_up: 'Page Up',
  page_down: 'Page Down',
};

/** Human-readable form of a GTK accelerator ("<Control><Alt>Left" → "Ctrl+Alt+←"), or "" if invalid. */
export function acceleratorLabel(accelerator: string): string {
  const n = normalizeAccelerator(accelerator);
  if (!n) return '';
  const key = n.replace(/^(<[^>]+>)*/, '');
  const parts = LABEL_MODIFIERS.filter(([mod]) => n.includes(`<${mod}>`)).map(([, label]) => label);
  const keyLabel = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1));
  return [...parts, keyLabel].join('+');
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

/**
 * Frees `accelerator` for `owner`: returns each other entry of `shortcuts` that used it, mapped to
 * its shortcuts without it. Entries that didn't use it are left out.
 */
export function releaseAccelerator(
  shortcuts: ReadonlyMap<string, readonly string[]>,
  owner: string,
  accelerator: string,
): Map<string, string[]> {
  const taken = acceleratorSet([accelerator]);
  const released = new Map<string, string[]>();
  for (const [id, current] of shortcuts) {
    if (id === owner) continue;
    const kept = withoutConflicts(current, taken);
    if (kept.length !== current.length) released.set(id, kept);
  }
  return released;
}

/**
 * Pango markup for a shortcut label, with the arrow keys enlarged: coding fonts such as
 * JetBrains Mono draw arrows much smaller than letters.
 */
export function acceleratorMarkup(label: string): string {
  const escaped = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/[←→↑↓]/g, '<span size="150%">$&</span>');
}
