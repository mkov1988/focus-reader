/**
 * Vibe crawl / probe (research, not shipped).
 *
 * Answers "what fits where" for the Vibe-out redesign:
 *   A) Harvest the most popular English books and tally their Gutendex
 *      `bookshelves` + `subjects` — this is the natural sub-vibe vocabulary.
 *   B) Count how many English books match each candidate vibe topic, so we
 *      know which vibes can realistically reach 100+ books.
 *
 * Usage: node scripts/crawl-vibes.mjs
 */

const API = 'https://gutendex.com/books';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return res.json();
}

// ── A) Harvest popular English books, tally shelves + subjects ──────────────
async function harvest(pages = 10) {
    const shelves = new Map();
    const subjects = new Map();
    let total = 0;
    let url = `${API}?languages=en&sort=popular&mime_type=text%2Fplain`;
    for (let p = 0; p < pages && url; p++) {
        const data = await getJson(url);
        for (const b of data.results) {
            total++;
            for (const s of b.bookshelves ?? []) shelves.set(s, (shelves.get(s) ?? 0) + 1);
            for (const s of b.subjects ?? []) subjects.set(s, (subjects.get(s) ?? 0) + 1);
        }
        url = data.next;
        await sleep(250);
    }
    return { total, shelves, subjects };
}

// ── B) Feasibility: count per candidate vibe topic ──────────────────────────
const CANDIDATE_TOPICS = {
    'Cozy Corners': ['domestic fiction', 'country life', 'humor', 'fairy tales', 'Christmas'],
    'Tangled Sheets': ['love stories', 'courtship', 'romance', 'marriage'],
    'Big Firsts': ['bildungsromans', 'coming of age', 'boys', 'orphans', 'young women'],
    'Ugly Cries': ['tragedy', 'grief', 'death', 'war stories'],
    'New Realms': ['science fiction', 'fantasy', 'adventure stories', 'mythology', 'fairy tales', 'utopias'],
    'Up All Night': ['detective', 'mystery fiction', 'crime', 'adventure stories', 'sea stories'],
    'Mind Breakers': ['horror', 'gothic fiction', 'ghost stories', 'philosophy', 'supernatural'],
};

async function topicCount(topic) {
    const url = `${API}?topic=${encodeURIComponent(topic)}&languages=en&mime_type=text%2Fplain`;
    const data = await getJson(url);
    return data.count;
}

function topN(map, n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
    console.log('=== A) Harvesting popular English books ===');
    const { total, shelves, subjects } = await harvest(10);
    console.log(`sampled ${total} books\n`);
    console.log('-- top bookshelves (candidate sub-vibes) --');
    for (const [name, c] of topN(shelves, 45)) console.log(`${String(c).padStart(4)}  ${name}`);
    console.log('\n-- top subjects --');
    for (const [name, c] of topN(subjects, 35)) console.log(`${String(c).padStart(4)}  ${name}`);

    console.log('\n=== B) Feasibility: total English plain-text books per candidate topic ===');
    for (const [vibe, topics] of Object.entries(CANDIDATE_TOPICS)) {
        console.log(`\n${vibe}`);
        for (const t of topics) {
            try {
                const c = await topicCount(t);
                console.log(`  ${String(c).padStart(5)}  ${t}`);
            } catch (e) {
                console.log(`  ERR   ${t} (${e.message})`);
            }
            await sleep(250);
        }
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
