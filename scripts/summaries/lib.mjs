/**
 * Shared contract for the key-idea summaries pipeline (scripts/README.md §7):
 * paths, limits, the generation schema and prompt, the mechanical gates, the
 * text renderer, and the deterministic mock used by the contract test.
 *
 * The pipeline: generate.mjs (model runs) → verify.mjs (gates + consensus →
 * data-src/summaries/<id>.json) → build.mjs (rendered texts + manifest →
 * public/summaries/, public/summaries-v1.json, src/data/summaries.json).
 *
 * Legal shape (the whole point of the limits below; see the plan in the
 * session that built this and LEGAL.md): short, own-words, idea-ordered cards
 * that cannot substitute for the book; never a quotation; title and author
 * named descriptively only; a buy link in the manifest, never in the text
 * (URLs trip the narration gate and are not for the reading view).
 *
 * Ids: every title carries a stable numeric id (800001 upward) assigned once
 * in data-src/summaries-src.json. Numeric so the narration pipeline
 * (scripts/narration/*) handles a summary exactly like a book:
 *   node scripts/narration/plan.mjs --ids=800003 --text-dir=public/summaries
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PATHS = {
    source: path.join(ROOT, 'data-src', 'summaries-src.json'),      // the title list (committed)
    cards: path.join(ROOT, 'data-src', 'summaries'),                 // verified cards, one <id>.json each (committed)
    hidden: path.join(ROOT, 'data-src', 'summaries-hidden.json'),    // kill switch: ids pulled from the shelf (committed)
    work: path.join(ROOT, 'scripts', 'summaries', 'work'),           // raw model runs, sources, batch ledgers (gitignored)
    textDir: path.join(ROOT, 'public', 'summaries'),                 // rendered <id>.txt, served at /summaries/<id>.txt (gitignored build output)
    manifest: path.join(ROOT, 'public', 'summaries-v1.json'),        // served manifest, the app's shelf (committed)
    native: path.join(ROOT, 'src', 'data', 'summaries.json'),        // export:native copies this into the Android app (committed)
    checklist: path.join(ROOT, 'SUMMARIES-CHECKLIST.md'),            // the hard-copy spot-check ledger (committed)
    booksDir: path.join(ROOT, 'public', 'books'),                    // mirrored public-domain texts, if present
};
export const SERVING_ORIGIN = 'https://focus-reader-48z.pages.dev';
export const MODEL = 'claude-opus-5-5';
export const PRICE_PER_MTOK = { 'claude-opus-5-5': { input: 4, output: 20 } };
export const RUNS = ['a', 'b'];
export const ID_BASE = 800000;
export const LIMITS = {
    minCards: 8, maxCards: 12,
    minIdeaWords: 40, maxIdeaWords: 80,
    maxTitleWords: 8, maxWhyWords: 30,
    maxTotalWords: 1000,            // idea + why + title words over the whole set, not counting the frame
    ngram: 8,                       // a run of this many words shared with the source text is a copy
};

// Same patterns as scripts/narration/plan.mjs's leftover gate: a rendered
// summary must pass narration planning unchanged.
export const GATE_PATTERNS = [
    { name: 'gutenberg', re: /gutenberg/i },
    { name: 'url', re: /https?:\/\//i },
    { name: 'www', re: /\bwww\./i },
    { name: 'etext', re: /\be-?text\b/i },
];
export const QUOTE_RE = /["“”«»]|‘[^’]{12,}’/;                       // double quotes of any kind; curly-single pairs around a phrase
export const STRUCTURE_RE = /^\s*(chapter|part|section|lesson|step|law|habit|rule|principle|day|week)\s+\d+\b/i;

/** --name=value from argv (same shape as plan.mjs). */
export function arg(name, fallback = null, argv = process.argv) {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}
export const flag = (name, argv = process.argv) => argv.includes(`--${name}`);

/** Every path the scripts touch, each overridable (--work=, --cards=, --text-dir=, …) so tests run in a temp dir. */
export function resolvePaths(argv = process.argv) {
    return {
        source: arg('source', PATHS.source, argv),
        cards: arg('cards', PATHS.cards, argv),
        hidden: arg('hidden', PATHS.hidden, argv),
        work: arg('work', PATHS.work, argv),
        textDir: arg('text-dir', PATHS.textDir, argv),
        manifest: arg('manifest', PATHS.manifest, argv),
        native: arg('native', PATHS.native, argv),
        checklist: arg('checklist', PATHS.checklist, argv),
        booksDir: arg('books-dir', PATHS.booksDir, argv),
    };
}

export function loadSource(file = PATHS.source) {
    const src = JSON.parse(readFileSync(file, 'utf8'));
    const all = [...src.titles, ...(src.next_up ?? [])];
    const ids = all.map((e) => e.id);
    if (ids.some((id) => !Number.isInteger(id) || id <= ID_BASE)) throw new Error(`${file}: every entry needs an integer id above ${ID_BASE}`);
    if (new Set(ids).size !== ids.length) throw new Error(`${file}: duplicate ids`);
    return { ...src, all, byId: new Map(all.map((e) => [e.id, e])) };
}

