/**
 * Generate scripts/deploy-data-plane.json — the exact static data plane a
 * Pages deploy must carry — by probing PRODUCTION for what it serves today.
 *
 * Why probing, not deriving: public/books and public/covers are gitignored
 * desk artifacts. The books can be derived (curated.json + vibes.json union),
 * but production serves ~67 covers whose ids appear in no current or
 * historical data file — and covers have no R2 fallback door, so a deploy
 * that misses one DELETES it from production (a Pages deploy replaces the
 * whole site). Production is the only complete authority.
 *
 * Candidates probed: every id in src/data/*.json (current AND every git
 * revision of curated/vibes — run with full history), plus every id in
 * public/starts-v1.json (the whole mirror). A cover outside that universe is
 * unreferenced by any shipped surface and unreachable by the app.
 *
 *   node scripts/freeze-data-plane.mjs        writes scripts/deploy-data-plane.json
 *
 * Run from CI (data-plane-freeze.yml) — the id universe is ~56k HEAD probes.
 * The SPA fallback answers missing files with 200 text/html, so presence is
 * judged by content-type, never status alone. A fast sweep at concurrency 40
 * sheds a few hundred transient connection errors against the edge; those
 * ids get a second, slow pass, and only ids that STILL error block the
 * freeze — an unresolved id might be a cover the list would silently drop.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BOOK_BASE || 'https://focus-reader-48z.pages.dev').replace(/\/+$/, '');

const ids = new Set();
const add = (x) => { if (x != null && /^[0-9]+$/.test(String(x))) ids.add(String(x)); };

// Current curated + vibes (the derivable static-book set), kept separately.
const bookIds = new Set();
const curated = JSON.parse(readFileSync(path.join(ROOT, 'src/data/curated.json'), 'utf8'));
for (const b of curated) if (b.id) { add(b.id); bookIds.add(String(b.id)); }
const vibes = JSON.parse(readFileSync(path.join(ROOT, 'src/data/vibes.json'), 'utf8'));
for (const v of vibes) {
    for (const b of [...(v.hero ?? []), ...(v.shelves ?? []).flatMap((s) => s.books ?? [])]) {
        if (b.id) { add(b.id); bookIds.add(String(b.id)); }
    }
}

// Every other current data file, and every historical curated/vibes revision.
for (const f of ['scenes.json', 'story-starts.json', 'modernity.json']) {
    try { for (const m of readFileSync(path.join(ROOT, 'src/data', f), 'utf8').matchAll(/"id"\s*:\s*"?([0-9]+)"?/g)) add(m[1]); } catch { /* optional */ }
}
for (const file of ['src/data/curated.json', 'src/data/vibes.json']) {
    let shas = [];
    try { shas = execSync(`git log --all --format=%H -- "${file}"`, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { /* shallow clone */ }
    for (const sha of shas) {
        try {
            const raw = execSync(`git show ${sha}:"${file}"`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
            for (const m of raw.matchAll(/"id"\s*:\s*"?([0-9]+)"?/g)) add(m[1]);
        } catch { /* file absent at that revision */ }
    }
}

// The whole mirror (deep-starts covers it), for the cover sweep.
const starts = new Set(Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'public/starts-v1.json'), 'utf8')).starts));
for (const id of starts) add(id);

const all = [...ids];
console.log(`candidate universe: ${all.length} ids (${bookIds.size} derivable static books)`);

async function head(url, attempts, baseDelayMs) {
    for (let a = 0; a < attempts; a++) {
        try {
            const r = await fetch(url, { method: 'HEAD' });
            return { status: r.status, type: r.headers.get('content-type') || '' };
        } catch (err) { if (a === attempts - 1) return { status: -1, type: String(err).slice(0, 80) }; }
        await new Promise((r) => setTimeout(r, baseDelayMs * (a + 1)));
    }
}

async function sweep(list, mk, keep, label, conc, attempts = 4, baseDelayMs = 700) {
    const found = [], errs = [];
    const queue = [...list];
    let done = 0;
    await Promise.all(Array.from({ length: conc }, async () => {
        while (queue.length) {
            const id = queue.pop();
            const r = await head(mk(id), attempts, baseDelayMs);
            if (r.status === -1) errs.push(id);
            else if (keep(r)) found.push(id);
            if (++done % 5000 === 0) console.log(`${label}: ${done}/${list.length}, ${found.length} found`);
        }
    }));
    return { found, errs };
}

// Fast sweep, then a slow second pass over just the ids that errored — a
// 40-wide HEAD flood sheds ~0.7% transient connection errors at the edge.
async function sweepWithRetry(list, mk, keep, label) {
    const fast = await sweep(list, mk, keep, label, 40);
    if (!fast.errs.length) return fast;
    console.log(`${label}: retrying ${fast.errs.length} errored ids slowly`);
    const slow = await sweep(fast.errs, mk, keep, `${label}-retry`, 5, 5, 2000);
    return { found: [...fast.found, ...slow.found], errs: slow.errs };
}

const covers = await sweepWithRetry(all, (id) => `${BASE}/covers/${id}.webp`,
    (r) => r.status === 200 && r.type.includes('image'), 'covers');
console.log(`covers on production: ${covers.found.length} (unresolved ${covers.errs.length})`);

// Static books production must keep that the R2 mirror can't replace: probe
// only candidates OUTSIDE the mirror (books inside it fall through to the R2
// door with identical bytes even if their static copy is dropped).
const nonMirror = all.filter((id) => !starts.has(id));
const extraBooks = await sweepWithRetry(nonMirror, (id) => `${BASE}/books/${id}.txt`,
    (r) => r.status === 200 && r.type.includes('text/plain'), 'books');
console.log(`non-mirror statics: ${extraBooks.found.length} of ${nonMirror.length} candidates (unresolved ${extraBooks.errs.length})`);

if (covers.errs.length || extraBooks.errs.length) {
    console.error('ids still unresolved after the slow retry — refusing to freeze an incomplete list:');
    for (const e of [...covers.errs, ...extraBooks.errs].slice(0, 20)) console.error('  ' + e);
    process.exit(1);
}

for (const id of extraBooks.found) bookIds.add(String(id));
const num = (a) => a.map(Number).sort((x, y) => x - y).map(String);
const out = {
    comment: 'Static data plane a deploy must carry, frozen by scripts/freeze-data-plane.mjs probing production. books = curated+vibes union plus production statics not in the R2 mirror; covers = exactly the .webp files production serves. Regenerate deliberately (data-plane-freeze.yml) when the curated set changes — never trim to make a deploy pass: a Pages deploy REPLACES the site and covers have no R2 fallback.',
    frozenAt: new Date().toISOString().slice(0, 10),
    books: num([...bookIds]),
    covers: num(covers.found),
};
writeFileSync(path.join(ROOT, 'scripts', 'deploy-data-plane.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`frozen: ${out.books.length} books, ${out.covers.length} covers -> scripts/deploy-data-plane.json`);

// Sanity against the deploy guard: freezing FEWER than the guard demands
// means the probe missed content — fail here, not at deploy time.
const guard = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'deploy-manifest.json'), 'utf8'));
if (out.books.length < guard.minBooks || out.covers.length < guard.minCovers) {
    console.error(`frozen counts below deploy guard (${guard.minBooks} books / ${guard.minCovers} covers) — investigate before deploying`);
    process.exit(1);
}
