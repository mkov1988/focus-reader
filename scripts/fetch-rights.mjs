/**
 * Build the per-title rights store LEGAL.md needs before payments go live.
 *
 * LEGAL.md says the lawyer title list "can be generated on demand", but nothing
 * in the repo carries a death year, a translator, or a copyright status:
 * curated.json holds only id/title/author/coverUrl/textUrl/downloadCount. This
 * script fills that gap from the one source that has all three fields together,
 * the gutenberg.org record page, which is a plain key/value table.
 *
 * The SERVED text cannot be the source. The Gutenberg strip removes the
 * translator credit and the copyright notice along with the boilerplate, so
 * public/books/5200.txt has no match for "wyllie", "copyright" or "translat"
 * even though the record page credits Wyllie's 2002 translation and reads
 * "Copyrighted". Reading served text would silently clear the riskiest titles.
 *
 * Gutendex (the JSON API) is unreachable from the Pages/CI sandbox, hence the
 * record-page scrape. Gutenberg discourages bulk crawling and blocks IPs
 * (LEGAL.md "Server access policy"), so this runs ONE page at a time with a
 * delay, backs off on 429/403, and aborts rather than hammering. Raw HTML is
 * cached (gitignored) so re-parsing never re-crawls.
 *
 *   node scripts/fetch-rights.mjs                  the 1,401-book served hot set
 *   node scripts/fetch-rights.mjs --ids=84,5200    just these
 *   node scripts/fetch-rights.mjs --parse-only     re-parse the cache, no network
 *
 * Writes data-src/rights-src.json (committed; precious) with one row per id.
 * Verdicts are NOT decided here: a row carries the evidence and a `flag`, and a
 * human decides keep/pull/region-gate/swap. See docs/LAWYER-TITLE-LIST.md.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts', '.rights-cache');
const OUT = path.join(ROOT, 'data-src', 'rights-src.json');
const BASE = 'https://www.gutenberg.org/ebooks';

const args = process.argv.slice(2);
const ONLY = args.find((a) => a.startsWith('--ids='))?.slice(6).split(',').map((s) => s.trim()).filter(Boolean);
const PARSE_ONLY = args.includes('--parse-only');
const DELAY_MS = Number(args.find((a) => a.startsWith('--delay='))?.slice(8) || 600);

/** The served hot set: every id the app can reach without a live lookup. */
function hotSet() {
    const starts = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'story-starts.json'), 'utf8'));
    return Object.keys(starts);
}

/** Title/author as the app shows them, for a human-readable list. */
function shelfMeta() {
    const meta = new Map();
    const curated = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'curated.json'), 'utf8'));
    for (const b of curated) {
        meta.set(String(b.id), { title: b.title, author: b.author, downloads: b.downloadCount ?? 0, inCurated: true });
    }
    const vibes = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'vibes.json'), 'utf8'));
    for (const v of vibes) {
        const entries = [...(v.hero || []), ...(v.shelves || []).flatMap((s) => s.books || [])];
        for (const b of entries) {
            const id = String(b.id ?? b);
            if (!meta.has(id)) meta.set(id, { title: b.title || '', author: b.author || '', downloads: b.downloads ?? 0, inCurated: false });
        }
    }
    return meta;
}

/** Top-100 Popular shelf, exactly as TodayScreen derives it. */
function top100() {
    const curated = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'curated.json'), 'utf8'));
    return new Set([...curated].sort((a, b) => b.downloadCount - a.downloadCount).slice(0, 100).map((b) => String(b.id)));
}

const strip = (s) => s.replace(/<[^>]+>/g, '');
const tidy = (s) => strip(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** The record page is a <tr><th>key</th><td>value</td></tr> table. Keys repeat. */
function parseRecord(html) {
    const fields = [];
    for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
        const th = row.match(/<th[^>]*>([\s\S]*?)<\/th>/);
        const td = row.match(/<td[^>]*>([\s\S]*?)<\/td>/);
        if (th && td) fields.push([tidy(th[1]), tidy(td[1])]);
    }
    const all = (key) => fields.filter(([k]) => k.toLowerCase() === key).map(([, v]) => v);
    const one = (key) => all(key)[0] || '';

    // "Kafka, Franz, 1883-1924" -> death 1924. "Various" / "Anonymous" -> null.
    const parseDates = (s) => {
        const m = s.match(/,\s*(\d{3,4})\??\s*-\s*(\d{3,4})\?/) || s.match(/,\s*(\d{3,4})\??\s*-\s*(\d{3,4})/);
        if (m) return { birth: Number(m[1]), death: Number(m[2]) };
        const open = s.match(/,\s*(\d{3,4})\??\s*-\s*$/);
        if (open) return { birth: Number(open[1]), death: null };
        return { birth: null, death: null };
    };

    const authors = all('author').concat(all('authors'));
    const contributors = [];
    for (const key of ['translator', 'editor', 'illustrator', 'contributor', 'commentator', 'annotator']) {
        for (const v of all(key)) contributors.push({ role: key, raw: v, ...parseDates(v) });
    }
    const copyright = one('copyright') || one('copyright status');
    return {
        recordTitle: one('title'),
        authors: authors.map((a) => ({ raw: a, ...parseDates(a) })),
        contributors,
        language: one('language'),
        copyright,
        copyrighted: /copyrighted/i.test(copyright),
        subjects: all('subject'),
        category: one('category'),
    };
}

