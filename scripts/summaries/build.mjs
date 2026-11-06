/**
 * Key-idea summaries pipeline, step 3: the rendered reading texts, the served
 * manifest, and the app's bundled copy.
 *
 * Reads every card file verify.mjs left in <cards>/<id>.json, renders each
 * shipped title with lib.mjs's renderText, runs the narration leftover gate
 * (gateScan) over the rendered text, writes <text-dir>/<id>.txt, and writes
 * the manifest twice with identical bytes: <manifest> (served at
 * /summaries-v1.json with a short cache: the kill switch) and <native> (what
 * export:native bundles into the Android app).
 *
 *   node scripts/summaries/build.mjs
 *   node scripts/summaries/build.mjs --hide=800003,800004      (pull titles from the shelf, then build)
 *   node scripts/summaries/build.mjs --unhide=800003           (put a title back, then build)
 *   node scripts/summaries/build.mjs --cards=… --text-dir=… --manifest=… --native=… --hidden=… --source=…   (tests)
 *
 * Which titles ship: a card file with status ok or needs-check. A rejected
 * file is skipped with a note. A file whose id is not in the source list,
 * whose status is anything else, or that does not parse is an error: nothing
 * is written and the exit code is 1. The hidden list (<hidden>, a JSON array
 * of ids; --hide/--unhide edit it, sorted and deduplicated, creating it when
 * missing) keeps a title in the manifest with hidden: true, so an installed
 * app can drop it, but gives it no text file and zero words.
 *
 * Gate: a rendered text with any gateScan hit gets no text file and no
 * manifest entry; the hits are printed, the build goes on, and the exit code
 * is 1 at the end. Narrated words stay one-to-one with reader tokens, so the
 * text is never edited to pass (same rule as scripts/narration/plan.mjs).
 *
 * Word counts come from the REAL reader tokenizer (scripts/lib/load-ts.mjs),
 * never a replica. Text files are LF only, every line trimmed, paragraphs
 * separated by exactly one blank line (whitespace only: the words are never
 * touched). Every file is written atomically (<file>.tmp, then rename).
 * Stale text files, any <text-dir>/<id>.txt not written this build (hidden,
 * rejected, gate-failed, or its card file is gone), are deleted and each
 * deletion printed. A --text-dir that resolves to the mirrored books
 * directory is refused outright, so a slipped path cannot wipe the books.
 *
 * Narration anchors every voiced word to a token index of the exact bytes it
 * planned from (scripts/narration/work/<id>/plan.json sourceSha256), so a
 * rebuilt text silently desyncs any narration made from it. The manifest
 * carries sha256 of each served text (the same utf8 string plan.mjs hashes;
 * null when hidden) so a manifest sha256 that differs from plan.sourceSha256
 * means re-plan before shipping; and when a build changes a text that was
 * already there, it says so and names the re-plan command.
 *
 * Manifest (v 1): { v, generatedAt, titles: [ { id, slug, title, fullTitle,
 * author, textUrl, words, sha256, cards, status, checked, hidden, rights,
 * faith, buyUrl, rank } ] }, sorted by rank ascending, null ranks last, ties
 * by id.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadTextProcessing } from '../lib/load-ts.mjs';
import { resolvePaths, arg, loadSource, renderText, gateScan, slugify, shortTitle, readJson, ID_BASE, PATHS } from './lib.mjs';

const SHIPPED_STATUSES = new Set(['ok', 'needs-check']);

// lib.mjs has no atomic writer (verify.mjs keeps its own as well): write next
// to the target, then rename, so a reader never sees a half-written file.
function writeAtomic(file, text) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

/** --hide=/--unhide= value: integers above ID_BASE, deduplicated; anything else is an error. */
function idList(name) {
    const raw = (arg(name, '') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ids = raw.map(Number);
    const bad = raw.filter((s, i) => !Number.isInteger(ids[i]) || ids[i] <= ID_BASE);
    if (bad.length) fail(`--${name}: not a summaries id (an integer above ${ID_BASE}): ${bad.join(', ')}`);
    return [...new Set(ids)];
}

const sortIds = (ids) => [...new Set(ids)].sort((a, b) => a - b);

const paths = resolvePaths(process.argv);
// The stale sweep deletes every <id>.txt it does not own, so the one
// directory full of numeric .txt files this repo serves is off limits.
for (const booksDir of new Set([PATHS.booksDir, paths.booksDir])) {
    if (path.resolve(paths.textDir) === path.resolve(booksDir)) fail(`--text-dir=${paths.textDir} is the mirrored books directory: refusing to build summaries there`);
}

let src;
try {
    src = loadSource(paths.source);
} catch (err) {
    fail(err.message);
}

// ── The hidden list: edited first when asked, then read by the build. ────────
let hidden;
try {
    hidden = readJson(paths.hidden, []);
} catch (err) {
    fail(`${paths.hidden}: unreadable (${err.message})`);
}
if (!Array.isArray(hidden) || hidden.some((id) => !Number.isInteger(id))) fail(`${paths.hidden}: expected a JSON array of integer ids`);
hidden = sortIds(hidden);

const hide = idList('hide');
const unhide = idList('unhide');
if (hide.length || unhide.length) {
    const unknown = [...hide, ...unhide].filter((id) => !src.byId.has(id));
    if (unknown.length) fail(`--hide/--unhide: not in ${paths.source}: ${unknown.join(', ')}`);
    const both = hide.filter((id) => unhide.includes(id));
    if (both.length) fail(`--hide and --unhide name the same id(s): ${both.join(', ')}`);
    const before = hidden;
    hidden = sortIds([...hidden.filter((id) => !unhide.includes(id)), ...hide]);
    for (const id of hide) console.log(`${id}: ${before.includes(id) ? 'already hidden' : 'hidden'}`);
    for (const id of unhide) console.log(`${id}: ${before.includes(id) ? 'unhidden' : 'was not hidden'}`);
    writeAtomic(paths.hidden, JSON.stringify(hidden, null, 2) + '\n');
    console.log(`hidden list ${paths.hidden}: [${hidden.join(', ')}]`);
}
const hiddenSet = new Set(hidden);

// ── Card files: which titles ship. Errors here stop the build before any
// output is written, so a wrong --cards= path cannot empty the shelf. ────────
if (!existsSync(paths.cards)) fail(`${paths.cards}: card directory not found (run summaries:verify first, or pass --cards=)`);
const shipped = [];
let rejected = 0;
for (const name of readdirSync(paths.cards).filter((f) => f.endsWith('.json')).sort()) {
    const file = path.join(paths.cards, name);
    const id = Number(name.slice(0, -'.json'.length));
    if (!Number.isInteger(id)) fail(`${file}: card files are named <id>.json`);
    const entry = src.byId.get(id);
    if (!entry) fail(`${file}: id ${id} is not in ${paths.source}`);
    let card;
    try {
        card = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
        fail(`${file}: unreadable (${err.message})`);
    }
    if (card === null || typeof card !== 'object' || Array.isArray(card)) fail(`${file}: expected a JSON object`);
    if (card.id !== undefined && card.id !== id) fail(`${file}: named ${id} but carries id ${card.id}`);
    if (card.status === 'rejected') {
        console.log(`${id}: rejected — skipped${card.reason ? ` (${card.reason})` : ''}`);
        rejected++;
        continue;
    }
    if (!SHIPPED_STATUSES.has(card.status)) fail(`${file}: status ${JSON.stringify(card.status ?? null)} is not ok, needs-check or rejected`);
    if (typeof card.about !== 'string' || !Array.isArray(card.cards)) fail(`${file}: expected about (string) and cards (array)`);
    // renderText trims title, idea and why on every card: a slipped hand edit
    // (the checklist has the operator editing these files) is named here, not
    // as a TypeError mid-build after some texts are already written.
    const badCard = card.cards.findIndex((c) => !c || typeof c !== 'object' || typeof c.title !== 'string' || typeof c.idea !== 'string' || typeof c.why !== 'string');
    if (badCard !== -1) fail(`${file}: card ${badCard + 1} needs string title, idea and why`);
    shipped.push({ entry, card });
}
const orphanHidden = hidden.filter((id) => !shipped.some((s) => s.entry.id === id));
if (orphanHidden.length) console.log(`hidden with no shipped card file (kept in the list): ${orphanHidden.join(', ')}`);

// ── Render, gate, write texts. ──────────────────────────────────────────────
mkdirSync(paths.textDir, { recursive: true });
let tp = null;          // the real reader tokenizer, loaded on first use (transpiles src/utils/*.ts)
const titles = [];
const written = new Set();
const gateFailed = [];
for (const { entry, card } of shipped) {
    const id = entry.id;
    const isHidden = hiddenSet.has(id);
    let words = 0;
    let sha256 = null;
    if (!isHidden) {
        // LF only, no trailing or leading blanks on a line, one blank line
        // between paragraphs: byte noise inside a card field must not reach
        // the served file (or move its sha256). Words are untouched.
        const text = renderText(entry, card).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n');
        const hits = gateScan(text);
        if (hits.length) {
            gateFailed.push(id);
            console.error(`${id}: GATE — ${hits.length} leftover hit(s); no text file, not in the manifest:`);
            for (const h of hits) console.error(`  ${h.pattern}: …${h.context}…`);
            continue;
        }
        tp ??= loadTextProcessing();
        words = tp.parseText(text).tokens.length;
        sha256 = createHash('sha256').update(text).digest('hex');
        const file = path.join(paths.textDir, `${id}.txt`);
        if (existsSync(file) && readFileSync(file, 'utf8') !== text) {
            console.log(`${id}: text changed since the last build (any narration planned from it is stale: re-run scripts/narration/plan.mjs --ids=${id} --text-dir=${paths.textDir})`);
        }
        writeAtomic(file, text);
        written.add(id);
    }
    titles.push({
        id,
        slug: slugify(shortTitle(entry.title)),
        title: shortTitle(entry.title),
        fullTitle: entry.title,
        author: entry.author,
        textUrl: isHidden ? null : `/summaries/${id}.txt`,
        words,
        sha256,
        cards: card.cards.length,
        status: card.status,
        checked: card.checked === true,
        hidden: isHidden,
        rights: entry.rights ?? null,
        faith: entry.faith === true,
        buyUrl: entry.amazon_url ?? null,
        rank: entry.rank ?? null,
    });
}

// Stale texts: any <id>.txt that was not written this build (hidden,
// rejected, gate-failed, or its card file is gone). Matched and unlinked by
// the directory entry's own name, so a name that does not round-trip through
// Number() (a zero-padded 0800003.txt) is still removed, under its own name.
const txtId = (f) => Number(f.slice(0, -'.txt'.length));
const writtenNames = new Set([...written].map((id) => `${id}.txt`));
const stale = readdirSync(paths.textDir)
    .filter((f) => /^\d+\.txt$/.test(f) && !writtenNames.has(f))
    .sort((a, b) => txtId(a) - txtId(b) || a.localeCompare(b));
for (const f of stale) {
    const file = path.join(paths.textDir, f);
    const id = txtId(f);
    unlinkSync(file);
    console.log(`${id}: deleted ${file}${hiddenSet.has(id) ? ' (hidden)' : ' (stale)'}`);
}

// ── Manifest: rank order, null ranks last, ties by id. Both copies identical. ─
titles.sort((a, b) => {
    if (a.rank === null || b.rank === null) return (a.rank === null) - (b.rank === null) || a.id - b.id;
    return a.rank - b.rank || a.id - b.id;
});
const slugOwners = new Map();
for (const t of titles) slugOwners.set(t.slug, [...(slugOwners.get(t.slug) ?? []), t.id]);
for (const [slug, ids] of slugOwners) if (ids.length > 1) console.log(`warning: slug "${slug}" is shared by ${ids.join(', ')}`);

const json = JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), titles }, null, 2) + '\n';
writeAtomic(paths.manifest, json);
writeAtomic(paths.native, json);

// ── Report. ─────────────────────────────────────────────────────────────────
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const row = (id, title, words, cards, status, hiddenMark) => [
    String(id).padEnd(7), cut(title, 40).padEnd(40), String(words).padStart(6), String(cards).padStart(6), String(status).padEnd(12), hiddenMark,
].join(' ');
console.log(row('id', 'title', 'words', 'cards', 'status', 'hidden'));
for (const t of titles) console.log(row(t.id, t.title, t.words, t.cards, t.status, t.hidden ? 'yes' : 'no'));
const hiddenCount = titles.filter((t) => t.hidden).length;
console.log(`${titles.length} title(s) in the manifest: ${titles.length - hiddenCount} with text, ${hiddenCount} hidden; `
    + `${rejected} rejected skipped, ${gateFailed.length} gate failure(s), ${stale.length} text file(s) deleted`);
console.log(`wrote ${paths.manifest} and ${paths.native} (identical), texts under ${paths.textDir}`);
if (gateFailed.length) console.error(`gate failed for ${gateFailed.join(', ')}: fix the card file(s) and rebuild`);
process.exit(gateFailed.length ? 1 : 0);
