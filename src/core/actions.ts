// Single source of truth for every action: its GSettings key, label, group, default
// shortcuts and what it does. The GSettings schema is generated from this list at build time.
// This module must stay free of imports so the build script can evaluate it.

export type ActionGroup = 'halves' | 'corners' | 'thirds' | 'fourths' | 'size' | 'move' | 'workspace' | 'display';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

/** A workspace number from 1, or the neighbouring workspace. */
export type WorkspaceTarget = number | 'next' | 'previous';

/** A region expressed as fractions of a work area, from 0 to 1 on each axis. */
export interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type ActionBehavior =
  | {
      readonly kind: 'region';
      /**
       * One region, or several to mark a cycling action: the nth repeat in a row uses
       * `regions[n % length]`, and with cycling turned off only the first is used.
       */
      readonly regions: readonly Region[];
      /**
       * The regions are written for a landscape screen; on a portrait one they run along its
       * height instead, so thirds and fourths stack vertically like Rectangle's do.
       */
      readonly majorAxis?: boolean;
    }
  | { readonly kind: 'almost-maximize' | 'maximize-height' | 'center' | 'restore' }
  /** Grows or shrinks by the resize step; `axis` limits it to one dimension. */
  | { readonly kind: 'resize'; readonly grow: boolean; readonly axis?: 'width' | 'height' }
  /** Slides to an edge of the work area without resizing. */
  | { readonly kind: 'move'; readonly edge: Edge }
  /** Sends the window to another workspace, keeping its frame, and optionally follows it. */
  | { readonly kind: 'workspace'; readonly target: WorkspaceTarget }
  | { readonly kind: 'display'; readonly direction: 1 | -1 };

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
  readonly behavior: ActionBehavior;
}

const CA = '<Control><Alt>';

/** Sizes Rectangle cycles through when a half action is repeated. */
export const HALF_CYCLE = [1 / 2, 2 / 3, 1 / 3] as const;

const THIRDS: Region[] = [
  { x0: 0, x1: 1 / 3, y0: 0, y1: 1 },
  { x0: 1 / 3, x1: 2 / 3, y0: 0, y1: 1 },
  { x0: 2 / 3, x1: 1, y0: 0, y1: 1 },
];

const region = (x0: number, x1: number, y0: number, y1: number): ActionBehavior => ({
  kind: 'region',
  regions: [{ x0, x1, y0, y1 }],
});
const halves = (toRegion: (size: number) => Region): ActionBehavior => ({
  kind: 'region',
  regions: HALF_CYCLE.map(toRegion),
});
const segments = (...regions: Region[]): ActionBehavior => ({ kind: 'region', regions, majorAxis: true });
const segment = (x0: number, x1: number): ActionBehavior => segments({ x0, x1, y0: 0, y1: 1 });
const sendToWorkspace = (n: number) => ({
  id: `send-to-workspace-${n}` as const,
  label: `Workspace ${n}`,
  group: 'workspace' as const,
  defaults: [] as readonly string[],
  behavior: { kind: 'workspace', target: n } as const,
});

