// Evaluates src/core/actions.ts so scripts can read the action table it defines.

import { join } from 'node:path';

import * as esbuild from 'esbuild';

export async function loadActions(root) {
  const bundle = await esbuild.build({
    entryPoints: [join(root, 'src/core/actions.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'neutral',
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
