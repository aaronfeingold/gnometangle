// Prints the CHANGELOG.md section for package.json's version, for the release body. README links
// become absolute so they work on GitHub's release page.
//   node scripts/release-notes.mjs           print the notes
//   node scripts/release-notes.mjs --check   only fail if the version has no section (part of pnpm check)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { url } = JSON.parse(readFileSync(join(root, 'metadata.json'), 'utf8'));
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

// "## 0.2.0 (2026-10-24)" up to the next "## " heading.
const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}(?: |$).*$`, 'm');
const match = heading.exec(changelog);
if (!match) {
  console.error(`CHANGELOG.md has no "## ${version}" section; add one before releasing ${version}.`);
  process.exit(1);
}
const rest = changelog.slice(match.index + match[0].length);
const next = rest.search(/^## /m);
const notes = (next < 0 ? rest : rest.slice(0, next)).trim().replaceAll('](README.md#', `](${url}#`);

if (!process.argv.includes('--check')) console.log(notes);