/**
 * Which titles a run covers: --ids=800003,800006 | --pilot=N (the first N of
 * src.titles by file order, which is rank order) | --all (src.titles, never
 * next_up unless named by id). Returns entries in file order.
 */
export function selectEntries(src, argv = process.argv) {
    const ids = (arg('ids', '', argv) || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    if (ids.length) {
        const missing = ids.filter((id) => !src.byId.has(id));
        if (missing.length) throw new Error(`unknown id(s): ${missing.join(', ')}`);
        return src.all.filter((e) => ids.includes(e.id));
    }
    const pilot = Number(arg('pilot', 0, argv));
    if (pilot > 0) return src.titles.slice(0, pilot);
    if (flag('all', argv)) return src.titles;
    throw new Error('Pass --ids=800003,800006 | --pilot=5 | --all');
}

export const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
/** The display title: the edition noise after a colon or dash stays in the source file, not on the shelf. */
export const shortTitle = (title) => title.split(/[:(\[]|―| - /)[0].replace(/[®™]/g, '').trim();

export const wordCount = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
export const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);

/** The structured output the model returns for one run. Kept to plain strings and arrays on purpose. */
export const CARD_SCHEMA = {
    type: 'object',
    properties: {
        about: { type: 'string', description: 'One neutral sentence: what the book is about and who it is for, naming title and author once.' },
        cards: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: `At most ${LIMITS.maxTitleWords} words, your own phrasing.` },
                    idea: { type: 'string', description: `${LIMITS.minIdeaWords} to ${LIMITS.maxIdeaWords} words of plain prose in your own words.` },
                    why: { type: 'string', description: `One sentence, at most ${LIMITS.maxWhyWords} words: why it matters to the reader.` },
                    claims: { type: 'array', items: { type: 'string' }, description: 'Every specific person, study, number or anecdote this card mentions. Empty if none.' },
                },
                required: ['title', 'idea', 'why', 'claims'],
                additionalProperties: false,
            },
        },
    },
    required: ['about', 'cards'],
    additionalProperties: false,
};

export function buildPrompt(entry, { sourceText = null } = {}) {
    const L = LIMITS;
    const system = [
        'You write the Key Ideas cards for Focus Reader, a reading app. A card set is an independent retelling of a nonfiction book\'s most useful ideas, in our own words, for a reader who has not read the book.',
        '',
        'Rules, all mandatory:',
        `1. Pick the ${L.minCards} to ${L.maxCards} ideas a reader most needs. Order them by importance to the reader, never by the book's chapter order, and never walk the book's own structure: no titles like Law 1, Habit 3 or Chapter 5, and do not reproduce the book's numbered lists in order.`,
        '2. Write everything in your own words. Never quote the book or the author, not even a phrase, and do not reuse the author\'s distinctive sentences or slogans. Do not use quotation marks anywhere.',
        `3. Each card has a title of at most ${L.maxTitleWords} words in your own phrasing; an idea of ${L.minIdeaWords} to ${L.maxIdeaWords} words that explains it plainly; and a why of one sentence, at most ${L.maxWhyWords} words, saying why it matters to the reader's life in a way the book does not phrase.`,
        '4. Accuracy over color. Mention a person, study, number or anecdote only if you are certain it is in the book; otherwise leave it out. Never invent examples. List every specific name, number, study or anecdote a card mentions in that card\'s claims array, and leave it empty when the card mentions none.',
        '5. No web addresses, no email addresses, and no mention of Project Gutenberg or e-texts.',
        '6. The about field is one neutral sentence on what the book is about and who it is for, naming the title and author once.',
        '7. Plain prose only: no bullet lists, no headings, no markdown.',
    ].join('\n');
    const user = [
        `Book: ${entry.title}`,
        `Author: ${entry.author}`,
        '',
        sourceText
            ? `The full text of this public-domain book follows. Base the cards on it, still entirely in your own words.\n\n<book>\n${sourceText}\n</book>`
            : 'Write the cards from your knowledge of this book.',
        '',
        'Return JSON matching the schema.',
    ].join('\n');
    return { system, user };
}

