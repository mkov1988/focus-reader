/**
 * Phase 2 of the covers plan: real covers for the long tail (~54.5k books).
 *
 * Everything here is a LONG RUN for Michael's terminal (CLAUDE.md), and all
 * bulk fetching rides Gutenberg's sanctioned rsync mirrors — never crawling
 * gutenberg.org (they block crawlers; LEGAL.md:104-106).
 *
 * The run, start to finish, with exact rsync commands:
 * scripts/covers-audit/RUNBOOK.md. Short version:
 *   1. rsync the cover thumbnails from the sanctioned mirror
 *   2. --classify   → real art vs branded card (mirror/covers-classify.json)
 *   3. --want-list  → then rsync just the epubs for the real ones
 *   4. --stage      → extract full-res covers (needs `unzip`), webp,
 *                     mirror/covers/<id>.webp + manifest
 *   5. upload mirror/covers to the R2 covers/ prefix (served by
 *      functions/covers/[id].js), then backup-r2.mjs
 *
 * Books classified as card (no real art) are the generated-cover
 * pipeline's audience — see docs/planning/covers-plan.md phase 3.
 *
 * Smoke test without rsync (single polite HTTP fetches):
 *   node scripts/mirror-covers-longtail.mjs --classify --ids=5394,9,7525
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIRROR = path.join(ROOT, 'mirror');
const SRC = process.env.COVER_SRC_DIR || path.join(MIRROR, 'cover-src');
const EPUBS = process.env.EPUB_SRC_DIR || path.join(MIRROR, 'epub-src');
const OUT = path.join(MIRROR, 'covers');
const CLASSIFY = path.join(MIRROR, 'covers-classify.json');
const WIDTH = Number(process.env.COVER_WIDTH || 530);
const UA = 'FocusReader cover mirror';

const idsArg = process.argv.find(a => a.startsWith('--ids='));

function longTailIds() {
    const starts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/starts-v1.json'), 'utf8'));
    const ids = new Set(Object.keys(starts.starts));
    // catalog.json covers the ~1,338 R2 books outside starts-v1, when present
    const cat = path.join(MIRROR, 'catalog.json');
    if (fs.existsSync(cat)) {
        for (const b of JSON.parse(fs.readFileSync(cat, 'utf8'))) ids.add(String(b.id));
    } else {
        console.log('note: mirror/catalog.json absent — scoped to the 54,525 starts-v1 ids');
    }
    // the hot set is phase 1's job, not this script's
    const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/curated.json'), 'utf8'));
    const vibes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/vibes.json'), 'utf8'));
    for (const b of curated) ids.delete(String(b.id));
    for (const v of vibes) {
        for (const b of (v.hero || [])) ids.delete(String(b.id));
        for (const s of (v.shelves || [])) for (const b of (s.books || [])) ids.delete(String(b.id));
    }
    return [...ids];
}

// The auto-generated branded card is 400x600 at source (200x300 as a cache
// "medium"); its style is flat neon geometry. Both signals together keep
// false real→card calls harmless (book just gets a generated cover) and
// false card→real calls near zero.
async function isCard(buf) {
    const meta = await sharp(buf).metadata();
    if ((meta.width === 400 && meta.height === 600) || (meta.width === 200 && meta.height === 300)) {
        const { data, info } = await sharp(buf).resize(48, 72, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
        const n = info.width * info.height, c = info.channels;
        let neon = 0, satSum = 0;
        for (let i = 0; i < n; i++) {
            const r = data[i * c], g = data[i * c + 1], b = data[i * c + 2];
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            satSum += mx ? (mx - mn) / mx : 0;
            if ((g > 150 && r < 110 && b < 200) || (b > 150 && r < 110) || (r > 150 && b > 150 && g < 110)) neon++;
        }
        // flat saturated geometry → card; muted/noisy 200x300 → likely a
        // transcriber title card, still classified card (no real art to gain)
        return neon / n > 0.2 || satSum / n > 0.5;
    }
    return false;
}

async function srcImage(id) {
    const local = path.join(SRC, String(id), `pg${id}.cover.medium.jpg`);
    if (fs.existsSync(local)) return fs.readFileSync(local);
    if (!idsArg) return null; // bulk mode never touches the network
    const res = await fetch(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`, { headers: { 'User-Agent': UA } });
    await new Promise(r => setTimeout(r, 500));
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

async function classify() {
    const ids = idsArg ? idsArg.slice(6).split(',') : longTailIds();
    const out = { real: [], card: [], missing: [] };
    let n = 0;
    for (const id of ids) {
        try {
            const buf = await srcImage(id);
            if (!buf) { out.missing.push(id); continue; }
            (await isCard(buf) ? out.card : out.real).push(id);
        } catch { out.missing.push(id); }
        if (++n % 2000 === 0) { console.log(`${n}/${ids.length} real=${out.real.length} card=${out.card.length}`); fs.writeFileSync(CLASSIFY, JSON.stringify(out)); }
    }
    fs.mkdirSync(MIRROR, { recursive: true });
    fs.writeFileSync(CLASSIFY, JSON.stringify(out, null, 1));
    console.log(`classified: real=${out.real.length} card=${out.card.length} missing=${out.missing.length}`);
    console.log('card + missing books are the generated-cover pipeline audience.');
}

function wantList() {
    const cls = JSON.parse(fs.readFileSync(CLASSIFY, 'utf8'));
    const lines = cls.real.map(id => `${id}/pg${id}-images-3.epub`);
    fs.writeFileSync(path.join(MIRROR, 'covers-want.txt'), lines.join('\n') + '\n');
    console.log(`wrote mirror/covers-want.txt (${lines.length} epubs) — feed to rsync --files-from`);
}

async function toWebp(img, out) {
    let buf = await sharp(img).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 78, effort: 5 }).toBuffer();
    if (buf.length > 90_000) buf = await sharp(img).resize({ width: WIDTH, withoutEnlargement: true }).blur(0.4).webp({ quality: 64, effort: 6, smartSubsample: true }).toBuffer();
    fs.writeFileSync(out, buf);
}

async function stage() {
    const cls = JSON.parse(fs.readFileSync(CLASSIFY, 'utf8'));
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = { staged: [], fallback200: [], failed: [] };
    let n = 0;
    for (const id of cls.real) {
        const out = path.join(OUT, `${id}.webp`);
        if (fs.existsSync(out)) { manifest.staged.push(id); continue; }
        try {
            const epub = path.join(EPUBS, String(id), `pg${id}-images-3.epub`);
            let img = null;
            if (fs.existsSync(epub)) {
                const list = execFileSync('unzip', ['-l', epub], { encoding: 'utf8' });
                const name = list.split('\n').map(l => l.trim().split(/\s+/).slice(3).join(' ')).find(nm => /cover[^/]*\.(jpe?g|png)$/i.test(nm));
                if (name) img = execFileSync('unzip', ['-p', epub, name], { maxBuffer: 64 * 1024 * 1024 });
            }
            if (!img) { // no epub art — ship the 200px medium rather than nothing
                img = await srcImage(id);
                if (!img) { manifest.failed.push(id); continue; }
                manifest.fallback200.push(id);
            }
            await toWebp(img, out);
            manifest.staged.push(id);
        } catch { manifest.failed.push(id); }
        if (++n % 2000 === 0) console.log(`${n}/${cls.real.length} staged`);
    }
    fs.writeFileSync(path.join(MIRROR, 'covers-manifest.json'), JSON.stringify(manifest, null, 1));
    console.log(`staged=${manifest.staged.length} (200px-fallback=${manifest.fallback200.length}) failed=${manifest.failed.length} → mirror/covers/`);
}

if (process.argv.includes('--classify')) await classify();
else if (process.argv.includes('--want-list')) wantList();
else if (process.argv.includes('--stage')) await stage();
else console.log('usage: mirror-covers-longtail.mjs --classify [--ids=..] | --want-list | --stage');