/**
 * The flag is evidence-driven, never a verdict.
 *  gutenberg-copyrighted : Gutenberg itself says the file is under copyright.
 *  life70-author         : PD in the US, still protected where the term is
 *                          life + 70 (LEGAL.md "International copyright").
 *  life70-contributor    : the translation/edition carries its own term.
 *  unknown-dates         : no death year anywhere, so nothing can be asserted.
 */
function flagFor(rec, thisYear) {
    if (rec.copyrighted) return 'gutenberg-copyrighted';
    const cutoff = thisYear - 70;
    const authorDeaths = rec.authors.map((a) => a.death).filter((d) => typeof d === 'number');
    if (authorDeaths.some((d) => d > cutoff)) return 'life70-author';
    const contribDeaths = rec.contributors.map((c) => c.death).filter((d) => typeof d === 'number');
    if (contribDeaths.some((d) => d > cutoff)) return 'life70-contributor';
    if (!authorDeaths.length) return 'unknown-dates';
    return 'clear';
}

async function fetchRecord(id) {
    const cached = path.join(CACHE, `${id}.html`);
    if (existsSync(cached)) return { html: readFileSync(cached, 'utf8'), cacheHit: true };
    if (PARSE_ONLY) return null;
    for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await fetch(`${BASE}/${id}`, { redirect: 'follow' });
        if (res.status === 429 || res.status === 403) {
            // Gutenberg blocks crawlers. Back off hard, and give up rather than persist.
            const wait = 20000 * attempt;
            console.warn(`  #${id}: HTTP ${res.status}, backing off ${wait / 1000}s (attempt ${attempt}/4)`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
        }
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const html = await res.text();
        if (!/<th[^>]*>\s*Copyright/i.test(html)) return { error: 'no copyright row in page' };
        writeFileSync(cached, html);
        return { html };
    }
    return { error: 'blocked after 4 attempts' };
}

async function main() {
    mkdirSync(CACHE, { recursive: true });
    const ids = ONLY || hotSet();
    const meta = shelfMeta();
    const popular = top100();
    const thisYear = Number(process.env.RIGHTS_YEAR) || 2026;
    const narrated = new Set(Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'public', 'narration-v1.json'), 'utf8')).books));
    const modernityWorks = JSON.parse(readFileSync(path.join(ROOT, 'public', 'modernity-v1.json'), 'utf8')).works;
    const modernized = new Set();
    for (const w of Object.values(modernityWorks)) for (const i of (w.ids || (w.id ? [w.id] : []))) modernized.add(String(i));

    const rows = {};
    const failures = [];
    let n = 0, hits = 0;
    for (const id of ids) {
        n++;
        const got = await fetchRecord(id);
        if (!got) { failures.push({ id, error: 'not cached and --parse-only' }); continue; }
        if (got.error) { failures.push({ id, error: got.error }); continue; }
        if (got.cacheHit) hits++;
        const rec = parseRecord(got.html);
        const m = meta.get(id) || {};
        rows[id] = {
            id,
            title: m.title || rec.recordTitle,
            author: m.author || (rec.authors[0]?.raw ?? ''),
            authors: rec.authors,
            contributors: rec.contributors,
            language: rec.language,
            copyright: rec.copyright,
            flag: flagFor(rec, thisYear),
            inCurated: !!m.inCurated,
            inTop100: popular.has(id),
            narrated: narrated.has(id),
            modernized: modernized.has(id),
            downloads: m.downloads ?? 0,
            source: `${BASE}/${id}`,
        };
        if (n % 100 === 0) console.log(`  ${n}/${ids.length} (${hits} from cache)`);
        if (!got.cacheHit) await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    const byFlag = {};
    for (const r of Object.values(rows)) byFlag[r.flag] = (byFlag[r.flag] || 0) + 1;
    const out = {
        _comment: 'Per-title rights evidence from gutenberg.org record pages. Generated by scripts/fetch-rights.mjs. Flags are EVIDENCE, not verdicts; a human decides keep/pull/region-gate/swap. See LEGAL.md.',
        generatedAt: new Date().toISOString().slice(0, 10),
        termYear: thisYear,
        counts: { rows: Object.keys(rows).length, failures: failures.length, byFlag },
        failures,
        rows,
    };
    writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
    console.log(`\nWrote ${path.relative(ROOT, OUT)} — ${Object.keys(rows).length} rows, ${failures.length} failures.`);
    console.log('Flags:', JSON.stringify(byFlag));
    if (failures.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
