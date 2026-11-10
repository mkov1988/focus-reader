/**
 * Covers for the whole catalog, not just the curated hot set.
 *
 * mirror-covers.mjs fetches the ~1,468 curated + vibe covers into
 * public/covers for the static surface. This one walks EVERY id the app can
 * show (the deep catalog in public/starts-v1.json plus curated and vibes),
 * skips what the bucket already holds, downloads each cover once from an
 * official Project Gutenberg mirror, converts it to the same small WebP
 * (width 330, quality 78 — identical to mirror-covers.mjs so the two sets
 * are indistinguishable), and writes <out>/<id>.webp for an rclone copy into
 * the focus-reader-books bucket under covers/ (functions/covers/[id].js
 * serves that prefix). Run by .github/workflows/covers-long-tail.yml.
 *
 * Books with no cover (the mirror answers 404) are recorded in a no-cover
 * list so the next run does not ask again; the app already paints a
 * generated cover whenever a remote one is missing, so a miss costs nothing.
 *
 *   node scripts/mirror-covers-all.mjs --out=/tmp/covers-new \
 *        [--existing=/tmp/existing.lst]   ids already in the bucket, one "<id>.webp" per line
 *        [--no-cover=/tmp/no-cover.json]  read + updated: {"v":1,"ids":[...]}
 *        [--source=https://gutenberg.pglaf.org]   official mirror (default); www.gutenberg.org throttles crawlers
 *        [--concurrency=4] [--limit=N] [--max-minutes=300]
 *
 * Politeness is deliberate: 4 connections, an identifying User-Agent, and a
 * mirror rather than the main site (docs/planning/book_access_strategy.md §6:
 * gutenberg.org blocks bulk crawlers). Stops cleanly at --max-minutes so a CI
 * job can upload what it has; a re-run picks up where it left off.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = arg('out', null);
if (!OUT) { console.error('Pass --out=<dir>'); process.exit(1); }
const EXISTING = arg('existing', null);
const NO_COVER = arg('no-cover', null);
const SOURCE = arg('source', 'https://gutenberg.pglaf.org').replace(/\/+$/, '');
const CONCURRENCY = Number(arg('concurrency', 4));
const LIMIT = Number(arg('limit', Infinity));
const MAX_MS = Number(arg('max-minutes', 300)) * 60_000;
const WIDTH = 330, QUALITY = 78, RETRIES = 3, TIMEOUT_MS = 25_000;

// The id universe: every book a shelf can show.
const ids = new Set();
const starts = JSON.parse(await readFile(path.join(ROOT, 'public', 'starts-v1.json'), 'utf8'));
for (const id of Object.keys(starts.starts)) ids.add(String(id));
for (const b of JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'curated.json'), 'utf8'))) ids.add(String(b.id));
try {
    const walk = (o) => {
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (o && typeof o === 'object') { if (typeof o.id === 'string' && typeof o.title === 'string') ids.add(o.id); Object.values(o).forEach(walk); }
    };
    walk(JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'vibes.json'), 'utf8')));
} catch { /* vibes.json not built — fine */ }

const have = new Set();
if (EXISTING && existsSync(EXISTING)) {
    for (const line of (await readFile(EXISTING, 'utf8')).split('\n')) {
        const m = line.trim().match(/^(\d+)\.webp$/);
        if (m) have.add(m[1]);
    }
}
let noCover = new Set();
if (NO_COVER && existsSync(NO_COVER)) {
    try { noCover = new Set(JSON.parse(await readFile(NO_COVER, 'utf8')).ids.map(String)); } catch { noCover = new Set(); }
}

let targets = [...ids].filter((id) => /^\d+$/.test(id) && !have.has(id) && !noCover.has(id)).sort((a, b) => Number(a) - Number(b));
if (Number.isFinite(LIMIT)) targets = targets.slice(0, LIMIT);
await mkdir(OUT, { recursive: true });
console.log(`universe ${ids.size} ids; in bucket ${have.size}; known no-cover ${noCover.size}; to fetch ${targets.length} from ${SOURCE} at concurrency ${CONCURRENCY}`);

async function fetchCover(id) {
    const url = `${SOURCE}/cache/epub/${id}/pg${id}.cover.medium.jpg`;
    let lastErr;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'FocusReader cover mirror (one pass, low concurrency)' } });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (!buf.length) throw new Error('empty body');
            return buf;
        } catch (err) {
            lastErr = err;
            if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 2000));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

const started = Date.now();
let saved = 0, missing = 0, failed = 0, cursor = 0, stopped = false;
const failures = [];
const newNoCover = [];
async function worker() {
    while (cursor < targets.length) {
        if (Date.now() - started > MAX_MS) { stopped = true; return; }
        const id = targets[cursor++];
        try {
            const buf = await fetchCover(id);
            if (buf === null) { missing++; newNoCover.push(id); continue; }
            await sharp(buf).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(path.join(OUT, `${id}.webp`));
            saved++;
        } catch (err) {
            failed++;
            failures.push({ id, error: String(err?.message ?? err) });
        }
        const n = saved + missing + failed;
        if (n % 500 === 0) console.log(`${n}/${targets.length}  saved ${saved}  no cover ${missing}  failed ${failed}  ${((Date.now() - started) / 60000).toFixed(0)} min`);
    }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (NO_COVER) {
    const all = [...new Set([...noCover, ...newNoCover])].sort((a, b) => Number(a) - Number(b));
    await writeFile(NO_COVER, JSON.stringify({ v: 1, note: 'ids whose cover the Gutenberg mirror does not have (404); the app paints a generated cover for these', ids: all }) + '\n');
}
if (failures.length) await writeFile(path.join(OUT, '_failed.json'), JSON.stringify(failures, null, 2) + '\n');
console.log(`done: saved ${saved}, no cover ${missing}, failed ${failed}, left for the next run ${targets.length - cursor}${stopped ? ' (stopped at --max-minutes)' : ''}`);
// Transient failures are retried by the next run (they are neither in the
// bucket nor in the no-cover list). Only a run that saved nothing while having
// work is an error worth failing the job for.
if (targets.length && saved === 0 && missing === 0) process.exit(1);
