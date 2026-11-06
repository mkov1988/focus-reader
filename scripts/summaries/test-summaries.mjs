/**
 * Pins the key-idea summaries pipeline's contracts WITHOUT a network or an
 * API key: generate.mjs in mock mode (resumable, --force), verify.mjs's
 * gates, cross-run consensus, claim checks, the public-domain copy check,
 * the checklist and the checked mark, build.mjs's rendered texts, manifest,
 * hidden list and leftover gate, and narration planning over a rendered text
 * (scripts/narration/plan.mjs must take a summary exactly like a book).
 *
 *   node scripts/summaries/test-summaries.mjs
 *
 * Every path the three scripts touch is redirected into one temp dir through
 * their --work= --cards= --checklist= --text-dir= --manifest= --native=
 * --hidden= overrides (lib.mjs resolvePaths), so the repo's own card files,
 * texts, manifests and checklist are never written. The title list is the
 * committed data-src/summaries-src.json: 800003 (Atomic Habits, in copyright)
 * and 800006 (The Science of Getting Rich, public domain) must stay in it.
 * The spawned scripts get no ANTHROPIC_API_KEY, so a mock run that reached
 * for the SDK would fail here rather than quietly bill something.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, RUNS, QUOTE_RE, gateScan, sharedNgrams, loadSource, PATHS } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const IDS = [800003, 800006];
const PUBLIC_DOMAIN_ID = 800006;
const CLAIM = 'Dave Brailsford';     // the one claim lib.mjs's mock plants, in run b only

let failures = 0;
const check = (label, cond, detail = '') => {
    if (cond) { console.log(`ok  ${label}`); } else { console.error(`FAIL ${label} ${detail}`); failures++; }
};

const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;
/** Runs one pipeline script with node; returns spawnSync's result (status, stdout, stderr). */
function run(script, args) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { encoding: 'utf8', env, cwd: ROOT });
    if (r.error) throw r.error;
    return r;
}
const tail = (r) => `(status ${r.status}; stdout: ${r.stdout.trim().split('\n').slice(-3).join(' | ')}; stderr: ${r.stderr.trim().split('\n').slice(-3).join(' | ')})`;
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const cardText = (c) => `${c.title} ${c.idea} ${c.why}`;

const src = loadSource(PATHS.source);
for (const id of IDS) check(`fixture: ${id} is in the committed title list`, src.byId.has(id));
check('fixture: 800006 is public domain with a Gutenberg id', src.byId.get(PUBLIC_DOMAIN_ID)?.rights === 'public_domain_us' && Boolean(src.byId.get(PUBLIC_DOMAIN_ID)?.gutenberg_id));
check('fixture: 800003 is in copyright', src.byId.get(800003)?.rights === 'in_copyright');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'summaries-test-'));
const work = path.join(tmp, 'work');
const cards = path.join(tmp, 'cards');
const checklist = path.join(tmp, 'CHECK.md');
const texts = path.join(tmp, 'texts');
const manifest = path.join(tmp, 'manifest.json');
const native = path.join(tmp, 'native.json');
const hidden = path.join(tmp, 'hidden.json');
const narr = path.join(tmp, 'narr');
const runFile = (id, label) => path.join(work, String(id), `run-${label}.json`);
const cardFile = (id) => path.join(cards, `${id}.json`);
const textFile = (id) => path.join(texts, `${id}.txt`);
const generateArgs = ['--mock', `--ids=${IDS.join(',')}`, `--work=${work}`];
const verifyArgs = [`--ids=${IDS.join(',')}`, `--work=${work}`, `--cards=${cards}`, `--checklist=${checklist}`];
const buildArgs = [`--cards=${cards}`, `--text-dir=${texts}`, `--manifest=${manifest}`, `--native=${native}`, `--hidden=${hidden}`];

