// Versions of the published packages (packages/*), which release in
// lockstep. `node scripts/release-version.mjs set 0.2.0` writes the version
// into every one; `check 0.2.0` fails unless they all have it (the publish
// workflow runs it against the tag it was started from).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, version] = process.argv.slice(2);
if (!['set', 'check'].includes(mode) || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error('Usage: node scripts/release-version.mjs set|check <version>, e.g. set 0.2.0');
  process.exit(1);
}

const root = new URL('../packages/', import.meta.url).pathname;
const wrong = [];
for (const dir of readdirSync(root)) {
  const file = join(root, dir, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.private) continue;
  if (mode === 'set') {
    // Only the version line changes, so the file keeps its formatting.
    writeFileSync(file, readFileSync(file, 'utf8').replace(/"version": "[^"]*"/, `"version": "${version}"`));
    console.log(`${pkg.name} ${version}`);
  } else if (pkg.version !== version) {
    wrong.push(`${pkg.name} is ${pkg.version}`);
  }
}
if (wrong.length) {
  console.error(`Expected every package at ${version}: ${wrong.join(', ')}`);
  process.exit(1);
}
