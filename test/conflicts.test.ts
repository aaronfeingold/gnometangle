import { describe, expect, it } from 'vitest';

import { findConflicts } from '../src/core/conflicts.js';

describe('findConflicts', () => {
  const ours = new Map<string, string[]>([
    ['left-half', ['<Control><Alt>Left']],
    ['last-two-thirds', ['<Control><Alt>t']],
    ['center', ['<Control><Alt>c']],
    ['center-half', []],
  ]);

  it('finds owners that use the same keys, in any spelling', () => {
    const conflicts = findConflicts(ours, [
      { label: 'Switch to workspace on the left', accelerators: ['<Super>Page_Up', '<Alt><Control>Left'] },
      { label: 'Launch terminal', accelerators: ['<Primary><Alt>T'] },
      { label: 'Lock screen', accelerators: ['<Super>l'] },
    ]);
    expect(conflicts).toEqual(
      new Map([
        ['left-half', ['Switch to workspace on the left']],
        ['last-two-thirds', ['Launch terminal']],
      ]),
    );
  });

  it('lists every owner of the same keys once', () => {
    const conflicts = findConflicts(ours, [
      { label: 'Run terminal', accelerators: ['<Control><Alt>c'] },
      { label: 'Calculator', accelerators: ['<Ctrl><Alt>c', '<Control><Alt>c'] },
      { label: 'Run terminal', accelerators: ['<Control><Alt>c'] },
    ]);
    expect(conflicts.get('center')).toEqual(['Run terminal', 'Calculator']);
  });

  it('ignores empty and malformed shortcuts', () => {
    expect(findConflicts(ours, [{ label: 'Broken', accelerators: ['', '<Bogus>c', 'XF86ScreenSaver'] }]).size).toBe(0);
  });
});
