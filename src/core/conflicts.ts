// Which of our shortcuts something else also uses. Mutter accepts two bindings for the same
// keys without complaint and only one of them runs, so we look for collisions ourselves.

import { acceleratorSet } from './accelerators.js';

/** Something outside Gnometangle that owns shortcuts, such as a GNOME action or a custom shortcut. */
export interface ShortcutOwner {
  label: string;
  accelerators: readonly string[];
}

/** Maps each of our action ids to the labels of the other owners that use one of its keys. */
export function findConflicts(
  ours: ReadonlyMap<string, readonly string[]>,
  others: readonly ShortcutOwner[],
): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const other of others) {
    for (const accel of acceleratorSet(other.accelerators))
      owners.set(accel, [...(owners.get(accel) ?? []), other.label]);
  }

  const conflicts = new Map<string, string[]>();
  for (const [id, accelerators] of ours) {
    const labels = new Set<string>();
    for (const accel of acceleratorSet(accelerators)) for (const label of owners.get(accel) ?? []) labels.add(label);
    if (labels.size > 0) conflicts.set(id, [...labels]);
  }
  return conflicts;
}
