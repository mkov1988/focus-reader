/**
 * Generate scene maps for many books LOCALLY, using a local LLM (Ollama) on your
 * own machine. No cloud, no API key: the script reads each mirrored book, asks
 * the local model for a spoiler-safe label + one-sentence recap per scene, and
 * merges the result into src/data/scenes.json — the same static file the app
 * already bundles and serves. Nothing here runs at app runtime.
 *
 * It covers the books hand-authored scenes don't reach (the vibe-page titles).
 * Hand-authored entries in scenes.json are never overwritten unless you pass
 * --force, so this complements scripts/scenes-src.json rather than replacing it.
 *
 * SETUP (one time, on your machine):
 *   1. Install Ollama:  https://ollama.com   (then it runs at localhost:11434)
 *   2. Pull a model:    ollama pull llama3.1:8b      (or qwen2.5:7b, gemma2:9b)
 *   3. Mirror the books first if you haven't:  npm run mirror:books
 *
 * RUN:
 *   npm run build:scenes:local                 every vibe book not yet mapped
 *   node scripts/segment-books-local.mjs --vibe=cozy
 *   node scripts/segment-books-local.mjs --ids=1400,2641 --force
 *   node scripts/segment-books-local.mjs --no-model        boundaries+titles only, no LLM
 *   node scripts/segment-books-local.mjs --vibe=cozy --dry print, don't write
 *
 * Env: OLLAMA_URL (default http://localhost:11434), OLLAMA_MODEL (default llama3.1:8b).
 *
 * It is resumable: books already in scenes.json are skipped (unless --force), so
 * you can stop and restart a long run. The local model is the bottleneck, so a
 * full catalog run can take a while; that's the cost of keeping it on-device.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const VIBES_PATH = path.join(ROOT, 'src', 'data', 'vibes.json');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'scenes.json');

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const FLAG = (n) => process.argv.includes(`--${n}`);
const VIBE = arg('vibe') || null;
const IDS = (arg('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;
const NO_MODEL = FLAG('no-model');
const DRY = FLAG('dry');
const FORCE = FLAG('force');
const CURATED = FLAG('curated');

const TARGET_SCENES = 14;     // aim for roughly this many scenes per book
const MAX_SCENES = 18;        // above this we sample chapters down
const MIN_GAP = 120;          // tokens; closer headings than this are treated as a TOC cluster
const SAMPLE_WORDS = 900;     // passage size sent to the model per scene

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tokenize identically to parseText so indices == TextToken.id. */
function tokenize(raw) {
    const marked = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, ' [P] ');
    return marked.trim().split(/\s+/).filter((w) => w !== '[P]');
}

const HEAD_RE = /^(chapter|letter|part|book|stave|canto|act|scene|prologue|epilogue)\b/i;

/** Scene boundaries as token indices: real chapter headings where we can find
 *  them (dropping table-of-contents clusters via MIN_GAP), else equal segments. */
function boundaries(raw, words) {
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    let wc = 0;
    const heads = [];
    for (const line of lines) {
        const t = line.trim();
        if (t && t.length <= 64 && HEAD_RE.test(t)) heads.push({ wordIndex: wc, title: t });
        wc += t ? t.split(/\s+/).length : 0;
    }
    // Drop TOC clusters: keep a heading only if far enough from the previous kept one.
    const kept = [];
    for (const h of heads) {
        if (!kept.length || h.wordIndex - kept[kept.length - 1].wordIndex >= MIN_GAP) kept.push(h);
    }
    let scenes;
    if (kept.length >= 2 && kept.length <= MAX_SCENES) {
        scenes = kept;
    } else if (kept.length > MAX_SCENES) {
        const step = kept.length / TARGET_SCENES;
        scenes = Array.from({ length: TARGET_SCENES }, (_, i) => kept[Math.floor(i * step)]);
    } else {
        const n = Math.min(TARGET_SCENES, Math.max(2, Math.round(words.length / 4000)));
        scenes = Array.from({ length: n }, (_, i) => ({ wordIndex: Math.floor((i * words.length) / n), title: '' }));
    }
    // Ensure strictly increasing + unique.
    return scenes.filter((s, i) => i === 0 || s.wordIndex > scenes[i - 1].wordIndex);
}

const cleanTitle = (t) => t.replace(/^(chapter|letter|part|book|stave|canto|act|scene)\b[\s.:]*/i, '').replace(/[_*[\]]/g, '').trim();

