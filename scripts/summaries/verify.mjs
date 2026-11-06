/**
 * Key-idea summaries pipeline, step 2: mechanical gates, cross-run consensus,
 * the verified card file, and the hard-copy checklist.
 *
 * Reads the raw runs generate.mjs left in work/<id>/run-<label>.json (one per
 * label in RUNS), gates each with lib.mjs's checkCard/checkSet, matches the
 * surviving runs' cards against each other by word overlap (deterministic, no
 * model call), cross-checks every claim between the runs and, for public-
 * domain titles, against work/<id>/source.txt, and writes the card file
 * data-src/summaries/<id>.json that build.mjs renders. Then it regenerates
 * SUMMARIES-CHECKLIST.md from every card file.
 *
 *   node scripts/summaries/verify.mjs --ids=800003,800006
 *   node scripts/summaries/verify.mjs --pilot=5
 *   node scripts/summaries/verify.mjs --all [--force]
 *   node scripts/summaries/verify.mjs --ids=800003 --work=… --cards=… --checklist=… --source=…   (tests)
 *
 * Per title: a run fails on any set-level violation or on more than two
 * violating cards; otherwise its violating cards are dropped and the rest
 * kept. No surviving run → rejected. One → every card is a single-run card.
 * Two → cards are paired greedily by Jaccard similarity of their content
 * words (≥ 0.2), leaving out stopwords and any word that more than half of a
 * run's cards use (the book's own vocabulary says nothing about which card is
 * which, and would pair cards that merely share it); a pair keeps run a's
 * wording with consensus: true, the rest are single-run. A claim is
 * confirmed only when the other run mentions it
 * too. A card sharing LIMITS.ngram consecutive words with the source text is
 * dropped as copied. Consensus cards come first, then singletons, capped at
 * LIMITS.maxCards and rechecked with checkSet.
 *
 * Status: ok (no card carries a flag), needs-check (some card does), rejected
 * (nothing survived, or fewer than LIMITS.minCards remain). A card file with
 * "checked": true, a human's mark that it was read against the hard copy, is
 * left alone unless --force. So is a card file whose title has no run files
 * at all (work/ is gitignored scratch, so a fresh clone has none; verifying
 * must never rewrite committed cards as rejected). A run file that is merely
 * missing while its sibling exists is a failed run. Exit 1
 * when any selected title is rejected.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import {
    RUNS, LIMITS, MODEL, resolvePaths, loadSource, selectEntries, flag,
    checkCard, checkSet, sharedNgrams, words, shortTitle, readJson,
} from './lib.mjs';

// Two cards from different runs describe the same idea when the Jaccard
// similarity of their content words (title + idea, stopwords removed) reaches
// this. Deterministic on purpose: verification never calls the model.
const MATCH_THRESHOLD = 0.2;
// A run with more violating cards than this is thrown out whole rather than
// patched: that many misses means the run did not follow the brief.
const MAX_VIOLATING_CARDS = 2;
// Function words that carry no idea; every other word counts toward a match.
const STOPWORDS = new Set((
    'a an the and or but nor so yet if then than that this these those it its is are was were be been being am do does did done '
    + 'have has had having of to in on at by for from with without as into onto over under about after before between through '
    + 'during up down out off not no can could will would shall should may might must we you he she they them their our your his '
    + 'her my me i us him who whom whose which what when where why how all any each every some such only own same more most other '
    + 'another one also just there here very too'
).split(' '));

function writeAtomic(file, text) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
}

/** Why `output` cannot even be gated (lib's checks assume the schema's shape); null when it can. */
function shapeViolation(output) {
    if (typeof output !== 'object' || Array.isArray(output)) return { rule: 'shape', detail: 'output is not an object' };
    if (typeof output.about !== 'string') return { rule: 'shape', detail: 'about is not a string' };
    if (!Array.isArray(output.cards)) return { rule: 'shape', detail: 'cards is not an array' };
    const bad = output.cards.findIndex((c) => !c || typeof c !== 'object' || ['title', 'idea', 'why'].some((k) => typeof c[k] !== 'string'));
    if (bad >= 0) return { rule: 'shape', detail: `card ${bad + 1} lacks a string title, idea or why` };
    return null;
}

