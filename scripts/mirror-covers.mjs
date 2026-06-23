/**
 * Mirror curated book covers off gutenberg.org into our own static host.
 *
 * Why: covers were hotlinked straight from gutenberg.org, which throttles and
 * drops hotlink connections, so shelves intermittently painted blank pages.
 * This script downloads each curated + vibe-hero cover once, optimizes it to a
 * small WebP, and writes `public/covers/<id>.webp`. By default the app serves
 * these same-origin from /covers (and bundles them into the build), so gutenberg
 * leaves the user's path entirely. To host on a CDN instead, upload the folder
 * and set VITE_COVER_BASE to its URL.
 *
 * This runs on your machine, never in production. It is safe to re-run: it
 * skips covers already mirrored, so you can stop and resume, and a second pass
 * naturally retries anything that failed.
 *
 *   node scripts/mirror-covers.mjs            mirror every curated cover
 *   node scripts/mirror-covers.mjs --limit=12 just the first 12 (smoke test)
 *   node scripts/mirror-covers.mjs --force    re-download even if present
 *
 * Tunables via env: COVER_WIDTH (px, default 220), COVER_QUALITY (1..100,
 * default 80), COVER_CONCURRENCY (default 6).
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const VIBES_PATH = path.join(ROOT, 'src', 'data', 'vibes.json');
// Output into public/ so the covers are served same-origin at /covers/<id>.webp
// (the app's default cover base) and bundle into the build. Gitignored.
const OUT_DIR = path.join(ROOT, 'public', 'covers');

// 330px keeps the largest card (w-44 ≈ 176px CSS) crisp at ~2x DPR while staying
// a small WebP (~10-18KB). Bump COVER_WIDTH if you want sharper.
const WIDTH = Number(process.env.COVER_WIDTH) || 330;
const QUALITY = Number(process.env.COVER_QUALITY) || 78;
const CONCURRENCY = Number(process.env.COVER_CONCURRENCY) || 6;
const RETRIES = 3;
const TIMEOUT_MS = 25_000;

const FORCE = process.argv.includes('--force');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

/** Fetch a URL into a Buffer, retrying past gutenberg's frequent timeouts. */
async function fetchWithRetry(url) {
    let lastErr;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                signal: ctrl.signal,
                headers: { 'User-Agent': 'FocusReader cover mirror' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return Buffer.from(await res.arrayBuffer());
        } catch (err) {
            lastErr = err;
            if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 1500));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

async function run() {
    const all = JSON.parse(await readFile(CURATED_PATH, 'utf8'));
    // Also mirror the vibe-page hero covers ("deeper cuts"). Shelf books use the
    // app's generated covers (they carry no cover URL), so they need no mirror.
    let heroBooks = [];
    try {
        const vibes = JSON.parse(await readFile(VIBES_PATH, 'utf8'));
        heroBooks = vibes.flatMap((v) => v.hero ?? []);
    } catch {
        // vibes.json not built yet — mirror curated covers only.
    }
    await mkdir(OUT_DIR, { recursive: true });

    const byId = new Map();
    for (const b of [...all, ...heroBooks]) {
        if (b.coverUrl && b.id && !byId.has(b.id)) byId.set(b.id, b);
    }
    let targets = [...byId.values()];
    if (Number.isFinite(LIMIT)) targets = targets.slice(0, LIMIT);

    let done = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];

    const report = (note) =>
        process.stdout.write(`\r  saved ${done}   skipped ${skipped}   failed ${failed}   ${note}`.padEnd(72));

    let cursor = 0;
    async function worker() {
        while (cursor < targets.length) {
            const book = targets[cursor++];
            const out = path.join(OUT_DIR, `${book.id}.webp`);
            if (!FORCE && existsSync(out)) {
                skipped++;
                report(`#${book.id}`);
                continue;
            }
            try {
                const buf = await fetchWithRetry(book.coverUrl);
                await sharp(buf)
                    .resize({ width: WIDTH, withoutEnlargement: true })
                    .webp({ quality: QUALITY })
                    .toFile(out);
                done++;
                report(`#${book.id}`);
            } catch (err) {
                failed++;
                failures.push({ id: book.id, title: book.title, url: book.coverUrl, error: String(err?.message ?? err) });
                report(`#${book.id} failed`);
            }
        }
    }

    console.log(`Mirroring ${targets.length} covers to covers/ (width ${WIDTH}px, webp q${QUALITY})\n`);
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (failures.length) {
        await writeFile(path.join(OUT_DIR, '_failed.json'), JSON.stringify(failures, null, 2));
    }
    console.log(`\n\nDone. saved ${done}, skipped ${skipped} already present, failed ${failed}.`);
    if (failures.length) {
        console.log(`Failed ids saved to covers/_failed.json. Re-run the script to retry them.`);
    }
    console.log(`\nDone — covers are in public/covers/ and served same-origin at /covers/. (Set VITE_COVER_BASE only if you'd rather host them on a CDN.)`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
