/**
 * Fold the opening-pages pass (wf-listed-lean.mjs) into meta.json: every
 * answered book that passes check-lean.mjs and has no entry yet gets its
 * hook, voice, era and tags, in the shape the deep starts pass wrote.
 *
 *   node scripts/deep-starts/merge-lean.mjs
 *
 * Existing entries are never overwritten. Books that fail the check are
 * listed and left for another pass. Then: npm run export:native.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leanProblems } from './check-lean.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(DIR, 'lean-results');
const meta = JSON.parse(readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
const clean = (s) => String(s ?? '').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
let added = 0;
let kept = 0;
const failed = [];
for (const f of existsSync(RESULTS) ? readdirSync(RESULTS).sort() : []) {
    let books = [];
    try { books = JSON.parse(readFileSync(path.join(RESULTS, f), 'utf8')).books ?? []; } catch { failed.push(`${f}: unreadable`); continue; }
    for (const b of books) {
        const id = String(b.id);
        if (meta[id]) { kept += 1; continue; }
        const problems = leanProblems({ ...b, id });
        if (problems.length) { failed.push(`#${id}: ${problems[0]}`); continue; }
        meta[id] = { hook: clean(b.hook), voice: b.voice, era: clean(b.era), tags: b.tags.slice(0, 4) };
        added += 1;
    }
}
writeFileSync(path.join(DIR, 'meta.json'), JSON.stringify(meta));
console.log(`meta.json: ${added} added, ${kept} already there, ${failed.length} failed the check; ${Object.keys(meta).length} entries in all`);
for (const f of failed.slice(0, 20)) console.log('  ' + f);
