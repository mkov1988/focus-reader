/**
 * Narration pipeline, step 5: aggregate verified output into the manifest the
 * app fetches — public/narration-v1.json (committed to git, like
 * modernity-v1.json, so every deploy carries it).
 *
 *   node scripts/narration/build-manifest.mjs
 *
 * Versioning contract (same as starts-v1/modernity-v1): the filename IS the
 * version and _headers marks it immutable. Growing the shelf is fine — this
 * file is regenerated and redeployed, and devices pick it up whenever their
 * cached copy expires from disk (the app's fetch pattern treats it as
 * best-effort, never load-bearing). What must NEVER change inside v1 is the
 * meaning of existing fields or the audio files already uploaded — a changed
 * recording or timing format ships as timing-v2 / narration-v2, never as a
 * mutation, because audio and timing ARE immutable-cached forever.
 *
 * Only book×persona pairs with status.json ok:true AND a complete out/ are
 * included. Run verify.mjs first; upload-audio-r2.mjs ships the same set.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = path.join(HERE, 'work');
const OUT = path.join(ROOT, 'public', 'narration-v1.json');
const VOICES = JSON.parse(readFileSync(path.join(HERE, 'voices.json'), 'utf8'));

const manifest = {
    v: 1,
    voices: Object.fromEntries(Object.entries(VOICES.personas).map(([key, cfg]) => [key, { label: cfg.label }])),
    books: {},
};

if (existsSync(WORK)) {
    for (const id of readdirSync(WORK).filter((d) => /^\d+$/.test(d)).sort((a, b) => Number(a) - Number(b))) {
        for (const persona of Object.keys(VOICES.personas)) {
            const dir = path.join(WORK, id, persona);
            const statusPath = path.join(dir, 'status.json');
            const timingPath = path.join(dir, 'out', 'timing-v1.json');
            if (!existsSync(statusPath) || !existsSync(timingPath)) continue;
            if (!JSON.parse(readFileSync(statusPath, 'utf8')).ok) continue;
            const t = JSON.parse(readFileSync(timingPath, 'utf8'));
            manifest.books[id] ??= { voices: {} };
            manifest.books[id].voices[persona] = {
                naturalWpm: t.naturalWpm,
                segments: t.segments.length,
                bytes: t.segments.reduce((n, s) => n + s.bytes, 0),
                span: t.span,
            };
        }
    }
}

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
const books = Object.keys(manifest.books).length;
const pairs = Object.values(manifest.books).reduce((n, b) => n + Object.keys(b.voices).length, 0);
console.log(`narration-v1.json written: ${books} book(s), ${pairs} book×voice pair(s).`);