const normalizeCard = (c) => ({
    title: c.title.trim(),
    idea: c.idea.trim(),
    why: c.why.trim(),
    claims: (Array.isArray(c.claims) ? c.claims : []).map((x) => String(x).trim()).filter(Boolean),
});

// Claims are matched as case-insensitive substrings over whitespace-squashed
// text: source.txt keeps Gutenberg's hard line wrapping, so a two-word name
// split across a line break (or by a double space) must still count as found.
const squash = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Everything one run said, squashed: what a claim from the other run is
 * confirmed against. The separator keeps a claim from matching across two
 * parts (the end of one card's title and the start of its idea, say).
 */
function corpusOf(output) {
    const parts = [output.about];
    for (const c of output.cards) parts.push(c.title, c.idea, c.why, ...(Array.isArray(c.claims) ? c.claims.map(String) : []));
    return squash(parts.join(' | '));
}

/** generate.mjs records a failure as { type, message }; this file's own read errors are plain strings. */
function errorDetail(e) {
    if (!e) return 'output is null';
    if (typeof e === 'string') return e;
    return [e.type, e.message].filter(Boolean).join(': ') || JSON.stringify(e);
}

/**
 * The gates for one run. Returns { rec, kept, dropped, about, corpus }: rec is
 * the card file's runs.<label> record ({ ok, violations, cards: how many the
 * run produced }), kept the gate-clean cards, dropped the violating ones.
 */
function gateRun(run, label) {
    const rec = { ok: false, violations: [], cards: 0 };
    const out = { rec, kept: [], dropped: [], about: null, corpus: '' };
    if (!run) {
        rec.violations.push({ rule: 'missing', detail: `run-${label}.json not found` });
        return out;
    }
    if (run.output == null) {
        rec.violations.push({ rule: 'no-output', detail: errorDetail(run.error) });
        return out;
    }
    const shape = shapeViolation(run.output);
    if (shape) {
        rec.violations.push(shape);
        return out;
    }
    const output = run.output;
    rec.cards = output.cards.length;
    out.about = output.about.trim();
    out.corpus = corpusOf(output);
    const setV = checkSet(output);
    const cardV = output.cards.map((c, i) => checkCard(c).map((v) => ({ ...v, card: i + 1 })));
    rec.violations.push(...setV, ...cardV.flat());
    const violating = cardV.filter((v) => v.length).length;
    if (setV.length || violating > MAX_VIOLATING_CARDS) return out;
    rec.ok = true;
    output.cards.forEach((c, i) => {
        if (cardV[i].length) out.dropped.push({ title: c.title.trim(), reason: [...new Set(cardV[i].map((v) => v.rule))].join(', ') });
        else out.kept.push(normalizeCard(c));
    });
    return out;
}

/**
 * Words that more than half of a run's cards use are the book's vocabulary
 * (or, in the mock, a shared template), not any one idea's: two cards that
 * share only those are not the same idea. Left out of the match like the
 * stopwords. A run of one or two cards has no majority worth the name.
 */
function runCommonWords(cards) {
    if (cards.length < 3) return new Set();
    const counts = new Map();
    for (const c of cards) for (const w of new Set(words(`${c.title} ${c.idea}`))) counts.set(w, (counts.get(w) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > cards.length / 2).map(([w]) => w));
}

const contentWords = (card, ignore) => new Set(words(`${card.title} ${card.idea}`).filter((w) => !STOPWORDS.has(w) && !ignore.has(w)));

function jaccard(A, B) {
    let both = 0;
    for (const w of A) if (B.has(w)) both++;
    const union = A.size + B.size - both;
    return union ? both / union : 0;
}

/** Greedy best-first pairing of run a's cards with run b's, each card used once: Map of a-index → b-index. */
function matchCards(a, b) {
    const ignore = new Set([...runCommonWords(a), ...runCommonWords(b)]);
    const wa = a.map((c) => contentWords(c, ignore));
    const wb = b.map((c) => contentWords(c, ignore));
    const pairs = [];
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            const s = jaccard(wa[i], wb[j]);
            if (s >= MATCH_THRESHOLD) pairs.push({ i, j, s });
        }
    }
    pairs.sort((p, q) => q.s - p.s || p.i - q.i || p.j - q.j);
    const usedB = new Set();
    const match = new Map();
    for (const p of pairs) {
        if (match.has(p.i) || usedB.has(p.j)) continue;
        match.set(p.i, p.j);
        usedB.add(p.j);
    }
    return match;
}

