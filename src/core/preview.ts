import type { ActionBehavior, Region } from './actions.js';

/**
 * How the preferences window pictures an action: where the window lands on a miniature screen,
 * or a symbolic icon for actions that don't place the window at a fixed spot.
 */
export type Preview =
  | {
      readonly kind: 'layout';
      /** Where the window ends up. */
      readonly window: Region;
      /** Where it was before, for actions that change its size; drawn as a dashed outline. */
      readonly before?: Region;
    }
  | { readonly kind: 'icon'; readonly icon: string };

const box = (x0: number, x1: number, y0: number, y1: number): Region => ({ x0, x1, y0, y1 });

/** A centered region that is `w` wide and `h` tall, as fractions of the screen. */
const centered = (w: number, h: number): Region => box((1 - w) / 2, (1 + w) / 2, (1 - h) / 2, (1 + h) / 2);

const EDGE_ICONS = {
  left: 'go-previous-symbolic',
  right: 'go-next-symbolic',
  top: 'go-up-symbolic',
  bottom: 'go-down-symbolic',
};

/** Settings some previews follow, so they match what the action does. */
export interface PreviewOptions {
  /** The Almost Maximize size as a fraction. */
  almostMaximize?: number;
  /** The custom layout regions, by slot from 1 (index 0 is slot 1). */
  customLayouts?: readonly Region[];
}

export function previewOf(behavior: ActionBehavior, options: PreviewOptions = {}): Preview {
  const almostMaximize = options.almostMaximize ?? 0.9;
  switch (behavior.kind) {
    case 'region':
      // A cycling action shows its first size, which is what the first press does.
      return { kind: 'layout', window: behavior.regions[0]! };
    case 'almost-maximize':
      return { kind: 'layout', window: centered(almostMaximize, almostMaximize) };
    case 'custom':
      return { kind: 'layout', window: options.customLayouts?.[behavior.slot - 1] ?? box(0, 1, 0, 1) };
    case 'maximize-height':
      return { kind: 'layout', window: box(0.3, 0.7, 0, 1), before: centered(0.4, 0.5) };
    case 'center':
      return { kind: 'layout', window: centered(0.5, 0.6) };
    case 'resize': {
      const small = centered(behavior.axis === 'height' ? 0.5 : 0.36, behavior.axis === 'width' ? 0.5 : 0.36);
      const large = centered(behavior.axis === 'height' ? 0.5 : 0.7, behavior.axis === 'width' ? 0.5 : 0.7);
      return behavior.grow
        ? { kind: 'layout', window: large, before: small }
        : { kind: 'layout', window: small, before: large };
    }
    case 'move':
      return { kind: 'icon', icon: EDGE_ICONS[behavior.edge] };
    case 'restore':
      return { kind: 'icon', icon: 'edit-undo-symbolic' };
    case 'workspace':
      return { kind: 'icon', icon: 'view-paged-symbolic' };
    case 'display':
    case 'focus-display':
      return { kind: 'icon', icon: 'video-joined-displays-symbolic' };
    case 'identify-displays':
      return { kind: 'icon', icon: 'video-single-display-symbolic' };
    case 'rotate-display':
      return {
        kind: 'icon',
        icon: behavior.rotation === 'left' ? 'object-rotate-left-symbolic' : 'object-rotate-right-symbolic',
      };
  }
}
