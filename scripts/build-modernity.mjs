/**
 * Build the bundled Modernity data (src/data/modernity.json) from the
 * generated + verified source in data-src/modernity-src.json.
 *
 * Modernity works are classics retold in modern voice (docs/modernity-plan.md,
 * voice spec in docs/modernity-voice.md). Each beat carries a verbatim text
 * `anchor` (span start) and `endAnchor` (span end); these resolve to token
 * indexes in the SAME id space the reader uses (identical tokenizer + matcher
 * to build-scenes.mjs). The output beat gets `startIndex` plus `words` (span
 * length), so the app can open the Reader at the real scene AND slice the
 * exact original passage for the modern/original toggle. Anchors resolve
 * against the work's PRIMARY edition text in public/books/<primaryId>.txt
 * (run mirror:books first).
 *
 * Also joins each resolved beat against the snippet spans in
 * scripts/deep-starts/snippets.json: a beat landing inside a tagged span gets
 * `snippetTier` so the app can pair the clip with the bounded real-text
 * snippet.
 *
 * Rails: dead anchor = beat dropped + problem logged; stream beats must be in
 * ascending text order (out of order logs a problem, then sorts); a work whose
 * beats all die is dropped. Any problem sets exit code 1.
 *
 *   node scripts/build-modernity.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PATH = path.join(ROOT, 'data-src', 'modernity-src.json');
const SNIPPETS_PATH = path.join(ROOT, 'scripts', 'deep-starts', 'snippets.json');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'modernity.json');
// Long single scenes are legitimate: Collins's proposal runs ~1200 words and
// the Dashwood inheritance negotiation ~1650. Observed merged-scene mistakes
// ran past 2000, so this catches them without punishing a real long scene.
const MAX_SPAN = 1800;

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Tokenize identically to parseText so indices == TextToken.id. */
function tokenize(raw) {
    const marked = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, ' [P] ');
    return marked.trim().split(/\s+/).filter((w) => w !== '[P]');
}

/** Build a reusable matcher over the book's tokens: the same normalized
 *  character-stream technique as build-scenes.mjs, built once per book.
 *  find() returns the token index of the needle's first word (start) and of
 *  its last word (end), or null. */
function makeMatcher(words) {
    let joined = '';
    const charToTok = [];
    const tokToChar = [];
    for (let i = 0; i < words.length; i++) {
        const p = norm(words[i]);
        tokToChar.push(joined.length);
        for (const ch of p) { joined += ch; charToTok.push(i); }
    }
    return {
        /** fromTok: search only at/after this token — endAnchors must resolve
         *  after their beat's start, or a phrase that also occurs earlier in
         *  the book would win. */
        find(anchor, fromTok = 0) {
            const needle = norm(anchor);
            if (!needle) return null;
            const pos = joined.indexOf(needle, tokToChar[fromTok] ?? 0);
            if (pos < 0) return null;
            return { start: charToTok[pos], end: charToTok[pos + needle.length - 1] };
        },
        /** The verbatim source text for a token range, with Gutenberg italic
         *  markers stripped. Used to repair quotes: a generated quote whose
         *  WORDS match the book but whose punctuation or _italics_ differ is
         *  rewritten to what the book actually says, so the quote a reader
         *  sees beside the original is always exact. */
        textAt(start, end) {
            return words.slice(start, end + 1).join(' ').replace(/_/g, '');
        },
    };
}