async function labelScene(passage, fallbackTitle) {
    // No-model fallback: keep the heading itself (e.g. "Chapter II") as the label
    // and leave the recap empty — the app shows the scrubber label but skips the
    // "previously" card when there's no recap.
    if (NO_MODEL) return { label: (fallbackTitle || '').replace(/[_*[\]]/g, '').trim() || 'A scene', recap: '' };
    const prompt = `You are labelling one scene of a public-domain book for a calm reading app.\nBelow is the opening of one part of the book. Return STRICT JSON:\n{"label": "<2 to 5 word scene title, no spoilers>", "recap": "<ONE calm sentence, max 26 words, describing only what happens in THIS passage so a returning reader remembers where they are. Never mention anything that happens later in the book.>"}\n\nPASSAGE:\n${passage}`;
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, format: 'json', stream: false, options: { temperature: 0.3 }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status} (is it running? is the model pulled?)`);
    const data = await res.json();
    let parsed = {};
    try { parsed = JSON.parse(data.message?.content ?? '{}'); } catch { /* model returned non-JSON */ }
    const label = (parsed.label || cleanTitle(fallbackTitle) || 'A scene').toString().trim().slice(0, 60);
    const recap = (parsed.recap || '').toString().trim().replace(/\s+/g, ' ').slice(0, 220);
    return { label, recap };
}

function targetIds() {
    if (IDS.length) return IDS;
    const ids = new Set();
    if (CURATED) {
        const c = JSON.parse(readFileSync(CURATED_PATH, 'utf8'));
        for (const b of c) if (b.id) ids.add(String(b.id));
    } else {
        const v = JSON.parse(readFileSync(VIBES_PATH, 'utf8'));
        for (const vibe of v) {
            if (VIBE && vibe.key !== VIBE) continue;
            for (const b of [...(vibe.hero ?? []), ...(vibe.shelves ?? []).flatMap((s) => s.books ?? [])]) if (b.id) ids.add(String(b.id));
        }
    }
    return [...ids];
}

async function main() {
    const existing = existsSync(OUT_PATH) ? JSON.parse(await readFile(OUT_PATH, 'utf8')) : {};
    let ids = targetIds().filter((id) => FORCE || !existing[id]);
    if (Number.isFinite(LIMIT)) ids = ids.slice(0, LIMIT);

    console.log(`Segmenting ${ids.length} books ${NO_MODEL ? '(no-model, boundaries only)' : `with ${OLLAMA_MODEL} at ${OLLAMA_URL}`}${DRY ? ' [dry run]' : ''}\n`);
    let done = 0;
    let skipped = 0;
    const failures = [];

    for (const id of ids) {
        const file = path.join(BOOKS_DIR, `${id}.txt`);
        if (!existsSync(file)) { skipped++; console.log(`  #${id}: no mirrored text (run mirror:books) — skip`); continue; }
        const raw = await readFile(file, 'utf8');
        const words = tokenize(raw);
        const bounds = boundaries(raw, words);
        const scenes = [];
        try {
            for (let i = 0; i < bounds.length; i++) {
                const start = bounds[i].wordIndex;
                const end = i + 1 < bounds.length ? bounds[i + 1].wordIndex : words.length;
                const passage = words.slice(start, Math.min(end, start + SAMPLE_WORDS)).join(' ');
                const { label, recap } = await labelScene(passage, bounds[i].title);
                scenes.push({ startIndex: start, label, recap });
            }
        } catch (e) {
            failures.push(`#${id}: ${e.message}`);
            console.log(`  #${id}: FAILED — ${e.message}`);
            if (!NO_MODEL) { console.log('\nStopping: fix Ollama and re-run (it resumes).'); break; }
            continue;
        }
        existing[id] = scenes;
        done++;
        console.log(`  #${id}: ${scenes.length} scenes` + (scenes[0] ? `  e.g. "${scenes[1]?.label ?? scenes[0].label}"` : ''));
        if (!DRY && done % 5 === 0) await writeFile(OUT_PATH, JSON.stringify(existing)); // checkpoint
    }

    if (!DRY) await writeFile(OUT_PATH, JSON.stringify(existing));
    console.log(`\n${DRY ? '[dry] would write' : 'Wrote'} ${OUT_PATH}: ${done} books added, ${skipped} skipped.`);
    if (failures.length) console.log(`Failures:\n  ${failures.join('\n  ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
