// Bundles the deep-catalog story starts into one static file the apps fetch
// off the open path. The filename IS the version: future re-verification
// rounds ship starts-v2.json and bump one constant in the app — never mutate
// v1 in place (immutable caching depends on this).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const verified = JSON.parse(fs.readFileSync(path.join(root, 'scripts/deep-starts/verified.json'), 'utf8'));
const nonNarrative = JSON.parse(fs.readFileSync(path.join(root, 'scripts/deep-starts/non-narrative.json'), 'utf8'));

const bundle = { v: 1, starts: verified, nn: nonNarrative };
const json = JSON.stringify(bundle);
const outPath = path.join(root, 'public/starts-v1.json');
fs.writeFileSync(outPath, json);

console.log(`starts: ${Object.keys(verified).length}`);
console.log(`nn: ${nonNarrative.length}`);
console.log(`bytes: ${Buffer.byteLength(json)}`);
console.log(`wrote ${outPath}`);
