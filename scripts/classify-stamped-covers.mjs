/**
 * Find the covers that carry Project Gutenberg's branding, so the paywall
 * rush's slow shelf (Android: src/paywall/Rush.tsx) never shows one. The
 * brand rule is in plans/build-paywall.md in the Android repo: "Project
 * Gutenberg" never on a cover or in a line of ours. (The storefront still
 * shows every mirrored cover; that is Michael's call, not this script's.)
 *
 * Two looks are caught, by pixels, from the mirrored webp files:
 *
 *   A. The auto-generated cover: a thin coloured bar across the very top, a
 *      white band with the title and author, a flat saturated field of
 *      geometric shapes, "Project Gutenberg" bottom right.
 *   B. The older generated cover: the scanned title page over a dark band
 *      across the bottom reading "DIGITIZED and TRANSCRIBED for PROJECT
 *      GUTENBERG" in small light caps (e.g. #1513).
 *
 * Plus by title: anything with "Project Gutenberg" in the title itself
 * (index volumes) and the CIA factbooks (their own kind of off brand).
 *
 * Writes src/data/stamped-covers.json. Consumed by scripts/export-native.mjs.
 * Verify by eye with --sheets: contact sheets of the stamped set (false
 * positives are the ones that matter) land in the scratch folder you pass.
 *
 *   node scripts/classify-stamped-covers.mjs
 *   node scripts/classify-stamped-covers.mjs --sheets=C:/some/folder
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVERS = path.join(ROOT, 'public', 'covers');
const CURATED = path.join(ROOT, 'src', 'data', 'curated.json');
const VIBES = path.join(ROOT, 'src', 'data', 'vibes.json');
const OUT = path.join(ROOT, 'src', 'data', 'stamped-covers.json');

const sheetsArg = process.argv.find((a) => a.startsWith('--sheets='));
const SHEETS = sheetsArg ? sheetsArg.slice('--sheets='.length) : null;

const W = 100, H = 150;

/** Every book whose cover is mirrored and could reach the shelf. */
async function books() {
    const curated = JSON.parse(await readFile(CURATED, 'utf8'));
    const vibes = JSON.parse(await readFile(VIBES, 'utf8'));
    const byId = new Map();
    for (const b of curated) byId.set(b.id, { id: b.id, title: b.title, author: b.author });
    const walk = (o) => {
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (o && typeof o === 'object') {
            if (typeof o.id === 'string' && typeof o.title === 'string' && !byId.has(o.id)) byId.set(o.id, { id: o.id, title: o.title, author: o.author ?? '' });
            Object.values(o).forEach(walk);
        }
    };
    walk(vibes);
    return [...byId.values()];
}

async function pixels(id) {
    const file = path.join(COVERS, `${id}.webp`);
    if (!existsSync(file)) return null;
    const { data } = await sharp(file).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return data;
}

function sat(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
}

/** Style A's three bands. The thresholds are loose on purpose: long titles
 *  eat into the white band, pastel fields read as barely saturated, and
 *  webp noise splits a flat colour across two bins. The contact sheets are
 *  the check against false positives. */
