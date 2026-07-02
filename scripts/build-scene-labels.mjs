/**
 * Generate label-only scene maps for the whole catalog, fast and with no reading.
 *
 * A scrubber entry needs a label (the scene name on the tick) and, optionally, a
 * recap (the "previously…" line). The labels almost always already exist in the
 * book as chapter titles ("A Mad Tea-Party", "The Cyclops"), so this lifts them
 * straight out of the text: detect chapter headings, take the descriptive title
 * (on the heading line, or the short title line just after it), and emit
 * { startIndex, label } at the right token index. No model, no reading.
 *
 * Merges into src/data/scenes.json. Books that ALREADY have entries (the
 * hand-authored ones, which carry rich recaps) are left untouched. Run order:
 *   npm run build:scenes        # authored maps (with recaps) -> scenes.json
 *   npm run build:scenes:labels # this: title labels for everything else
 *
 *   node scripts/build-scene-labels.mjs            every curated + vibe book
 *   node scripts/build-scene-labels.mjs --ids=145  just these
 *   node scripts/build-scene-labels.mjs --dry      report, don't write
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const VIBES_PATH = path.join(ROOT, 'src', 'data', 'vibes.json');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'scenes.json');

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const IDS = (arg('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DRY = process.argv.includes('--dry');
const MIN_CHAPTERS = 3;
const MIN_GAP = 120; // tokens; closer headings are a table-of-contents cluster

const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function romanToInt(s) { const r = s.toLowerCase(); let t = 0; for (let i = 0; i < r.length; i++) { const c = ROMAN_VALUES[r[i]] ?? 0, n = ROMAN_VALUES[r[i + 1]] ?? 0; t += c < n ? -c : c; } return t; }
function numToArabic(s) { return /^\d+$/.test(s) ? s : String(romanToInt(s)); }
function titleCase(s) { return s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase()); }
function clean(s) { let t = s.replace(/[_*]/g, '').replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim(); if (t === t.toUpperCase() && /[A-Z]/.test(t)) t = titleCase(t); return t; }

const KEYWORD_RE = /^(chapter|chap|book|part|letter|canto|stave|volume|section)\.?\s+(\d{1,3}|[ivxlcdm]+)[.):\]]*(?:\s+(.+))?$/i;
const ROMAN_TITLE_RE = /^([ivxlcdm]+)\.\s+([A-Z].{1,56})$/i;
const BARE_NUM_RE = /^([ivxlcdm]+|\d{1,3})\.?$/i;
const STANDALONE_RE = /^(prologue|epilogue|introduction|preface|foreword|afterword|conclusion)\.?$/i;

/** Is a line a plausible standalone chapter title (short, title-ish, not prose)? */
function looksLikeTitle(line) {
    const t = line.trim();
    if (!t || t.length > 50 || /^[[(]/.test(t)) return false;       // skip [Illustration] etc.
    if (!/^[A-Z“"'0-9]/.test(t)) return false;
    if (/[,;:]$/.test(t)) return false;                              // prose-ish tail
    if (t.split(/\s+/).length > 9) return false;                     // titles are short
    return true;
}

/** The descriptive title just after a bare heading, or null. */
function nextLineTitle(lines, i) {
    for (let k = i + 1; k < Math.min(i + 4, lines.length); k++) {
        const t = lines[k].trim();
        if (!t) continue;
        return looksLikeTitle(t) ? clean(t) : null;
    }
    return null;
}

function detectLabels(raw) {
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const offsets = [];
    let cum = 0;
    for (const line of lines) { offsets.push(cum); const t = line.trim(); if (t) cum += t.split(/\s+/).length; }

    const cands = [];
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t.length > 70) continue;
        let label = null, m;
        if ((m = t.match(KEYWORD_RE))) {
            const onLine = m[3]?.trim();
            label = (onLine && /^[A-Z0-9"'([“‘]/.test(onLine) && onLine.length <= 58) ? clean(onLine)
                : nextLineTitle(lines, i) || `Chapter ${numToArabic(m[2])}`;
        } else if ((m = t.match(ROMAN_TITLE_RE))) {
            label = clean(m[2]);
        } else if (BARE_NUM_RE.test(t)) {
            label = nextLineTitle(lines, i) || `Chapter ${numToArabic(t.replace(/\.$/, ''))}`;
        } else if (STANDALONE_RE.test(t)) {
            label = titleCase(t.replace(/\.$/, ''));
        } else continue;
        cands.push({ startIndex: offsets[i], label });
    }

    // Drop table-of-contents clusters (headings packed close together near the front).
    const kept = [];
    for (const c of cands) if (!kept.length || c.startIndex - kept[kept.length - 1].startIndex >= MIN_GAP) kept.push(c);
    return kept;
}

function targetIds() {
    if (IDS.length) return IDS;
    const ids = new Set();
    for (const b of JSON.parse(readFileSync(CURATED_PATH, 'utf8'))) if (b.id) ids.add(String(b.id));
    for (const v of JSON.parse(readFileSync(VIBES_PATH, 'utf8'))) for (const b of [...(v.hero ?? []), ...(v.shelves ?? []).flatMap((s) => s.books ?? [])]) if (b.id) ids.add(String(b.id));
    return [...ids];
}

async function main() {
    const existing = existsSync(OUT_PATH) ? JSON.parse(await readFile(OUT_PATH, 'utf8')) : {};
    const authored = new Set(Object.keys(existing));
    const ids = targetIds().filter((id) => !authored.has(id));

    let added = 0, noStructure = 0, noText = 0;
    const samples = [];
    for (const id of ids) {
        const file = path.join(BOOKS_DIR, `${id}.txt`);
        if (!existsSync(file)) { noText++; continue; }
        const scenes = detectLabels(await readFile(file, 'utf8'));
        if (scenes.length < MIN_CHAPTERS) { noStructure++; continue; }
        existing[id] = scenes;
        added++;
        if (samples.length < 12) samples.push(`#${id}: ${scenes.length} (${scenes.slice(0, 4).map((s) => s.label).join(' / ')})`);
    }

    console.log(`Authored (skipped): ${authored.size}`);
    console.log(`Labelled this run:  ${added}`);
    console.log(`No chapter structure (left to runtime fallback): ${noStructure}`);
    console.log(`No mirrored text:   ${noText}`);
    console.log('\nSamples:\n  ' + samples.join('\n  '));
    if (DRY) { console.log('\n[dry] not writing.'); return; }
    await writeFile(OUT_PATH, JSON.stringify(existing));
    const kb = Math.round(Buffer.byteLength(JSON.stringify(existing)) / 1024);
    console.log(`\nWrote ${OUT_PATH} — ${Object.keys(existing).length} books total, ${kb} KB.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
