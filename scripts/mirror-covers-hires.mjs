/**
 * Phase 1 of the covers plan: re-mirror hot-set covers at full resolution.
 *
 * Today's public/covers webp files were made from Gutenberg's ~200px
 * "medium" thumbnails, which is below what the app's largest cards need.
 * The full-resolution cover (often 1500-2700px tall) ships inside each
 * book's epub at /cache/epub/<id>/pg<id>-images-3.epub as OEBPS/*cover*.
 * This script downloads the epub, pulls that image out, and writes
 * public/covers/<id>.webp at 530px wide (crisp on the largest card at 3x).
 *
 * Branding gate (legally load bearing, see LEGAL.md "Cover images"):
 * books listed in scripts/covers-audit/branded.json carry Project
 * Gutenberg's auto-generated branded cover and are SKIPPED entirely —
 * their epub cover is the same branded card. They get covers from the
 * Standard Ebooks overlay (se-covers.mjs) or the generated-cover pipeline.
 *
 * Run (desk run, a few minutes per hundred books — full set is a long run,
 * Michael's terminal per CLAUDE.md):
 *   node scripts/mirror-covers-hires.mjs --ids=84,1342     # smoke test
 *   node scripts/mirror-covers-hires.mjs                   # full hot set
 * Requires the `unzip` binary. Resumable: skips ids already done unless
 * --force. Failures land in public/covers/_hires-failed.json; books whose
 * epub has no usable cover land in _hires-nocover.json (generated tier).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'covers');
const AUDIT = path.join(ROOT, 'scripts', 'covers-audit', 'branded.json');

const WIDTH = Number(process.env.COVER_WIDTH || 530);
const QUALITY = Number(process.env.COVER_QUALITY || 80);
const CONCURRENCY = Number(process.env.COVER_CONCURRENCY || 3);
const TIMEOUT = 60_000;
const SOURCE = process.env.COVER_SOURCE || 'https://www.gutenberg.org/cache/epub';
const UA = 'FocusReader cover mirror';

const force = process.argv.includes('--force');
const idsArg = process.argv.find(a => a.startsWith('--ids='));

function hotSetIds() {
    const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/curated.json'), 'utf8'));
    const vibes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/vibes.json'), 'utf8'));
    const ids = new Set(curated.map(b => String(b.id)));
    for (const v of vibes) {
        if (v.hero) for (const b of v.hero) ids.add(String(b.id));
        if (v.shelves) for (const s of v.shelves) for (const b of (s.books || [])) ids.add(String(b.id));
    }
    return [...ids];
}

const branded = new Set(
    fs.existsSync(AUDIT) ? JSON.parse(fs.readFileSync(AUDIT, 'utf8')).map(String) : []
);

async function fetchEpub(id) {
    const url = `${SOURCE}/${id}/pg${id}-images-3.epub`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    } finally { clearTimeout(t); }
}

function extractCover(epubPath) {
    const list = execFileSync('unzip', ['-l', epubPath], { encoding: 'utf8' });
    const names = list.split('\n').map(l => l.trim().split(/\s+/).slice(3).join(' ')).filter(Boolean);
    const cover = names.find(n => /cover[^/]*\.(jpe?g|png)$/i.test(n));
    if (!cover) return null;
    return execFileSync('unzip', ['-p', epubPath, cover], { maxBuffer: 64 * 1024 * 1024 });
}

async function one(id, results) {
    const out = path.join(OUT, `${id}.webp`);
    if (branded.has(String(id))) { results.skippedBranded.push(id); return; }
    if (!force && results.existing.has(id)) { results.kept.push(id); return; }
    try {
        const epub = await fetchEpub(id);
        if (!epub) { results.failed.push(id); return; }
        const tmp = path.join(os.tmpdir(), `pg${id}.epub`);
        fs.writeFileSync(tmp, epub);
        let img;
        try { img = extractCover(tmp); } finally { fs.unlinkSync(tmp); }
        if (!img) { results.nocover.push(id); return; }
        const meta = await sharp(img).metadata();
        // The auto-generated card is 400x600; anything that small is not a
        // real scan worth upgrading — leave the existing file alone.
        if (meta.width <= 400 && meta.height <= 600) { results.nocover.push(id); return; }
        let buf = await sharp(img).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
        // noisy photographic scans can balloon; cap the payload for phones
        if (buf.length > 90_000) buf = await sharp(img).resize({ width: WIDTH, withoutEnlargement: true }).blur(0.4).webp({ quality: 64, effort: 6, smartSubsample: true }).toBuffer();
        fs.writeFileSync(out, buf);
        results.done.push(id);
    } catch (e) {
        results.failed.push(id);
    }
}

const ids = idsArg ? idsArg.slice(6).split(',').map(s => s.trim()) : hotSetIds();
fs.mkdirSync(OUT, { recursive: true });
const results = {
    done: [], kept: [], failed: [], nocover: [], skippedBranded: [],
    existing: new Set(force ? [] : ids.filter(id => {
        const f = path.join(OUT, `${id}.webp`);
        // "already hi-res" = wider than the old ~200px mirrors
        try { return fs.statSync(f).size > 25_000; } catch { return false; }
    })),
};

let i = 0;
async function workerLoop() {
    while (i < ids.length) {
        const id = ids[i++];
        await one(id, results);
        const n = results.done.length + results.kept.length + results.failed.length + results.nocover.length + results.skippedBranded.length;
        if (n % 50 === 0) console.log(`${n}/${ids.length} done=${results.done.length} nocover=${results.nocover.length} failed=${results.failed.length}`);
        await new Promise(r => setTimeout(r, 400)); // stay polite to gutenberg.org
    }
}
await Promise.all(Array.from({ length: CONCURRENCY }, workerLoop));

fs.writeFileSync(path.join(OUT, '_hires-failed.json'), JSON.stringify(results.failed, null, 1));
fs.writeFileSync(path.join(OUT, '_hires-nocover.json'), JSON.stringify(results.nocover, null, 1));
console.log(`upgraded=${results.done.length} already-hires=${results.kept.length} no-real-cover=${results.nocover.length} branded-skipped=${results.skippedBranded.length} failed=${results.failed.length}`);
console.log('no-real-cover + branded-skipped books go to the Standard Ebooks overlay or the generated-cover pipeline.');