/** The whole verification of one title: the card file record, never written here. */
function verifyTitle(entry, dir, source) {
    const runs = {};
    const gated = {};
    const dropped = [];
    let model = null;
    for (const label of RUNS) {
        let run = null;
        try {
            run = readJson(path.join(dir, `run-${label}.json`), null);
        } catch (err) {
            run = { output: null, error: `unreadable run file: ${err.message}` };
        }
        if (!model && typeof run?.model === 'string') model = run.model;
        gated[label] = gateRun(run, label);
        runs[label] = gated[label].rec;
        dropped.push(...gated[label].dropped);
    }
    const surviving = RUNS.filter((l) => runs[l].ok);
    const primary = surviving.length ? gated[surviving[0]] : null;
    const about = primary?.about ?? null;
    const finish = (status, cards, reason = null) => ({
        v: 1,
        id: entry.id,
        title: entry.title,
        author: entry.author,
        model: model ?? MODEL,
        verifiedAt: new Date().toISOString(),
        status,
        ...(reason ? { reason } : {}),
        about,
        cards,
        runs,
        dropped,
    });
    const reject = (reason) => finish('rejected', [], reason);
    const tooFew = (n) => reject(`only ${n} cards survived the gates (minimum ${LIMITS.minCards})`);

    if (!surviving.length) {
        const why = RUNS.map((l) => `${l}: ${[...new Set(runs[l].violations.map((v) => v.rule))].join(', ')}`).join('; ');
        return reject(`no run survived the gates (${why})`);
    }

    // Consensus: pair the primary run's cards with the other run's. A pair
    // keeps the primary wording and the union of both runs' claims, so a
    // claim only one run made still gets cross-checked below.
    const single = (c) => ({ ...c, consensus: false, flags: ['single-run'] });
    let consensus = [];
    let singles = [];
    if (surviving.length > 1) {
        const secondary = gated[surviving[1]];
        const match = matchCards(primary.kept, secondary.kept);
        primary.kept.forEach((c, i) => {
            if (!match.has(i)) {
                singles.push(single(c));
                return;
            }
            const other = secondary.kept[match.get(i)];
            const claims = [...c.claims, ...other.claims.filter((x) => !c.claims.some((y) => y.toLowerCase() === x.toLowerCase()))];
            consensus.push({ ...c, claims, consensus: true, flags: [] });
        });
        const matched = new Set(match.values());
        singles.push(...secondary.kept.filter((_, j) => !matched.has(j)).map(single));
    } else {
        singles = primary.kept.map(single);
    }

    // Claims: confirmed only when every surviving run mentions it (the run
    // that made the claim trivially does, so this is "the other run agrees").
    const corpora = surviving.map((l) => gated[l].corpus);
    const confirmed = (claim) => corpora.length > 1 && corpora.every((t) => t.includes(squash(claim)));
    for (const c of [...consensus, ...singles]) {
        for (const claim of c.claims) if (!confirmed(claim)) c.flags.push(`unconfirmed-claim: ${claim}`);
    }

    // Public-domain titles: nothing copied from the text, every claim in it.
    if (source !== null) {
        const sourceLower = squash(source);
        const notCopied = (c) => {
            if (sharedNgrams(`${c.title} ${c.idea} ${c.why}`, source).length) {
                dropped.push({ title: c.title, reason: 'copied' });
                return false;
            }
            for (const claim of c.claims) if (!sourceLower.includes(squash(claim))) c.flags.push(`claim-not-in-text: ${claim}`);
            return true;
        };
        consensus = consensus.filter(notCopied);
        singles = singles.filter(notCopied);
    }

    // Merge: consensus first, then singletons (primary's, then the other
    // run's), capped; then the set-level gates again, shedding singletons
    // from the end until they pass.
    while (consensus.length + singles.length > LIMITS.maxCards && singles.length) {
        dropped.push({ title: singles.pop().title, reason: 'over-cap' });
    }
    let cards = [...consensus, ...singles];
    if (cards.length < LIMITS.minCards) return tooFew(cards.length);
    for (let setV = checkSet({ about, cards }); setV.length; setV = checkSet({ about, cards })) {
        const rules = [...new Set(setV.map((v) => v.rule))].join(', ');
        if (!singles.length) return reject(`merged set fails ${rules} with no singleton left to drop`);
        // The last singleton goes, except that a duplicate title names its own
        // offender: the later of the pair, always a singleton (each run passed
        // checkSet on its own, and consensus cards all carry run a's titles).
        let k = singles.length - 1;
        if (rules.includes('duplicate-title')) {
            const titles = cards.map((c) => c.title.trim().toLowerCase());
            const dup = titles.findLastIndex((t, i) => titles.indexOf(t) < i);
            if (dup >= consensus.length) k = dup - consensus.length;
        }
        dropped.push({ title: singles.splice(k, 1)[0].title, reason: rules });
        cards = [...consensus, ...singles];
        if (cards.length < LIMITS.minCards) return tooFew(cards.length);
    }
    const flagged = cards.filter((c) => c.flags.length).length;
    return finish(flagged ? 'needs-check' : 'ok', cards);
}