async function main() {
    const src = JSON.parse(await readFile(SRC_PATH, 'utf8'));
    const snippets = existsSync(SNIPPETS_PATH)
        ? JSON.parse(await readFile(SNIPPETS_PATH, 'utf8'))
        : {};
    const out = {};
    let totalBeats = 0;
    const problems = [];

    for (const [slug, work] of Object.entries(src)) {
        if (slug.startsWith('_')) continue;
        const file = path.join(BOOKS_DIR, `${work.primaryId}.txt`);
        if (!existsSync(file)) { problems.push(`${slug}: no mirrored text for #${work.primaryId} (run mirror:books)`); continue; }
        const words = tokenize(await readFile(file, 'utf8'));
        const matcher = makeMatcher(words);
        const spans = snippets[work.primaryId] || {};
        const resolved = [];
        let prev = -1;
        for (const b of work.beats) {
            let hit = matcher.find(b.anchor);
            if (!hit) { problems.push(`${slug}: anchor not found at "${b.title}": "${b.anchor.slice(0, 50)}…"`); continue; }
            // A phrase quoted in a translator's introduction matches before the
            // real text does, which strands the span across the whole front
            // matter. If the span busts the cap, walk to the anchor's next
            // occurrence and try again.
            if (b.endAnchor) {
                for (let tries = 0; tries < 4; tries++) {
                    const e = matcher.find(b.endAnchor, hit.start);
                    if (e && e.end > hit.start && e.end - hit.start + 1 <= MAX_SPAN) break;
                    const next = matcher.find(b.anchor, hit.start + 1);
                    if (!next || next.start <= hit.start) break;
                    hit = next;
                }
            }
            const startIndex = hit.start;
            if (work.format === 'stream' && startIndex <= prev) {
                problems.push(`${slug}: beat out of order at "${b.title}" (idx ${startIndex} <= ${prev})`);
            }
            prev = startIndex;
            const beat = {
                title: b.title,
                modern: b.modern,
                startIndex,
                spice: b.spice,
                warnings: b.warnings,
                standalone: b.standalone,
            };
            // the original-text span behind the modern/original toggle: the
            // beat covers tokens [startIndex, startIndex + words)
            if (b.endAnchor) {
                const end = matcher.find(b.endAnchor, startIndex);
                if (!end) {
                    problems.push(`${slug}: endAnchor not found at "${b.title}": "${b.endAnchor.slice(0, 50)}…"`);
                } else if (end.end <= startIndex) {
                    problems.push(`${slug}: endAnchor before anchor at "${b.title}" (${end.end} <= ${startIndex})`);
                } else {
                    const span = end.end - startIndex + 1;
                    if (span > MAX_SPAN) problems.push(`${slug}: span too long at "${b.title}" (${span} words)`);
                    else beat.words = span;
                }
            }
            if (b.quote) {
                // search from a little before the beat so a quote sitting just
                // ahead of the anchor still resolves, then fall back to global
                const from = Math.max(0, startIndex - 400);
                const q = matcher.find(b.quote, from) || matcher.find(b.quote);
                if (q) beat.quote = matcher.textAt(q.start, q.end);
                else problems.push(`${slug}: quote not in text at "${b.title}", quote dropped: "${b.quote.slice(0, 60)}…"`);
            }
            if (b.group) beat.group = b.group;
            for (const tier of ['short', 'story']) {
                const s = spans[tier];
                if (s && startIndex >= s.start && startIndex <= s.start + s.words) { beat.snippetTier = tier; break; }
            }
            resolved.push(beat);
        }
        if (!resolved.length) { problems.push(`${slug}: every beat died, work dropped`); continue; }
        if (work.format === 'stream') resolved.sort((a, b) => a.startIndex - b.startIndex);
        out[slug] = {
            ids: work.ids,
            primaryId: work.primaryId,
            title: work.title,
            author: work.author,
            format: work.format,
            register: work.register,
            feelings: work.feelings,
            intensity: work.intensity,
            beats: resolved,
        };
        totalBeats += resolved.length;
        const joined = resolved.filter((b) => b.snippetTier).length;
        const spanned = resolved.filter((b) => b.words).length;
        process.stdout.write(`  ${slug}: ${resolved.length}/${work.beats.length} beats resolved, ${spanned} with original-text spans${joined ? `, ${joined} inside snippet spans` : ''}\n`);
    }

    await writeFile(OUT_PATH, JSON.stringify(out));
    const kb = Math.round(JSON.stringify(out).length / 1024);
    console.log(`\nWrote ${OUT_PATH} — ${Object.keys(out).length} works, ${totalBeats} beats, ${kb} KB.`);
    if (problems.length) {
        console.log(`\n⚠ ${problems.length} problem(s):`);
        for (const p of problems) console.log('  ' + p);
        process.exitCode = 1;
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
