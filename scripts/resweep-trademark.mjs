/**
 * One-shot resweep for already-mirrored texts: removes the "Project Gutenberg"
 * trademark phrase that survived the original strip by being hard-wrapped
 * across a line break ("Project\nGutenberg"). The full strip cannot be re-run
 * on stripped files (its header/credit heuristics assume raw Gutenberg input),
 * so this applies ONLY the wrapped-phrase join plus the same line filter the
 * strip uses. Idempotent; touches only files that actually change.
 *
 *   node scripts/resweep-trademark.mjs                    both stores
 *   node scripts/resweep-trademark.mjs --dir=public/books just one store
 *
 * Changed mirror/books files must be re-uploaded to R2 afterward (the report
 * lists them; see docs/SERVING.md). Changed public/books files ship with the
 * next Pages deploy automatically.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (process.argv.find((a) => a.startsWith('--dir=')) || '').split('=')[1];
const DIRS = arg ? [arg] : ['public/books', 'mirror/books'];
const REPORT = path.join(ROOT, 'scripts', '.resweep-report.json');

const WRAPPED = /project(?:\s*\n\s*)gutenberg/i;

function resweep(text) {
    let t = text.replace(/\r\n/g, '\n');
    t = t.replace(/project(?:\s*\n\s*)gutenberg/gi, 'Project Gutenberg');
    t = t.split('\n').filter((l) => !/project gutenberg/i.test(l)).join('\n');
    return t;
}

const report = { date: new Date().toISOString(), changed: {} };
for (const rel of DIRS) {
    const dir = path.join(ROOT, rel);
    if (!existsSync(dir)) {
        console.log(`skip ${rel} (not present on this machine)`);
        continue;
    }
    const files = (await readdir(dir)).filter((f) => f.endsWith('.txt'));
    const changed = [];
    let scanned = 0;
    for (const f of files) {
        const p = path.join(dir, f);
        const raw = await readFile(p, 'utf8');
        scanned++;
        if (!WRAPPED.test(raw)) continue;
        const clean = resweep(raw);
        if (clean !== raw.replace(/\r\n/g, '\n')) {
            await writeFile(p, clean, 'utf8');
            changed.push(f.replace(/\.txt$/, ''));
        }
        if (scanned % 5000 === 0) console.log(`  ...${scanned}/${files.length} scanned in ${rel}`);
    }
    report.changed[rel] = changed;
    console.log(`${rel}: scanned ${scanned}, cleaned ${changed.length}${changed.length ? ' -> ' + changed.join(', ') : ''}`);
}
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`report written to scripts/.resweep-report.json`);
if (Object.values(report.changed).some((c) => c.length)) {
    console.log('\nNEXT: re-upload the changed mirror/books files to R2 (docs/SERVING.md).');
}