export const ACTIONS = [
  {
    id: 'left-half',
    label: 'Left Half',
    group: 'halves',
    defaults: [`${CA}Left`],
    behavior: halves((h) => ({ x0: 0, x1: h, y0: 0, y1: 1 })),
  },
  {
    id: 'right-half',
    label: 'Right Half',
    group: 'halves',
    defaults: [`${CA}Right`],
    behavior: halves((h) => ({ x0: 1 - h, x1: 1, y0: 0, y1: 1 })),
  },
  { id: 'center-half', label: 'Center Half', group: 'halves', defaults: [], behavior: region(0.25, 0.75, 0, 1) },
  {
    id: 'top-half',
    label: 'Top Half',
    group: 'halves',
    defaults: [`${CA}Up`],
    behavior: halves((h) => ({ x0: 0, x1: 1, y0: 0, y1: h })),
  },
  {
    id: 'bottom-half',
    label: 'Bottom Half',
    group: 'halves',
    defaults: [`${CA}Down`],
    behavior: halves((h) => ({ x0: 0, x1: 1, y0: 1 - h, y1: 1 })),
  },

  { id: 'top-left', label: 'Top Left', group: 'corners', defaults: [`${CA}u`], behavior: region(0, 0.5, 0, 0.5) },
  { id: 'top-right', label: 'Top Right', group: 'corners', defaults: [`${CA}i`], behavior: region(0.5, 1, 0, 0.5) },
  {
    id: 'bottom-left',
    label: 'Bottom Left',
    group: 'corners',
    defaults: [`${CA}j`],
    behavior: region(0, 0.5, 0.5, 1),
  },
  {
    id: 'bottom-right',
    label: 'Bottom Right',
    group: 'corners',
    defaults: [`${CA}k`],
    behavior: region(0.5, 1, 0.5, 1),
  },

  // First third cycles forward through the thirds and last third cycles backward.
  { id: 'first-third', label: 'First Third', group: 'thirds', defaults: [`${CA}d`], behavior: segments(...THIRDS) },
  { id: 'center-third', label: 'Center Third', group: 'thirds', defaults: [`${CA}f`], behavior: segments(THIRDS[1]!) },
  {
    id: 'last-third',
    label: 'Last Third',
    group: 'thirds',
    defaults: [`${CA}g`],
    behavior: segments(...[...THIRDS].reverse()),
  },
  {
    id: 'first-two-thirds',
    label: 'First Two Thirds',
    group: 'thirds',
    defaults: [`${CA}e`],
    behavior: segment(0, 2 / 3),
  },
  {
    id: 'center-two-thirds',
    label: 'Center Two Thirds',
    group: 'thirds',
    defaults: [],
    behavior: segment(1 / 6, 5 / 6),
  },
  {
    id: 'last-two-thirds',
    label: 'Last Two Thirds',
    group: 'thirds',
    defaults: [`${CA}t`],
    behavior: segment(1 / 3, 1),
  },

  { id: 'first-fourth', label: 'First Fourth', group: 'fourths', defaults: [`${CA}1`], behavior: segment(0, 0.25) },
  { id: 'second-fourth', label: 'Second Fourth', group: 'fourths', defaults: [`${CA}2`], behavior: segment(0.25, 0.5) },
  { id: 'third-fourth', label: 'Third Fourth', group: 'fourths', defaults: [`${CA}3`], behavior: segment(0.5, 0.75) },
  { id: 'last-fourth', label: 'Last Fourth', group: 'fourths', defaults: [`${CA}4`], behavior: segment(0.75, 1) },
  {
    id: 'first-three-fourths',
    label: 'First Three Fourths',
    group: 'fourths',
    defaults: [],
    behavior: segment(0, 0.75),
  },
  {
    id: 'center-three-fourths',
    label: 'Center Three Fourths',
    group: 'fourths',
    defaults: [],
    behavior: segment(0.125, 0.875),
  },
  {
    id: 'last-three-fourths',
    label: 'Last Three Fourths',
    group: 'fourths',
    defaults: [],
    behavior: segment(0.25, 1),
  },

  {
    id: 'maximize-window',
    label: 'Maximize',
    group: 'size',
    defaults: [`${CA}Return`],
    behavior: region(0, 1, 0, 1),
  },
  {
    id: 'almost-maximize',
    label: 'Almost Maximize',
    group: 'size',
    defaults: [],
    behavior: { kind: 'almost-maximize' },
  },
  {
    id: 'maximize-height',
    label: 'Maximize Height',
    group: 'size',
    defaults: [`${CA}<Shift>Up`],
    behavior: { kind: 'maximize-height' },
  },
  {
    id: 'make-smaller',
    label: 'Make Smaller',
    group: 'size',
    defaults: [`${CA}minus`],
    behavior: { kind: 'resize', grow: false },
  },
  {
    id: 'make-larger',
    label: 'Make Larger',
    group: 'size',
    defaults: [`${CA}equal`],
    behavior: { kind: 'resize', grow: true },
  },
  {
    id: 'smaller-width',
    label: 'Smaller Width',
    group: 'size',
    defaults: [],
    behavior: { kind: 'resize', grow: false, axis: 'width' },
  },
  {
    id: 'larger-width',
    label: 'Larger Width',
    group: 'size',
    defaults: [],
    behavior: { kind: 'resize', grow: true, axis: 'width' },
  },
  {
    id: 'smaller-height',
    label: 'Smaller Height',
    group: 'size',
    defaults: [],
    behavior: { kind: 'resize', grow: false, axis: 'height' },
  },
  {
    id: 'larger-height',
    label: 'Larger Height',
    group: 'size',
    defaults: [],
    behavior: { kind: 'resize', grow: true, axis: 'height' },
  },
  { id: 'center', label: 'Center', group: 'size', defaults: [`${CA}c`], behavior: { kind: 'center' } },
  { id: 'restore', label: 'Restore', group: 'size', defaults: [`${CA}BackSpace`], behavior: { kind: 'restore' } },

  { id: 'move-left', label: 'Move Left', group: 'move', defaults: [], behavior: { kind: 'move', edge: 'left' } },
  { id: 'move-right', label: 'Move Right', group: 'move', defaults: [], behavior: { kind: 'move', edge: 'right' } },
  { id: 'move-up', label: 'Move Up', group: 'move', defaults: [], behavior: { kind: 'move', edge: 'top' } },
  { id: 'move-down', label: 'Move Down', group: 'move', defaults: [], behavior: { kind: 'move', edge: 'bottom' } },

  // Ids avoid GNOME's own move-to-workspace-* names, which Mutter would refuse.
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(sendToWorkspace),
  {
    id: 'send-to-previous-workspace',
    label: 'Previous Workspace',
    group: 'workspace',
    defaults: [`${CA}<Shift>Left`],
    behavior: { kind: 'workspace', target: 'previous' },
  },
  {
    id: 'send-to-next-workspace',
    label: 'Next Workspace',
    group: 'workspace',
    defaults: [`${CA}<Shift>Right`],
    behavior: { kind: 'workspace', target: 'next' },
  },

  {
    id: 'next-display',
    label: 'Next Display',
    group: 'display',
    defaults: [`${CA}<Super>Right`],
    behavior: { kind: 'display', direction: 1 },
  },
  {
    id: 'previous-display',
    label: 'Previous Display',
    group: 'display',
    defaults: [`${CA}<Super>Left`],
    behavior: { kind: 'display', direction: -1 },
  },
] as const satisfies readonly ActionDef[];

export type ActionId = (typeof ACTIONS)[number]['id'];

const BEHAVIORS = new Map<string, ActionBehavior>(ACTIONS.map((a) => [a.id, a.behavior]));

export function behaviorOf(action: ActionId): ActionBehavior {
  return BEHAVIORS.get(action)!;
}

export const GROUP_LABELS: Record<ActionGroup, string> = {
  halves: 'Halves',
  corners: 'Corners',
  thirds: 'Thirds',
  fourths: 'Fourths',
  size: 'Size and Position',
  move: 'Move',
  workspace: 'Workspaces',
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
  showIndicator: 'show-indicator',
  ignoredApps: 'ignored-apps',
  workspaceFollow: 'workspace-follow',
  unregisteredShortcuts: 'unregistered-shortcuts',
} as const;

export const SCHEMA_ID = 'org.gnome.shell.extensions.gnometangle';
export const SCHEMA_PATH = '/org/gnome/shell/extensions/gnometangle/';