/** The ledger, rebuilt from every card file: one row per title, one indented row per flagged card. */
function buildChecklist(paths) {
    const recs = [];
    if (existsSync(paths.cards)) {
        for (const f of readdirSync(paths.cards)) {
            if (!/^\d+\.json$/.test(f)) continue;
            let rec = null;
            try {
                rec = JSON.parse(readFileSync(path.join(paths.cards, f), 'utf8'));
            } catch (err) {
                console.error(`checklist: skipping unreadable ${f}: ${err.message}`);
                continue;
            }
            if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !Number.isInteger(rec.id)) {
                console.error(`checklist: skipping ${f}: not a card file`);
                continue;
            }
            recs.push(rec);
        }
    }
    recs.sort((x, y) => x.id - y.id);
    const count = (status) => recs.filter((r) => r.status === status).length;
    const checked = recs.filter((r) => r.checked === true).length;
    const lines = [
        '# Summaries checklist',
        '',
        'Generated by `node scripts/summaries/verify.mjs` — do not edit by hand.',
        'One row per verified card file (`data-src/summaries/<id>.json`); verify.mjs rewrites this ledger on every run.',
        'Flagged cards want a human read against the hard copy: single-run (only one model run produced the idea), unconfirmed-claim (the other run never mentions that person, study or number), claim-not-in-text (not found in the public-domain source text).',
        'To mark a title checked, set `"checked": true` in its card file; verify.mjs then leaves that file alone unless --force.',
        '',
        `**${recs.length}** title(s): ${count('ok')} ok, ${count('needs-check')} needs-check, ${count('rejected')} rejected, ${checked} checked.`,
        '',
    ];
    for (const r of recs) {
        const name = `${r.id} ${shortTitle(r.title ?? '')}`;
        const mark = r.checked === true ? ' ☑ checked' : '';
        if (r.status === 'rejected') {
            lines.push(`- ${name}: rejected — ${r.reason ?? 'no reason recorded'}${mark}`);
            continue;
        }
        const cards = Array.isArray(r.cards) ? r.cards : [];
        const flagged = cards.filter((c) => c.flags?.length).length;
        lines.push(`- ${name}: ${r.status}, ${cards.length} cards${flagged ? `, ${flagged} flagged` : ''}${mark}`);
        cards.forEach((c, i) => {
            if (c.flags?.length) lines.push(`  - card ${i + 1} ${c.title}: ${c.flags.join('; ')}`);
        });
    }
    writeAtomic(paths.checklist, lines.join('\n') + '\n');
    return recs.length;
}