/** Mechanical violations for one card: [] when clean. Each entry is { rule, detail }. */
export function checkCard(card) {
    const v = [];
    const text = `${card.title} ${card.idea} ${card.why}`;
    if (wordCount(card.title) > LIMITS.maxTitleWords) v.push({ rule: 'title-length', detail: `${wordCount(card.title)} words` });
    const iw = wordCount(card.idea);
    if (iw < LIMITS.minIdeaWords || iw > LIMITS.maxIdeaWords) v.push({ rule: 'idea-length', detail: `${iw} words` });
    if (wordCount(card.why) > LIMITS.maxWhyWords) v.push({ rule: 'why-length', detail: `${wordCount(card.why)} words` });
    if (QUOTE_RE.test(text)) v.push({ rule: 'quotation', detail: 'quotation marks' });
    if (STRUCTURE_RE.test(card.title)) v.push({ rule: 'structure', detail: `title walks the book's structure: ${card.title}` });
    for (const { name, re } of GATE_PATTERNS) if (re.test(text)) v.push({ rule: `gate-${name}`, detail: name });
    if (/^\s*[-*•]|\n\s*[-*•#]/.test(card.idea)) v.push({ rule: 'markup', detail: 'list or heading markup' });
    if (!Array.isArray(card.claims)) v.push({ rule: 'claims', detail: 'claims missing' });
    return v;
}

/** Set-level violations: count, total words, duplicate titles, and the about line. */
export function checkSet(output) {
    const v = [];
    const cards = output?.cards ?? [];
    if (cards.length < LIMITS.minCards || cards.length > LIMITS.maxCards) v.push({ rule: 'card-count', detail: `${cards.length} cards` });
    const total = cards.reduce((n, c) => n + wordCount(c.title) + wordCount(c.idea) + wordCount(c.why), 0);
    if (total > LIMITS.maxTotalWords) v.push({ rule: 'total-words', detail: `${total} words` });
    const titles = cards.map((c) => c.title.trim().toLowerCase());
    if (new Set(titles).size !== titles.length) v.push({ rule: 'duplicate-title', detail: 'two cards share a title' });
    if (!output?.about || wordCount(output.about) > 60) v.push({ rule: 'about', detail: 'missing or over 60 words' });
    if (output?.about && QUOTE_RE.test(output.about)) v.push({ rule: 'quotation', detail: 'quotation marks in about' });
    for (const { name, re } of GATE_PATTERNS) if (output?.about && re.test(output.about)) v.push({ rule: `gate-${name}`, detail: 'in about' });
    return v;
}

/** Every n-gram of `text` (lowercased content words) that also occurs in `source`; [] when none. */
export function sharedNgrams(text, source, n = LIMITS.ngram) {
    const grams = (s) => { const w = words(s); const out = []; for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' ')); return out; };
    const have = new Set(grams(source));
    return [...new Set(grams(text).filter((g) => have.has(g)))];
}

/** The gate the rendered text must pass before it is written or narrated: hits are { pattern, context }. */
export function gateScan(text) {
    const hits = [];
    for (const { name, re } of GATE_PATTERNS) {
        const m = re.exec(text);
        if (m) hits.push({ pattern: name, context: text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') });
    }
    return hits;
}

/**
 * The reading-view text for one title. Blank-line paragraphs so the reader
 * and narration planner see natural units; numbered headings so chapter
 * detection gives the reader navigation. No URLs by construction.
 */
export function renderText(entry, verified) {
    const title = shortTitle(entry.title);
    const lines = [
        `Key Ideas from ${title}`,
        '',
        `Key ideas from ${title} by ${entry.author}, retold in Focus Reader's own words. This is a short, independent guide to the book's main ideas. It is not the book, and it is not affiliated with the author or publisher. ${verified.about}`.replace(/\s+/g, ' ').trim(),
    ];
    verified.cards.forEach((c, i) => {
        lines.push('', `${i + 1}. ${c.title.trim()}`, '', c.idea.trim(), '', `Why it matters: ${c.why.trim()}`);
    });
    lines.push('', `If these ideas speak to you, the full book by ${entry.author} goes much deeper than any summary can.`);
    return lines.join('\n') + '\n';
}

// ── Mock runs: deterministic, gate-clean, with one planned difference between
// runs so verify's consensus and claims checks have something to find. ──────
const MOCK_TITLES = [
    'Start smaller than feels useful', 'Systems carry you past motivation', 'Identity comes before outcomes',
    'Make the right move obvious', 'Friction decides more than willpower', 'Reward the behavior you want kept',
    'Environment outvotes intention', 'Track the streak, not the result', 'Recover fast after a missed day',
    'Patience is the real skill', 'Boredom is the final boss',
];
function mockIdea(title) {
    return `${title}. The idea here is simple and practical: most people wait for a surge of energy before they act, while the people who actually change their lives arrange their days so that the next good action is the easy one. Small, repeatable moves add up because they survive bad weeks, and a plan that survives bad weeks is the only kind that lasts.`;
}
export function mockOutput(entry, run) {
    const idx = run === 'a' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 10];
    const cards = idx.map((i) => ({
        title: MOCK_TITLES[i],
        idea: mockIdea(MOCK_TITLES[i]),
        why: 'It turns a vague wish into something you can actually do tomorrow morning.',
        claims: i === 2 && run === 'b' ? ['Dave Brailsford'] : [],
    }));
    return { about: `${shortTitle(entry.title)} by ${entry.author} is a practical guide for readers who want lasting change through small daily actions.`, cards };
}

export const readJson = (file, fallback = null) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
