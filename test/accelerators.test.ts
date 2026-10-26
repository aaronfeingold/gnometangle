import { describe, expect, it } from 'vitest';

import {
  acceleratorLabel,
  acceleratorMarkup,
  acceleratorSet,
  normalizeAccelerator,
  releaseAccelerator,
  withoutConflicts,
} from '../src/core/accelerators.js';
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

describe('acceleratorLabel', () => {
  it('formats modifiers in README order with readable key names', () => {
    expect(acceleratorLabel('<Control><Alt>Left')).toBe('Ctrl+Alt+←');
    expect(acceleratorLabel('<Alt><Control>Return')).toBe('Ctrl+Alt+Enter');
    expect(acceleratorLabel('<Control><Alt><Shift>Up')).toBe('Ctrl+Alt+Shift+↑');
    expect(acceleratorLabel('<Control><Alt><Super>Right')).toBe('Ctrl+Alt+Super+→');
    expect(acceleratorLabel('<Control><Alt>minus')).toBe('Ctrl+Alt+-');
    expect(acceleratorLabel('<Control><Alt>BackSpace')).toBe('Ctrl+Alt+Backspace');
  });

  it('uppercases letters and capitalizes other key names', () => {
    expect(acceleratorLabel('<Control><Alt>u')).toBe('Ctrl+Alt+U');
    expect(acceleratorLabel('<Super>F5')).toBe('Super+F5');
  });

  it('returns an empty label for invalid accelerators', () => {
    expect(acceleratorLabel('')).toBe('');
    expect(acceleratorLabel('<Bogus>a')).toBe('');
  });

  it('labels every default shortcut', () => {
    for (const accel of ACTIONS.flatMap((a) => [...a.defaults])) expect(acceleratorLabel(accel)).not.toBe('');
  });
});

describe('releaseAccelerator', () => {
  const shortcuts = new Map<string, string[]>([
    ['left-half', ['<Control><Alt>Left']],
    ['first-third', ['<Control><Alt>d', '<Alt><Control>Left']],
    ['center', ['<Control><Alt>c']],
  ]);

  it('removes the keys from every other action, in any spelling', () => {
    expect(releaseAccelerator(shortcuts, 'center', '<Primary><Alt>Left')).toEqual(
      new Map([
        ['left-half', []],
        ['first-third', ['<Control><Alt>d']],
      ]),
    );
  });

  it("leaves the owner's own shortcuts alone", () => {
    expect(releaseAccelerator(shortcuts, 'left-half', '<Control><Alt>Left')).toEqual(
      new Map([['first-third', ['<Control><Alt>d']]]),
    );
  });

  it('returns nothing when no other action uses the keys', () => {
    expect(releaseAccelerator(shortcuts, 'center', '<Control><Alt>x').size).toBe(0);
  });
});

describe('acceleratorMarkup', () => {
  it('enlarges arrow keys', () => {
    expect(acceleratorMarkup('Ctrl+Alt+←')).toBe('Ctrl+Alt+<span size="150%">←</span>');
  });

  it('escapes markup characters and leaves other keys alone', () => {
    expect(acceleratorMarkup('Ctrl+Alt+<')).toBe('Ctrl+Alt+&lt;');
    expect(acceleratorMarkup('Ctrl+Alt+U')).toBe('Ctrl+Alt+U');
  });
});
