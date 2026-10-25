import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../src/core/actions.js';
import { workspacePlan } from '../src/core/workspaces.js';

describe('workspacePlan', () => {
  it('moves to an existing numbered workspace', () => {
    expect(workspacePlan(3, 0, 4)).toEqual({ index: 2, create: 0 });
  });

  it('creates the workspaces a numbered target needs', () => {
    expect(workspacePlan(5, 0, 2)).toEqual({ index: 4, create: 3 });
    expect(workspacePlan(3, 1, 2)).toEqual({ index: 2, create: 1 });
  });

  it('does nothing when the window is already there', () => {
    expect(workspacePlan(2, 1, 4)).toBeNull();
  });

  it('steps to the next and previous workspace', () => {
    expect(workspacePlan('next', 1, 4)).toEqual({ index: 2, create: 0 });
    expect(workspacePlan('previous', 1, 4)).toEqual({ index: 0, create: 0 });
  });

  it('stops at the first and last workspace instead of wrapping', () => {
    expect(workspacePlan('previous', 0, 4)).toBeNull();
    expect(workspacePlan('next', 3, 4)).toBeNull();
  });
});

describe('workspace actions', () => {
  it('cover workspaces 1 to 9 plus next and previous, with only next and previous bound', () => {
    const workspace = ACTIONS.filter((a) => a.behavior.kind === 'workspace');
    expect(workspace.map((a) => a.id)).toEqual([
      ...Array.from({ length: 9 }, (_, i) => `send-to-workspace-${i + 1}`),
      'send-to-previous-workspace',
      'send-to-next-workspace',
    ]);
    expect(workspace.filter((a) => a.defaults.length > 0).map((a) => [a.id, a.defaults])).toEqual([
      ['send-to-previous-workspace', ['<Control><Alt><Shift>Left']],
      ['send-to-next-workspace', ['<Control><Alt><Shift>Right']],
    ]);
  });
});
