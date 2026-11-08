// Mutter changed several window APIs in GNOME 49 (maximize flags were removed and
// get_maximized() became is_maximized()). These helpers work on 45 through 51.

import type Meta from 'gi://Meta';

interface LegacyWindow {
  get_maximized?: () => number;
  is_maximized?: () => boolean;
  unmaximize: (flags?: number) => void;
}

const MAXIMIZE_BOTH = 3;

export function isMaximized(win: Meta.Window): boolean {
  const w = win as unknown as LegacyWindow;
  if (typeof w.is_maximized === 'function') return w.is_maximized();
  return (w.get_maximized?.() ?? 0) !== 0;
}

export function unmaximize(win: Meta.Window): void {
  const w = win as unknown as LegacyWindow;
  if (typeof w.is_maximized === 'function') w.unmaximize();
  else w.unmaximize(MAXIMIZE_BOTH);
}
