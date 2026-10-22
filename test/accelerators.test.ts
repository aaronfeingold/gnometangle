import { describe, expect, it } from 'vitest';

import { acceleratorSet, normalizeAccelerator, withoutConflicts } from '../src/core/accelerators.js';
import { ACTIONS } from '../src/core/actions.js';

describe('normalizeAccelerator', () => {
  it('treats modifier order and aliases as equal', () => {
    expect(normalizeAccelerator('<Alt><Ctrl>Left')).toBe('<Control><Alt>left');
    expect(normalizeAccelerator('<Primary><Mod1>Left')).toBe('<Control><Alt>left');
    expect(normalizeAccelerator('<Control><Alt>Left')).toBe('<Control><Alt>left');
  });

  it('rejects empty and malformed accelerators', () => {
    expect(normalizeAccelerator('')).toBeNull();
    expect(normalizeAccelerator('<Control>')).toBeNull();
    expect(normalizeAccelerator('<Bogus>a')).toBeNull();
    expect(normalizeAccelerator('<Control>a<Alt>')).toBeNull();
  });
});

describe('withoutConflicts', () => {
  it('removes only the colliding GNOME shortcuts', () => {
    const taken = acceleratorSet(['<Control><Alt>Left']);
    const gnomeDefault = ['<Super>Page_Up', '<Super><Alt>Left', '<Control><Alt>Left'];
    expect(withoutConflicts(gnomeDefault, taken)).toEqual(['<Super>Page_Up', '<Super><Alt>Left']);
  });

  it('removes GNOME workspace bindings that clash with the defaults', () => {
    const taken = acceleratorSet(ACTIONS.flatMap((a) => [...a.defaults]));
    expect(withoutConflicts(['<Control><Shift><Alt>Up'], taken)).toEqual([]);
    expect(withoutConflicts(['<Super>Up'], taken)).toEqual(['<Super>Up']);
  });
});

describe('default shortcuts', () => {
  it('are valid and unique', () => {
    const all = ACTIONS.flatMap((a) => [...a.defaults]);
    const normalized = all.map(normalizeAccelerator);
    expect(normalized).not.toContain(null);
    expect(new Set(normalized).size).toBe(all.length);
  });

  it('use unique action ids that are valid GSettings key names', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
  });
});