try {
    // ── 1. generate --mock: run files, resumability, --force ───────────────
    {
        const r = run('summaries/generate.mjs', generateArgs);
        check('generate: mock run exits 0', r.status === 0, tail(r));
        for (const id of IDS) {
            for (const label of RUNS) {
                const file = runFile(id, label);
                const rec = existsSync(file) ? readJson(file) : null;
                check(`generate: ${id} run ${label} written`, rec !== null, `(${file} missing)`);
                if (!rec) continue;
                check(`generate: ${id} run ${label} carries id, run and mode mock`, rec.id === id && rec.run === label && rec.mode === 'mock' && rec.v === 1);
                check(`generate: ${id} run ${label} has 10 cards and an about line`, rec.output?.cards?.length === 10 && typeof rec.output?.about === 'string' && rec.error === null);
                const u = rec.usage ?? {};
                check(`generate: ${id} run ${label} usage is all zeros`, ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].every((k) => u[k] === 0), JSON.stringify(u));
                check(`generate: ${id} run ${label} has an ISO requestedAt`, typeof rec.requestedAt === 'string' && !Number.isNaN(Date.parse(rec.requestedAt)));
            }
        }
        check('generate: mock never resolves a public-domain source (no network)', !existsSync(path.join(work, String(PUBLIC_DOMAIN_ID), 'source.txt')));

        const before = Object.fromEntries(IDS.flatMap((id) => RUNS.map((l) => [`${id}-${l}`, readFileSync(runFile(id, l), 'utf8')])));
        const again = run('summaries/generate.mjs', generateArgs);
        check('generate: rerun without --force exits 0', again.status === 0, tail(again));
        check('generate: rerun without --force leaves every run file byte-identical', IDS.every((id) => RUNS.every((l) => readFileSync(runFile(id, l), 'utf8') === before[`${id}-${l}`])));
        check('generate: rerun reports nothing pending', /0 pending, 4 already done/.test(again.stdout), tail(again));

        const forced = run('summaries/generate.mjs', [...generateArgs, '--force']);
        check('generate: --force exits 0', forced.status === 0, tail(forced));
        check('generate: --force rewrites every run file (requestedAt changes)', IDS.every((id) => RUNS.every((l) => {
            const now = readJson(runFile(id, l));
            const old = JSON.parse(before[`${id}-${l}`]);
            return now.requestedAt !== old.requestedAt && now.mode === 'mock' && now.output.cards.length === 10;
        })));
    }

    // ── 2. A public-domain source text with one copied run of words ────────
    // lib.mjs's mock opens every idea with its own title as a sentence (five
    // words, under LIMITS.ngram) and then a template every card shares, so the
    // copied excerpt is the whole first sentence running on verbatim into the
    // second: long enough for the n-gram gate, and found in the first card
    // only. The fixture proves that about itself before verify runs.
    const runA = readJson(runFile(PUBLIC_DOMAIN_ID, 'a'));
    const runB = readJson(runFile(PUBLIC_DOMAIN_ID, 'b'));
    const firstCard = runA.output.cards[0];
    {
        const ideaWords = firstCard.idea.split(/\s+/);
        const sentenceEnd = ideaWords.findIndex((w) => /[.!?]$/.test(w)) + 1;
        const excerpt = ideaWords.slice(0, Math.max(sentenceEnd, LIMITS.ngram + 2)).join(' ');
        const filler = 'The river ran cold that spring, and the villagers mended their nets in silence while the geese went north. Nobody spoke of the winter. A bell rang twice at noon, and then the afternoon went on exactly as it had before.';
        const source = `${excerpt}\n\n${filler}\n`;
        mkdirSync(path.join(work, String(PUBLIC_DOMAIN_ID)), { recursive: true });
        writeFileSync(path.join(work, String(PUBLIC_DOMAIN_ID), 'source.txt'), source);
        check('fixture: excerpt is a verbatim prefix holding the whole first sentence', sentenceEnd > 0 && firstCard.idea.startsWith(excerpt) && excerpt.split(/\s+/).length >= sentenceEnd);
        check('fixture: the copy check catches run a\'s first card', sharedNgrams(cardText(firstCard), source).length > 0);
        const others = [...runA.output.cards.slice(1), ...runB.output.cards.filter((c) => c.title !== firstCard.title)];
        check('fixture: the copy check catches no other card of either run', others.every((c) => sharedNgrams(cardText(c), source).length === 0));
        check('fixture: the source never mentions the planted claim', !source.toLowerCase().includes(CLAIM.toLowerCase()));
    }

    // ── 3. verify: gates, consensus, claims, the copy check, the checklist, checked ─
    {
        const r = run('summaries/verify.mjs', verifyArgs);
        check('verify: exits 0 (nothing rejected)', r.status === 0, tail(r));

        const a = existsSync(cardFile(800003)) ? readJson(cardFile(800003)) : null;
        check('verify: 800003 card file written', a !== null);
        if (a) {
            const consensus = a.cards.filter((c) => c.consensus === true);
            const singles = a.cards.filter((c) => c.consensus === false);
            check('verify: 800003 is needs-check', a.status === 'needs-check', `(${a.status}: ${a.reason ?? ''})`);
            check('verify: 800003 has 11 cards: 9 consensus plus 2 single-run', a.cards.length === 11 && consensus.length === 9 && singles.length === 2, `(${a.cards.length} cards, ${consensus.length} consensus, ${singles.length} single)`);
            check('verify: 800003 consensus cards come first, singles after', a.cards.slice(0, 9).every((c) => c.consensus) && a.cards.slice(9).every((c) => !c.consensus));
            check('verify: 800003 every single-run card is flagged single-run', singles.every((c) => c.flags.includes('single-run')) && consensus.every((c) => !c.flags.includes('single-run')));
            const unconfirmed = a.cards.filter((c) => c.flags.includes(`unconfirmed-claim: ${CLAIM}`));
            check(`verify: 800003 flags ${CLAIM} as unconfirmed on exactly one card`, unconfirmed.length === 1 && unconfirmed[0].claims.includes(CLAIM), `(${unconfirmed.length} cards)`);
            check('verify: 800003 is not source-checked (in copyright, no source.txt)', a.cards.every((c) => !c.flags.some((f) => f.startsWith('claim-not-in-text'))) && a.dropped.length === 0);
            check('verify: 800003 both runs passed the gates', RUNS.every((l) => a.runs[l]?.ok === true && a.runs[l].cards === 10));
            check('verify: 800003 carries title, author, about and model', a.id === 800003 && typeof a.title === 'string' && typeof a.author === 'string' && typeof a.about === 'string' && typeof a.model === 'string');
        }

        const b = existsSync(cardFile(PUBLIC_DOMAIN_ID)) ? readJson(cardFile(PUBLIC_DOMAIN_ID)) : null;
        check('verify: 800006 card file written', b !== null);
        if (b) {
            const copied = b.dropped.filter((d) => d.reason === 'copied');
            check('verify: 800006 is needs-check', b.status === 'needs-check', `(${b.status}: ${b.reason ?? ''})`);
            check('verify: 800006 drops exactly the first card as copied', copied.length === 1 && copied[0].title === firstCard.title && b.dropped.length === 1, JSON.stringify(b.dropped));
            check('verify: 800006 keeps no card with that title', b.cards.every((c) => c.title !== firstCard.title) && b.cards[0].title !== firstCard.title);
            check('verify: 800006 keeps 10 cards (8 consensus plus 2 single-run)', b.cards.length === 10 && b.cards.filter((c) => c.consensus).length === 8);
            check(`verify: 800006 flags ${CLAIM} as not in the text on exactly one card`, b.cards.filter((c) => c.flags.includes(`claim-not-in-text: ${CLAIM}`)).length === 1);
            check('verify: 800006 was checked against the source text', /800006: needs-check[^\n]*source text checked/.test(r.stdout), tail(r));
        }

        const list = existsSync(checklist) ? readFileSync(checklist, 'utf8') : '';
        check('verify: checklist written', list.length > 0);
        check('verify: checklist lists both titles as needs-check', /^- 800003 Atomic Habits: needs-check, 11 cards, \d+ flagged$/m.test(list) && /^- 800006 The Science of Getting Rich: needs-check, 10 cards, \d+ flagged$/m.test(list), list.split('\n').filter((l) => l.startsWith('- ')).join(' | '));
        check('verify: checklist lists the flags under each title', (list.match(new RegExp(`unconfirmed-claim: ${CLAIM}`, 'g')) ?? []).length === 2 && (list.match(/: single-run$/gm) ?? []).length === 4 && list.includes(`claim-not-in-text: ${CLAIM}`));
        check('verify: checklist counts 2 titles, 2 needs-check, 0 checked', /\*\*2\*\* title\(s\): 0 ok, 2 needs-check, 0 rejected, 0 checked\./.test(list));

        // The checked mark: a human's say-so survives a rerun without --force.
        if (a) {
            writeFileSync(cardFile(800003), JSON.stringify({ ...a, checked: true }, null, 2) + '\n');
            const marked = readFileSync(cardFile(800003), 'utf8');
            const again = run('summaries/verify.mjs', verifyArgs);
            check('verify: rerun exits 0', again.status === 0, tail(again));
            check('verify: a checked card file is left byte-identical without --force', readFileSync(cardFile(800003), 'utf8') === marked);
            check('verify: rerun says it kept the checked file', /800003: kept — checked: true/.test(again.stdout), tail(again));
            check('verify: the unchecked title is verified again', readJson(cardFile(PUBLIC_DOMAIN_ID)).status === 'needs-check');
            check('verify: checklist shows the checked mark', /800003 Atomic Habits: needs-check, 11 cards, \d+ flagged ☑ checked/.test(readFileSync(checklist, 'utf8')) && /1 checked\./.test(readFileSync(checklist, 'utf8')));
        }
    }

    // ── 4. build: texts, manifest, native copy, hide / unhide ──────────────
    let textsBefore = {};
    {
        const r = run('summaries/build.mjs', buildArgs);
        check('build: exits 0', r.status === 0, tail(r));
        for (const id of IDS) {
            const file = textFile(id);
            check(`build: ${id} text written`, existsSync(file));
            if (!existsSync(file)) continue;
            const text = readFileSync(file, 'utf8');
            textsBefore[id] = text;
            check(`build: ${id} text is LF only, trimmed lines, single blank lines, final newline`, !text.includes('\r') && !/[ \t]$/m.test(text) && !/^[ \t]/m.test(text) && !/\n{3}/.test(text) && text.endsWith('\n'));
            check(`build: ${id} text has no quotation marks (QUOTE_RE)`, !QUOTE_RE.test(text));
            check(`build: ${id} text passes the leftover gate (gateScan)`, gateScan(text).length === 0, JSON.stringify(gateScan(text)));
            check(`build: ${id} text names the title and the buy-the-book close, no URL`, text.startsWith(`Key Ideas from ${src.byId.get(id).title.split(/[:(\[]/)[0].trim()}\n`) && text.includes('goes much deeper than any summary can') && !text.includes('amazon'));
        }
        check('build: native copy is byte-identical to the manifest', existsSync(manifest) && existsSync(native) && readFileSync(manifest, 'utf8') === readFileSync(native, 'utf8'));
        const m = existsSync(manifest) ? readJson(manifest) : null;
        check('build: manifest is v1 with both titles in rank order', m?.v === 1 && Array.isArray(m?.titles) && m.titles.map((t) => t.id).join(',') === IDS.join(','), JSON.stringify(m?.titles?.map((t) => t.id)));
        for (const id of IDS) {
            const t = m?.titles?.find((x) => x.id === id);
            const entry = src.byId.get(id);
            const cardsN = readJson(cardFile(id)).cards.length;
            check(`build: manifest ${id} has textUrl, words, cards, buyUrl, rights, rank`, t && t.textUrl === `/summaries/${id}.txt` && t.words > 0 && t.cards === cardsN && t.buyUrl === entry.amazon_url && t.rights === entry.rights && t.rank === entry.rank && t.hidden === false, JSON.stringify(t));
            check(`build: manifest ${id} sha256 is the served text's`, t && textsBefore[id] !== undefined && t.sha256 === sha256(textsBefore[id]));
            check(`build: manifest ${id} carries status, checked, slug and author`, t && t.status === 'needs-check' && t.checked === (id === 800003) && typeof t.slug === 'string' && t.slug.length > 0 && t.author === entry.author);
        }

        const hide = run('summaries/build.mjs', [...buildArgs, `--hide=${PUBLIC_DOMAIN_ID}`]);
        check('build --hide: exits 0', hide.status === 0, tail(hide));
        check('build --hide: hidden list holds the id', existsSync(hidden) && JSON.stringify(readJson(hidden)) === JSON.stringify([PUBLIC_DOMAIN_ID]));
        check('build --hide: the hidden text file is removed, the other stays', !existsSync(textFile(PUBLIC_DOMAIN_ID)) && existsSync(textFile(800003)));
        const mh = existsSync(manifest) ? readJson(manifest) : null;
        const th = mh?.titles?.find((t) => t.id === PUBLIC_DOMAIN_ID);
        const to = mh?.titles?.find((t) => t.id === 800003);
        check('build --hide: manifest keeps the title with hidden: true, textUrl null, zero words', th && th.hidden === true && th.textUrl === null && th.words === 0 && th.sha256 === null, JSON.stringify(th));
        check('build --hide: the other title is untouched', to && to.hidden === false && to.textUrl === '/summaries/800003.txt' && to.words > 0 && to.sha256 === sha256(textsBefore[800003]));
        check('build --hide: native copy still identical', readFileSync(manifest, 'utf8') === readFileSync(native, 'utf8'));

        const unhide = run('summaries/build.mjs', [...buildArgs, `--unhide=${PUBLIC_DOMAIN_ID}`]);
        check('build --unhide: exits 0', unhide.status === 0, tail(unhide));
        check('build --unhide: hidden list is empty again', JSON.stringify(readJson(hidden)) === '[]');
        check('build --unhide: the text file is restored byte-identical', existsSync(textFile(PUBLIC_DOMAIN_ID)) && readFileSync(textFile(PUBLIC_DOMAIN_ID), 'utf8') === textsBefore[PUBLIC_DOMAIN_ID]);
        const mu = readJson(manifest).titles.find((t) => t.id === PUBLIC_DOMAIN_ID);
        check('build --unhide: manifest entry is back with its text', mu && mu.hidden === false && mu.textUrl === `/summaries/${PUBLIC_DOMAIN_ID}.txt` && mu.words > 0);
    }

    // ── 5. Narration compatibility: plan.mjs takes a summary like a book ───
    {
        const r = run('narration/plan.mjs', ['--ids=800003', `--text-dir=${texts}`, `--work=${narr}`]);
        check('plan: exits 0 over the rendered text', r.status === 0, tail(r));
        const planFile = path.join(narr, '800003', 'plan.json');
        check('plan: no excluded.json (no leftover hits)', !existsSync(path.join(narr, '800003', 'excluded.json')));
        check('plan: plan.json written', existsSync(planFile));
        if (existsSync(planFile)) {
            const plan = readJson(planFile);
            check('plan: narrated span covers at least 90% of the tokens', plan.spanWords >= 0.9 * plan.tokensTotal && plan.tokensTotal > 0, `(${plan.spanWords} of ${plan.tokensTotal})`);
            check('plan: units tile the span', plan.units.reduce((n, u) => n + u.count, 0) === plan.spanWords && plan.units.length > 0);
            check('plan: sourceSha256 matches the manifest sha256 (same bytes hashed)', plan.sourceSha256 === readJson(manifest).titles.find((t) => t.id === 800003).sha256);
        }
    }

    // ── 6. The leftover gate: a URL in a card means no text, exit 1 ────────
    {
        const rec = readJson(cardFile(800003));
        rec.cards[4].idea += ' See https://example.com for more.';
        writeFileSync(cardFile(800003), JSON.stringify(rec, null, 2) + '\n');
        const r = run('summaries/build.mjs', buildArgs);
        check('gate: build exits 1 on a URL in a card', r.status === 1, tail(r));
        check('gate: the failed title gets no text file (the stale one is swept)', !existsSync(textFile(800003)));
        check('gate: the clean title keeps its text', existsSync(textFile(PUBLIC_DOMAIN_ID)) && readFileSync(textFile(PUBLIC_DOMAIN_ID), 'utf8') === textsBefore[PUBLIC_DOMAIN_ID]);
        check('gate: the hit is named on stderr', /800003: GATE/.test(r.stderr) && /url:/.test(r.stderr), tail(r));
        const m = readJson(manifest);
        check('gate: the failed title is out of the manifest, the clean one in', m.titles.map((t) => t.id).join(',') === String(PUBLIC_DOMAIN_ID));
        check('gate: native copy still identical', readFileSync(manifest, 'utf8') === readFileSync(native, 'utf8'));
    }
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

console.log('');
if (failures) { console.error(`${failures} failure(s).`); process.exit(1); }
console.log('summaries pipeline contracts hold.');