function styleA(px) {
    const at = (x, y) => { const i = (y * W + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
    // Top bar: rows 0..3, a colour (not white, not grey).
    let barSat = 0, barWhite = 0, n = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y); barSat += sat(r, g, b); if (r > 232 && g > 232 && b > 232) barWhite++; n++; }
    barSat /= n; barWhite /= n;
    // White band: rows 8..26, mostly near white (the text takes a little).
    let white = 0; n = 0;
    for (let y = 8; y < 27; y++) for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y); if (r > 232 && g > 232 && b > 232) white++; n++; }
    const whiteFrac = white / n;
    // Field: rows 55..138, coloured, and three flat colours cover most of it.
    let fieldSat = 0; n = 0;
    const hist = new Map();
    for (let y = 55; y < 139; y++) for (let x = 0; x < W; x++) {
        const [r, g, b] = at(x, y);
        fieldSat += sat(r, g, b); n++;
        const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
        hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    fieldSat /= n;
    const top3 = [...hist.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / n;
    return { barSat, whiteFrac, fieldSat, top3, hit: whiteFrac > 0.55 && fieldSat > 0.20 && top3 > 0.62 && barSat > 0.08 && barWhite < 0.5 };
}

/** Style B: the bottom 12 percent is a dark band carrying a little light
 *  text, centred and about half the width, under a mostly light page. */
function styleB(px) {
    const lum = (x, y) => { const i = (y * W + x) * 3; return (px[i] + px[i + 1] + px[i + 2]) / 3; };
    let dark = 0, light = 0, n = 0, minX = W, maxX = 0;
    for (let y = 133; y < H; y++) for (let x = 0; x < W; x++) {
        const l = lum(x, y); n++;
        if (l < 70) dark++;
        else if (l > 150) { light++; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    let above = 0, m = 0;
    for (let y = 120; y < 130; y++) for (let x = 0; x < W; x++) { if (lum(x, y) > 170) above++; m++; }
    const span = maxX - minX, mid = (maxX + minX) / 2;
    return dark / n > 0.70 && light / n > 0.01 && light / n < 0.045 && span > 30 && span < 65 && Math.abs(mid - 50) < 8 && above / m > 0.3;
}

const list = await books();
console.log(`${list.length} books with a mirrored cover possible`);
const stamped = [];
const reasons = {};
let missing = 0;
for (const b of list) {
    const title = b.title.toLowerCase();
    if (title.includes('project gutenberg')) { stamped.push(b.id); reasons[b.id] = 'title'; continue; }
    if (title.includes('factbook')) { stamped.push(b.id); reasons[b.id] = 'factbook'; continue; }
    const px = await pixels(b.id);
    if (!px) { missing++; continue; }
    const a = styleA(px);
    if (a.hit) { stamped.push(b.id); reasons[b.id] = 'A'; continue; }
    if (styleB(px)) { stamped.push(b.id); reasons[b.id] = 'B'; }
}
const counts = {};
for (const r of Object.values(reasons)) counts[r[0]] = (counts[r[0]] ?? 0) + 1;
console.log(`stamped: ${stamped.length} (${JSON.stringify(counts)}); covers missing: ${missing}`);

await writeFile(OUT, JSON.stringify({
    _note: 'Covers that carry Project Gutenberg branding (auto-generated covers, the older "PROJECT GUTENBERG" page, index volumes by title) plus the CIA factbooks. Found by scripts/classify-stamped-covers.mjs from the mirrored webp files; the paywall rush\'s slow shelf skips these. Regenerate after a cover mirror; verify with --sheets.',
    ids: stamped,
    reasons,
}, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)}`);

if (SHEETS) {
    await mkdir(SHEETS, { recursive: true });
    const SW = 90, SH = 135, COLS = 12, PAD = 4, LABEL = 14;
    const draw = async (ids, name) => {
        for (let s = 0; s * 96 < ids.length; s++) {
            const slice = ids.slice(s * 96, s * 96 + 96);
            const comps = [];
            for (let i = 0; i < slice.length; i++) {
                const id = slice[i];
                const x = (i % COLS) * (SW + PAD) + PAD, y = Math.floor(i / COLS) * (SH + LABEL + PAD) + PAD;
                let img;
                try { img = await sharp(path.join(COVERS, `${id}.webp`)).resize(SW, SH, { fit: 'cover' }).png().toBuffer(); }
                catch { img = await sharp({ create: { width: SW, height: SH, channels: 3, background: '#888' } }).png().toBuffer(); }
                comps.push({ input: img, left: x, top: y });
                const label = Buffer.from(`<svg width="${SW}" height="${LABEL}"><rect width="100%" height="100%" fill="#fff"/><text x="1" y="11" font-size="10" font-family="Arial" fill="#000">${id} ${(reasons[id] ?? '').slice(0, 1)}</text></svg>`);
                comps.push({ input: label, left: x, top: y + SH });
            }
            const rows = Math.ceil(slice.length / COLS);
            await sharp({ create: { width: COLS * (SW + PAD) + PAD, height: rows * (SH + LABEL + PAD) + PAD, channels: 3, background: '#fff' } })
                .composite(comps).png().toFile(path.join(SHEETS, `${name}${s + 1}.png`));
        }
    };
    await draw(stamped, 'stamped');
    const clean = list.map((b) => b.id).filter((id) => !reasons[id]);
    await draw(clean, 'clean');
    console.log(`sheets in ${SHEETS}: stamped ${Math.ceil(stamped.length / 96)}, clean ${Math.ceil(clean.length / 96)}`);
}
