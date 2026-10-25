import { describe, expect, it } from 'vitest';

import { acceleratorSet } from '../src/core/accelerators.js';
import {
  parseSavedOverrides,
  planOverrides,
  restoreSaved,
  restoredValue,
  type SavedOverrides,
  type ShortcutStore,
} from '../src/core/overrides.js';

const WM = 'org.gnome.desktop.wm.keybindings';

/** A stand-in for Gio.Settings that records writes. */
function fakeStore(values: Record<string, string[]>) {
  const writes: Array<[string, string[]]> = [];
  const store: ShortcutStore = {
    get_strv: (key) => [...(values[key] ?? [])],
    set_strv: (key, value) => {
      writes.push([key, value]);
      values[key] = value;
      return true;
    },
  };
  return { store, values, writes };
}

describe('restoredValue', () => {
  const saved = { original: ['<Super>Page_Up', '<Control><Alt>Left'], applied: ['<Super>Page_Up'] };

  it('puts the original back when the key still holds what we wrote', () => {
    expect(restoredValue(saved, ['<Super>Page_Up'])).toEqual(saved.original);
  });

  it('keeps a value the user changed in the meantime', () => {
    expect(restoredValue(saved, ['<Super>Home'])).toBeNull();
    expect(restoredValue(saved, [])).toBeNull();
  });

  it('restores entries saved before we recorded the written value', () => {
    expect(restoredValue({ original: ['<Control><Alt>Left'] }, ['<Super>Home'])).toEqual(['<Control><Alt>Left']);
  });
});

describe('restoreSaved', () => {
  it('restores untouched keys and leaves keys the user changed', () => {
    const { store, values, writes } = fakeStore({
      'switch-to-workspace-left': ['<Super>Page_Up'],
      'switch-to-workspace-right': ['<Super>End'],
    });
    const saved: SavedOverrides = {
      [WM]: {
        'switch-to-workspace-left': {
          original: ['<Super>Page_Up', '<Control><Alt>Left'],
          applied: ['<Super>Page_Up'],
        },
        'switch-to-workspace-right': {
          original: ['<Super>Page_Down', '<Control><Alt>Right'],
          applied: ['<Super>Page_Down'],
        },
      },
    };

    restoreSaved(saved, (id) => (id === WM ? store : null));

    expect(values['switch-to-workspace-left']).toEqual(['<Super>Page_Up', '<Control><Alt>Left']);
    expect(values['switch-to-workspace-right']).toEqual(['<Super>End']);
    expect(writes).toHaveLength(1);
  });

  it('skips schemas that are not installed', () => {
    const saved: SavedOverrides = { 'org.example.missing': { key: { original: ['a'], applied: [] } } };
    expect(() => restoreSaved(saved, () => null)).not.toThrow();
  });
});

describe('parseSavedOverrides', () => {
  it('reads the current format', () => {
    const saved = { [WM]: { key: { original: ['a', 'b'], applied: ['a'] } } };
    expect(parseSavedOverrides(JSON.stringify(saved))).toEqual(saved);
  });

  it('reads the 0.1.x format, which only saved the original', () => {
    expect(parseSavedOverrides(JSON.stringify({ [WM]: { key: ['a', 'b'] } }))).toEqual({
      [WM]: { key: { original: ['a', 'b'] } },
    });
  });

  it('ignores empty and malformed values', () => {
    expect(parseSavedOverrides('')).toEqual({});
    expect(parseSavedOverrides('not json')).toEqual({});
    expect(parseSavedOverrides('[1]')).toEqual({});
    expect(parseSavedOverrides(JSON.stringify({ [WM]: { key: [1], other: { original: 'a' } } }))).toEqual({});
  });
});

describe('planOverrides', () => {
  const taken = acceleratorSet(['<Control><Alt>Left', '<Control><Alt>Right']);
  const left = ['<Super>Page_Up', '<Control><Alt>Left'];
  const right = ['<Super>Page_Down', '<Control><Alt>Right'];
  const keys = (values: Record<string, string[]>) =>
    Object.entries(values).map(([key, current]) => ({ schemaId: WM, key, current }));

  it('removes conflicts and saves the originals', () => {
    const plan = planOverrides(keys({ left, right, other: ['<Super>x'] }), {}, taken);
    expect(plan.writes).toEqual([
      { schemaId: WM, key: 'left', value: ['<Super>Page_Up'] },
      { schemaId: WM, key: 'right', value: ['<Super>Page_Down'] },
    ]);
    expect(plan.saved).toEqual({
      [WM]: {
        left: { original: left, applied: ['<Super>Page_Up'] },
        right: { original: right, applied: ['<Super>Page_Down'] },
      },
    });
  });

  it('writes nothing when the overrides are already in place', () => {
    const first = planOverrides(keys({ left, right }), {}, taken);
    const again = planOverrides(keys({ left: ['<Super>Page_Up'], right: ['<Super>Page_Down'] }), first.saved, taken);
    expect(again.writes).toEqual([]);
    expect(again.saved).toEqual(first.saved);
  });

  it('only touches the key whose conflict went away', () => {
    const first = planOverrides(keys({ left, right }), {}, taken);
    const rightOnly = acceleratorSet(['<Control><Alt>Right']);
    const plan = planOverrides(keys({ left: ['<Super>Page_Up'], right: ['<Super>Page_Down'] }), first.saved, rightOnly);
    expect(plan.writes).toEqual([{ schemaId: WM, key: 'left', value: left }]);
    expect(plan.saved).toEqual({ [WM]: { right: first.saved[WM]!.right } });
  });

  it('gives everything back for an empty set', () => {
    const first = planOverrides(keys({ left, right }), {}, taken);
    const plan = planOverrides(keys({ left: ['<Super>Page_Up'], right: ['<Super>Page_Down'] }), first.saved, new Set());
    expect(plan.writes).toEqual([
      { schemaId: WM, key: 'left', value: left },
      { schemaId: WM, key: 'right', value: right },
    ]);
    expect(plan.saved).toEqual({});
  });

  it('treats a key the user changed as their new original', () => {
    const first = planOverrides(keys({ left }), {}, taken);
    const changed = ['<Super>Home', '<Control><Alt>Left'];
    const plan = planOverrides(keys({ left: changed }), first.saved, taken);
    expect(plan.writes).toEqual([{ schemaId: WM, key: 'left', value: ['<Super>Home'] }]);
    expect(plan.saved).toEqual({ [WM]: { left: { original: changed, applied: ['<Super>Home'] } } });
    expect(planOverrides(keys({ left: ['<Super>Home'] }), first.saved, new Set()).writes).toEqual([]);
  });

  it('restores 0.1.x entries, which only saved the original', () => {
    const plan = planOverrides(keys({ left: ['<Super>Page_Up'] }), { [WM]: { left: { original: left } } }, new Set());
    expect(plan.writes).toEqual([{ schemaId: WM, key: 'left', value: left }]);
  });
});