const paths = resolvePaths(process.argv);
const force = flag('force');
let entries;
try {
    entries = selectEntries(loadSource(paths.source), process.argv);
} catch (err) {
    console.error(err.message);
    process.exit(1);
}

mkdirSync(paths.cards, { recursive: true });
let rejected = 0;
for (const entry of entries) {
    const dir = path.join(paths.work, String(entry.id));
    const file = path.join(paths.cards, `${entry.id}.json`);
    let existing = null;
    try {
        existing = readJson(file, null);
    } catch (err) {
        console.error(`${entry.id}: existing ${file} is unreadable (${err.message}); rewriting it`);
    }
    if (existing?.checked === true && !force) {
        console.log(`${entry.id}: kept — checked: true; existing ${existing.status} file left alone (pass --force to overwrite)`);
        if (existing.status === 'rejected') rejected++;
        continue;
    }
    // work/ is gitignored scratch: on a fresh clone every run file is gone,
    // and verifying then must not rewrite committed, verified cards as
    // rejected. A title with no run files at all keeps its existing card file.
    const noRuns = RUNS.every((l) => !existsSync(path.join(dir, `run-${l}.json`)));
    if (noRuns && existing && typeof existing === 'object' && !force) {
        console.log(`${entry.id}: kept — no run files under ${dir}; existing ${existing.status} file left alone (run generate.mjs, or pass --force to rewrite it as rejected)`);
        if (existing.status === 'rejected') rejected++;
        continue;
    }
    const sourceFile = path.join(dir, 'source.txt');
    const source = existsSync(sourceFile) ? readFileSync(sourceFile, 'utf8') : null;
    if (source !== null && !source.trim()) console.error(`${entry.id}: ${sourceFile} is empty; every claim will be flagged claim-not-in-text`);
    const rec = verifyTitle(entry, dir, source);
    if (existing?.checked === true) console.log(`${entry.id}: --force overwrites a checked file; the checked mark does not carry over`);
    writeAtomic(file, JSON.stringify(rec, null, 2) + '\n');
    const runsNote = RUNS.map((l) => `${l} ${rec.runs[l].ok ? 'ok' : 'failed'}`).join(', ');
    if (rec.status === 'rejected') {
        rejected++;
        const hint = RUNS.every((l) => rec.runs[l].violations.some((v) => v.rule === 'missing')) ? `; no run files under ${dir}, run generate.mjs first` : '';
        console.error(`${entry.id}: REJECTED — ${rec.reason} (runs: ${runsNote}${hint})`);
        continue;
    }
    const consensus = rec.cards.filter((c) => c.consensus).length;
    const flagged = rec.cards.filter((c) => c.flags.length).length;
    console.log(`${entry.id}: ${rec.status} — ${rec.cards.length} cards (${consensus} consensus, ${rec.cards.length - consensus} single-run), `
        + `${flagged} flagged, ${rec.dropped.length} dropped; runs: ${runsNote}${source !== null ? '; source text checked' : ''}`);
}
const n = buildChecklist(paths);
console.log(`checklist: ${paths.checklist} (${n} title(s))`);
process.exit(rejected ? 1 : 0);
