// Bundles the built Modernity data into one static file the apps fetch off
// the open path (docs/modernity-plan.md). Same contract as starts-v1.json:
// the filename IS the version — when more works land (or content is revised),
// ship modernity-v2.json and bump one constant in the app. Never mutate v1 in
// place; immutable caching depends on this.
//
// Run npm run build:modernity first; this wraps src/data/modernity.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const works = JSON.parse(fs.readFileSync(path.join(root, 'src/data/modernity.json'), 'utf8'));

const bundle = { v: 1, works };
const json = JSON.stringify(bundle);
const outPath = path.join(root, 'public/modernity-v1.json');
fs.writeFileSync(outPath, json);

const beats = Object.values(works).reduce((n, w) => n + w.beats.length, 0);
console.log(`works: ${Object.keys(works).length}`);
console.log(`beats: ${beats}`);
console.log(`bytes: ${Buffer.byteLength(json)}`);
console.log(`wrote ${outPath}`);
