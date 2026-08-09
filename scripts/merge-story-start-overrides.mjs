/**
 * Fold the agent verification verdicts (scripts/.verify-results.json) into
 * data-src/story-starts-overrides.json.
 *
 * Each verdict is { id, verdict: 'ok'|'fix', anchor, narrative }, where `anchor`
 * is a verbatim phrase copied from the true first sentence of the work. We
 * resolve that anchor to a token index (same resolver the build uses) and record
 * an override ONLY when it lands materially away from what the detector already
 * chose — so the override file stays small and every entry is a real correction.
 *
 *   node scripts/merge-story-start-overrides.mjs            # merge + report
 *   node scripts/merge-story-start-overrides.mjs --dry      # report only
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, resolveAnchor } from './build-story-starts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const RESULTS_PATH = path.join(ROOT, 'scripts', '.verify-results.json');
const REPORT_PATH = path.join(ROOT, 'scripts', '.story-starts-report.json');
const OVERRIDES_PATH = path.join(ROOT, 'data-src', 'story-starts-overrides.json');

const DRY = process.argv.includes('--dry');
// How far the agent's start must sit from the detector's before we override.
const MIN_SHIFT = 20;

/** Decode the few HTML entities an agent may copy verbatim from a mirrored file,
 *  so the anchor's normalized form matches the text (& is stripped either way, but
 *  "&amp;" must not leave a phantom "amp"). */
function decodeEntities(s) {
    return s
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&mdash;/gi, '—')
        .replace(/&nbsp;/gi, ' ');
}

async function main() {
    const results = JSON.parse(await readFile(RESULTS_PATH, 'utf8'));
    const books = Array.isArray(results) ? results : (results.books || []);
    const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
    const detStart = Object.fromEntries(report.map((r) => [r.id, r.start]));
    const detTotal = Object.fromEntries(report.map((r) => [r.id, r.total]));

    const overrides = existsSync(OVERRIDES_PATH) ? JSON.parse(await readFile(OVERRIDES_PATH, 'utf8')) : {};

    const stats = { seen: 0, ok: 0, added: 0, unchanged: 0, unresolved: 0, suspicious: 0, nonNarrative: 0 };
    const suspicious = [];
    const unresolved = [];

    for (const b of books) {
        stats.seen++;
        const id = String(b.id);
        if (b.narrative === false) stats.nonNarrative++;
        const anchor = decodeEntities((b.anchor || '').trim());
        if (!anchor || anchor.split(/\s+/).length < 4) { stats.unresolved++; unresolved.push(`#${id}: empty/short anchor`); continue; }

        const file = path.join(BOOKS_DIR, `${id}.txt`);
        if (!existsSync(file)) { stats.unresolved++; unresolved.push(`#${id}: no text`); continue; }
        const tokens = tokenize(await readFile(file, 'utf8'));
        const idx = resolveAnchor(tokens, anchor);
        if (idx < 0) { stats.unresolved++; unresolved.push(`#${id}: anchor not found: "${anchor.slice(0, 44)}…"`); continue; }

        const total = detTotal[id] ?? tokens.length;
        // A story start past ~45% of the book is almost always a bad anchor.
        if (idx > total * 0.45) { stats.suspicious++; suspicious.push(`#${id}: resolves at ${(idx / total * 100).toFixed(0)}% — "${anchor.slice(0, 44)}…"`); continue; }

        const det = detStart[id] ?? 0;
        if (Math.abs(idx - det) <= MIN_SHIFT) { stats.unchanged++; continue; }

        overrides[id] = { anchor, note: `agent ${b.verdict}: was @${det}, now @${idx}` };
        stats.added++;
    }

    if (!DRY) {
        // Keep any leading _comment key stable at the top.
        await writeFile(OVERRIDES_PATH, JSON.stringify(overrides, null, 1));
    }

    console.log(`Merged ${stats.seen} verdicts:`);
    console.log(`  overrides added/updated: ${stats.added}`);
    console.log(`  already correct (≤${MIN_SHIFT} tok): ${stats.unchanged}`);
    console.log(`  non-narrative flagged:   ${stats.nonNarrative}`);
    console.log(`  unresolved anchors:      ${stats.unresolved}`);
    console.log(`  suspicious (>45% deep):  ${stats.suspicious}`);
    if (suspicious.length) { console.log('\nSuspicious (skipped, review):'); for (const s of suspicious.slice(0, 40)) console.log('  ' + s); }
    if (unresolved.length) { console.log('\nUnresolved (kept detector):'); for (const s of unresolved.slice(0, 40)) console.log('  ' + s); }
    console.log(`\n${DRY ? '(dry run — no file written)' : `Wrote ${path.relative(ROOT, OVERRIDES_PATH)} (${Object.keys(overrides).length} overrides). Run: npm run build:starts`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
