// Single source of truth for every action: its GSettings key, label, group and
// default shortcuts. The GSettings schema is generated from this list at build time.
// This module must stay free of imports so the build script can evaluate it.

export type ActionGroup = 'halves' | 'corners' | 'thirds' | 'fourths' | 'size' | 'display';

export interface ActionDef {
  /**
   * Also the GSettings key that holds the action's shortcuts, and the name Mutter registers the
   * keybinding under, so it must not match a built-in GNOME keybinding name (e.g. `maximize`).
   */
  readonly id: string;
  readonly label: string;
  readonly group: ActionGroup;
  /** GTK accelerator strings. Rectangle's Ctrl+Option maps to Ctrl+Alt. */
  readonly defaults: readonly string[];
}

const CA = '<Control><Alt>';

export const ACTIONS = [
  { id: 'left-half', label: 'Left Half', group: 'halves', defaults: [`${CA}Left`] },
  { id: 'right-half', label: 'Right Half', group: 'halves', defaults: [`${CA}Right`] },
  { id: 'center-half', label: 'Center Half', group: 'halves', defaults: [] },
  { id: 'top-half', label: 'Top Half', group: 'halves', defaults: [`${CA}Up`] },
  { id: 'bottom-half', label: 'Bottom Half', group: 'halves', defaults: [`${CA}Down`] },

  { id: 'top-left', label: 'Top Left', group: 'corners', defaults: [`${CA}u`] },
  { id: 'top-right', label: 'Top Right', group: 'corners', defaults: [`${CA}i`] },
  { id: 'bottom-left', label: 'Bottom Left', group: 'corners', defaults: [`${CA}j`] },
  { id: 'bottom-right', label: 'Bottom Right', group: 'corners', defaults: [`${CA}k`] },

  { id: 'first-third', label: 'First Third', group: 'thirds', defaults: [`${CA}d`] },
  { id: 'center-third', label: 'Center Third', group: 'thirds', defaults: [`${CA}f`] },
  { id: 'last-third', label: 'Last Third', group: 'thirds', defaults: [`${CA}g`] },
  { id: 'first-two-thirds', label: 'First Two Thirds', group: 'thirds', defaults: [`${CA}e`] },
  { id: 'center-two-thirds', label: 'Center Two Thirds', group: 'thirds', defaults: [] },
  { id: 'last-two-thirds', label: 'Last Two Thirds', group: 'thirds', defaults: [`${CA}t`] },

  { id: 'first-fourth', label: 'First Fourth', group: 'fourths', defaults: [] },
  { id: 'second-fourth', label: 'Second Fourth', group: 'fourths', defaults: [] },
  { id: 'third-fourth', label: 'Third Fourth', group: 'fourths', defaults: [] },
  { id: 'last-fourth', label: 'Last Fourth', group: 'fourths', defaults: [] },
  { id: 'first-three-fourths', label: 'First Three Fourths', group: 'fourths', defaults: [] },
  { id: 'center-three-fourths', label: 'Center Three Fourths', group: 'fourths', defaults: [] },
  { id: 'last-three-fourths', label: 'Last Three Fourths', group: 'fourths', defaults: [] },

  { id: 'maximize-window', label: 'Maximize', group: 'size', defaults: [`${CA}Return`] },
  { id: 'almost-maximize', label: 'Almost Maximize', group: 'size', defaults: [] },
  { id: 'maximize-height', label: 'Maximize Height', group: 'size', defaults: [`${CA}<Shift>Up`] },
  { id: 'make-smaller', label: 'Make Smaller', group: 'size', defaults: [`${CA}minus`] },
  { id: 'make-larger', label: 'Make Larger', group: 'size', defaults: [`${CA}equal`] },
  { id: 'center', label: 'Center', group: 'size', defaults: [`${CA}c`] },
  { id: 'restore', label: 'Restore', group: 'size', defaults: [`${CA}BackSpace`] },

  { id: 'next-display', label: 'Next Display', group: 'display', defaults: [`${CA}<Super>Right`] },
  { id: 'previous-display', label: 'Previous Display', group: 'display', defaults: [`${CA}<Super>Left`] },
] as const satisfies readonly ActionDef[];

export type ActionId = (typeof ACTIONS)[number]['id'];

export const GROUP_LABELS: Record<ActionGroup, string> = {
  halves: 'Halves',
  corners: 'Corners',
  thirds: 'Thirds',
  fourths: 'Fourths',
  size: 'Size and Position',
  display: 'Displays',
};

/** Non-shortcut settings, shared by the extension, prefs and schema generator. */
export const SETTINGS = {
  gapSize: 'gap-size',
  cycleSizes: 'cycle-sizes',
  almostMaximizePercent: 'almost-maximize-percent',
  sizeStep: 'size-step',
  overrideConflicts: 'override-conflicts',
  overriddenShortcuts: 'overridden-shortcuts',
} as const;

export const SCHEMA_ID = 'org.gnome.shell.extensions.gnometangle';
export const SCHEMA_PATH = '/org/gnome/shell/extensions/gnometangle/';
