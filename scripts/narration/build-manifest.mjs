/**
 * Narration pipeline, step 5: aggregate verified output into the manifest the
 * app fetches — public/narration-v1.json (committed to git, like
 * modernity-v1.json, so every deploy carries it).
 *
 *   node scripts/narration/build-manifest.mjs
 *   node scripts/narration/build-manifest.mjs --drop=84/marlowe   deliberate removal
 *
 * MERGE, never rebuild: the committed manifest is the source of truth for
 * books already shipped, because work/ is deletable scratch (finish.mjs says
 * to delete it after shipping). This script carries every existing entry
 * forward and overlays whatever work/ currently holds — so a later shelf
 * expansion can never silently drop a shipped book. Removing an entry is an
 * explicit --drop, never a side effect.
 *
 * Versioning contract (same as starts-v1/modernity-v1): the filename IS the
 * version and _headers marks it immutable. The file may GROW additively in
 * place server-side; installed apps see growth only per their own refresh
 * policy (docs/narration-plan.md §10) or a filename bump — never via HTTP
 * cache expiry. What must NEVER change inside v1 is the meaning of existing
 * fields or the audio files already uploaded — a changed recording or timing
 * format ships as timing-v2 / narration-v2, never as a mutation.
 *
 * Only book×persona pairs with status.json ok:true AND a complete out/ are
 * included from work/. Run verify.mjs first; upload-audio-r2.mjs ships the
 * same set.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = path.join(HERE, 'work');
const OUT = path.join(ROOT, 'public', 'narration-v1.json');
const VOICES = JSON.parse(readFileSync(path.join(HERE, 'voices.json'), 'utf8'));

const drops = process.argv.filter((a) => a.startsWith('--drop=')).map((a) => a.slice(7));

const manifest = {
    v: 1,
    voices: Object.fromEntries(Object.entries(VOICES.personas).map(([key, cfg]) => [key, { label: cfg.label }])),
    books: {},
};

// 1. Carry the shipped shelf forward from the committed manifest.
let carried = 0;
if (existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    for (const [id, book] of Object.entries(prev.books ?? {})) {
        for (const [persona, entry] of Object.entries(book.voices ?? {})) {
            if (drops.includes(`${id}/${persona}`)) { console.log(`dropped ${id}/${persona} (explicit --drop)`); continue; }
            manifest.books[id] ??= { voices: {} };
            manifest.books[id].voices[persona] = entry;
            carried++;
        }
    }
}

// 2. Overlay everything currently finished in work/.
let scanned = 0;
if (existsSync(WORK)) {
    for (const id of readdirSync(WORK).filter((d) => /^\d+$/.test(d)).sort((a, b) => Number(a) - Number(b))) {
        for (const persona of Object.keys(VOICES.personas)) {
            const dir = path.join(WORK, id, persona);
            const statusPath = path.join(dir, 'status.json');
            const timingPath = path.join(dir, 'out', 'timing-v1.json');
            if (!existsSync(statusPath) || !existsSync(timingPath)) continue;
            if (!JSON.parse(readFileSync(statusPath, 'utf8')).ok) continue;
            if (drops.includes(`${id}/${persona}`)) continue;
            const t = JSON.parse(readFileSync(timingPath, 'utf8'));
            manifest.books[id] ??= { voices: {} };
            manifest.books[id].voices[persona] = {
                naturalWpm: t.naturalWpm,
                segments: t.segments.length,
                bytes: t.segments.reduce((n, s) => n + s.bytes, 0),
                span: t.span,
            };
            scanned++;
        }
    }
}

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
const books = Object.keys(manifest.books).length;
const pairs = Object.values(manifest.books).reduce((n, b) => n + Object.keys(b.voices).length, 0);
console.log(`narration-v1.json written: ${books} book(s), ${pairs} pair(s) (${carried} carried forward, ${scanned} from work/).`);
