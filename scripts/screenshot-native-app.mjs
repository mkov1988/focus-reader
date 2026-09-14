// Screenshot every screen of the native app (the product, ../focus-reader-android)
// through its react-native-web QA build, for design reference (Figma, reviews).
//
// Prerequisites (Michael's terminal, not a session — it takes ~10 minutes):
//   1. In the Android repo: `npm run qa:web`   (Expo web on http://localhost:8090)
//   2. Playwright with Chromium on this machine: `npm i -g playwright && npx playwright install chromium`
//   3. `node scripts/screenshot-native-app.mjs [runs]`
//      runs = comma list of dark-fresh, dark-returning, light-fresh, light-returning (default: all four)
//      QA_URL overrides the app URL; OUT overrides the output folder (default scripts/.screenshots, gitignored).
//
// What it captures, per run: Today (plus a full-length page), menu drawer, Library, Notebook,
// Reading Stats, Settings, Audio, About, Browse, search results, a vibe page (overview, full
// length, filtered), Modernity (list + one work), the updates panel, the saved toast, the
// book-open transition, and the reader in all five modes plus scrubber, playing, and peek.
// "returning" runs seed the persisted store (AsyncStorage = localStorage on web) with reading
// progress, saved books, and stats so the resume hero, Library, and Stats have content.
//
// Phone frames are 412×915 CSS px at 3× (Pixel-class); full-length frames are 1× so they
// stay under Figma's 4096 px image limit. A manifest.json in OUT lists every file with its
// label. External requests (covers, book text, modernity) are fetched by Node and served to
// the page, so corporate proxies and offline cover caches never block the render.
//
// Known limits: reanimated's frame loop never runs on web, so "playing" frames are static
// words; the drawer's switch is the browser default; there is no Android status bar.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
    try { return await import('playwright'); } catch { /* not local */ }
    try {
        const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
        return await import(path.join(globalRoot, 'playwright', 'index.mjs'));
    } catch { /* not global either */ }
    throw new Error('Playwright not found. Install it: npm i -g playwright && npx playwright install chromium');
}
const { chromium } = await loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'scripts', '.screenshots'));
const BASE = process.env.QA_URL || 'http://localhost:8090';
const RUNS = (process.argv[2] || 'dark-fresh,dark-returning,light-fresh,light-returning').split(',');
const VIEW = { width: 412, height: 915 };
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];

// ── External requests go through Node's fetch (proxies and CA bundles are honoured by Node, not by the headless browser)
const cache = new Map();
async function nodeFetch(url) {
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url);
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) headers[k] = v; });
    headers['access-control-allow-origin'] = '*';
    const res = { status: r.status, headers, body };
    if (r.status === 200 && body.length < 5e6) cache.set(url, res);
    return res;
}
async function routeExternal(context) {
    await context.route((u) => !u.href.startsWith('http://localhost') && !u.href.startsWith('http://127.0.0.1'), async (route) => {
        const req = route.request();
        if (req.method() !== 'GET') { await route.abort(); return; }
        try { const res = await nodeFetch(req.url()); await route.fulfill(res); }
        catch (e) { console.log('  route fail', req.url().slice(0, 80), e.message); await route.abort(); }
    });
}

// ── Seeded store states (AsyncStorage on web = localStorage, zustand persist envelope)
const RETURNING = {
    progressById: {
        '1342': { bookId: '1342', title: 'Pride and Prejudice', author: 'Jane Austen', currentIndex: 36000, totalTokens: 127359, lastReadAt: Date.now() - 86400000 },
        '84': { bookId: '84', title: 'Frankenstein; Or, The Modern Prometheus', author: 'Mary Wollstonecraft Shelley', currentIndex: 9800, totalTokens: 78000, lastReadAt: Date.now() - 5 * 86400000 },
    },
    savedById: {
        '2701': { bookId: '2701', title: 'Moby Dick; Or, The Whale', author: 'Herman Melville', savedAt: Date.now() - 2 * 86400000 },
        '11': { bookId: '11', title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', savedAt: Date.now() - 3 * 86400000 },
        '1661': { bookId: '1661', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', savedAt: Date.now() - 4 * 86400000 },
    },
    stats: { wordsRead: 45800, msRead: 2.2 * 3600 * 1000 },
};
function seedFor(run) {
    const [mode, kind] = run.split('-');
    const state = { mode, ...(kind === 'returning' ? RETURNING : {}) };
    return JSON.stringify({ state, version: 6 });
}

// ── Helpers
let run = '', idx = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function imagesSettled(page, ms = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const pending = await page.evaluate(() => Array.from(document.images).filter((i) => !i.complete).length);
        if (pending === 0) { await sleep(400); return; }
        await sleep(250);
    }
}
async function shot(page, name, label, opts = {}) {
    idx += 1;
    const file = `${run}/${String(idx).padStart(2, '0')}-${name}.png`;
    fs.mkdirSync(path.join(OUT, run), { recursive: true });
    await page.screenshot({ path: path.join(OUT, file), ...opts });
    manifest.push({ run, index: idx, name, label, file, kind: 'phone', width: VIEW.width, height: VIEW.height });
    console.log('  📸', file);
}
async function shotFull(page, name, label, cap = 4000) {
    const extra = await page.evaluate(() => {
        let best = 0;
        for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 4) best = Math.max(best, el.scrollHeight - el.clientHeight);
        }
        return best;
    });
    if (extra < 24) { console.log('  (fits in one screen:', name, ')'); return; }
    const target = Math.min(cap, VIEW.height + extra + 24);
    await page.setViewportSize({ width: VIEW.width, height: target });
    await sleep(1000);
    await imagesSettled(page, 4000);
    idx += 1;
    const file = `${run}/${String(idx).padStart(2, '0')}-${name}-full.png`;
    await page.screenshot({ path: path.join(OUT, file), scale: 'css' });
    manifest.push({ run, index: idx, name: `${name}-full`, label: `${label} (full length)`, file, kind: 'full', width: VIEW.width, height: target });
    console.log('  📜', file, `${target}px`);
    await page.setViewportSize(VIEW);
    await sleep(700);
}
async function step(name, fn) {
    try { await fn(); } catch (e) { console.log(`  ✗ ${name}: ${String(e).split('\n')[0].slice(0, 200)}`); }
}
const V = (loc) => loc.locator('visible=true');
const byLabel = (page, label) => V(page.getByLabel(label, { exact: true })).last();
const byText = (page, text) => V(page.getByText(text, { exact: true })).last();
async function openMenu(page) {
    for (let i = 0; i < 4; i++) {
        const menu = page.locator('[aria-label="Menu"]:visible');
        if (await menu.count()) { await menu.last().click(); await sleep(600); return; }
        const backBtn = page.locator('[aria-label^="Back"]:visible');
        if (await backBtn.count()) { await backBtn.last().click(); await sleep(700); } else break;
    }
    throw new Error('no Menu button on this screen');
}
async function goVia(page, text) { await openMenu(page); await byText(page, text).click(); await sleep(900); await imagesSettled(page); }
async function goHome(page) { await goVia(page, 'Today'); }
async function back(page) { await page.locator('[aria-label^="Back"]:visible').last().click(); await sleep(800); }

async function captureReader(page, tag, openFn) {
    await openFn();
    await sleep(180);
    await shot(page, `open-transition${tag}`, 'Book-open transition (cover springing open)');
    await sleep(2600);
    await shot(page, `reader-focus${tag}`, 'Reader — Focus (RSVP) mode, paused, chrome visible');
    for (const [label, key] of [['Ghost Trail', 'trail'], ['Sentence', 'sentence'], ['Paragraph', 'paragraph'], ['Hybrid', 'hybrid']]) {
        await step(`mode ${label}`, async () => {
            await byLabel(page, label).click(); await sleep(900);
            await shot(page, `reader-${key}${tag}`, `Reader — ${label} mode`);
        });
    }
    await step('mode Focus', async () => { await byLabel(page, 'Focus').click(); await sleep(600); });
    await step('scrubber', async () => {
        await byLabel(page, 'Navigate chapters and paragraphs').click(); await sleep(800);
        await shot(page, `reader-scrubber${tag}`, 'Reader — chapter / paragraph navigation face');
        await byLabel(page, 'Done navigating').click(); await sleep(500);
    });
    await step('play', async () => {
        await byLabel(page, 'Play').click(); await sleep(3800);
        await shot(page, `reader-playing${tag}`, 'Reader — playing, chrome hidden (immersive)');
        await page.mouse.click(VIEW.width / 2, VIEW.height * 0.55); await sleep(500);
        await shot(page, `reader-playing-peek${tag}`, 'Reader — playing, chrome peeked by a tap');
        const pause = byLabel(page, 'Pause');
        if (await pause.count()) { await pause.click(); await sleep(400); }
    });
    await step('back from reader', async () => { await back(page); await sleep(800); await imagesSettled(page); });
}

async function captureFresh(page) {
    await shot(page, 'today', "Today — home (fresh install: today's pick hero)");
    await shotFull(page, 'today', 'Today — home');
    await step('drawer', async () => { await openMenu(page); await shot(page, 'menu-drawer', 'Menu drawer (Browse / Audio / More)'); await byLabel(page, 'Close menu').click(); await sleep(500); });
    await step('library', async () => { await goVia(page, 'Library'); await shot(page, 'library-empty', 'Library — empty state'); });
    await step('notebook', async () => { await goVia(page, 'Notebook'); await shot(page, 'notebook', 'Notebook — empty state'); });
    await step('stats', async () => { await goVia(page, 'Reading Stats'); await shot(page, 'stats-empty', 'Reading Stats — nothing read yet'); await shotFull(page, 'stats-empty', 'Reading Stats — nothing read yet'); });
    await step('settings', async () => { await goVia(page, 'Settings'); await shot(page, 'settings', 'Settings — Make it yours'); await shotFull(page, 'settings', 'Settings'); });
    await step('audio', async () => { await openMenu(page); await byLabel(page, 'Audio settings').click(); await sleep(900); await shot(page, 'audio', 'Audio — narration & voice'); });
    await step('about', async () => { await goVia(page, 'About'); await shot(page, 'about', 'About'); await shotFull(page, 'about', 'About'); });
    await step('browse', async () => {
        await goHome(page);
        await byText(page, 'see all').click(); await sleep(1200); await imagesSettled(page);
        await shot(page, 'browse', 'Browse — every curated book ("see all")');
        await byLabel(page, 'Search all books').fill('sherlock');
        await page.keyboard.press('Enter'); await sleep(2500); await imagesSettled(page);
        await shot(page, 'search-results', 'Search results — "sherlock"');
    });
    await step('vibe', async () => {
        await goHome(page);
        await byText(page, 'Cozy Corners').click(); await sleep(1200); await imagesSettled(page);
        await shot(page, 'vibe-cozy', 'Vibe page — Cozy Corners (overview)');
        await shotFull(page, 'vibe-cozy', 'Vibe page — Cozy Corners');
        const chip = byText(page, 'Short reads');
        if (await chip.count()) {
            await chip.click(); await sleep(1000); await imagesSettled(page);
            await shot(page, 'vibe-cozy-filtered', 'Vibe page — Cozy Corners, "Short reads" chip (grid)');
        }
    });
    await step('modernity', async () => {
        await goHome(page);
        await byText(page, 'Open the streams').click(); await sleep(3500); await imagesSettled(page);
        await shot(page, 'modernity', 'Modernity — the works list');
        const row = V(page.getByText(/^\d+ clips · /)).first();
        if (await row.count()) {
            await row.click(); await sleep(3000); await imagesSettled(page);
            await shot(page, 'modernity-work', 'Modernity — one work, the clip stream');
            await shotFull(page, 'modernity-work', 'Modernity — one work', 3000);
        }
    });
    await step('updates', async () => {
        await goHome(page);
        await V(page.getByLabel(/Version .*Check for updates/)).last().click(); await sleep(1200);
        await shot(page, 'updates-panel', 'Updates panel (version line tapped)');
        const close = byLabel(page, 'Close updates');
        if (await close.count()) await close.click(); else await byLabel(page, 'Close').click();
        await sleep(500);
    });
    await step('toast', async () => {
        await goHome(page);
        await V(page.getByLabel(/^Save .* for later$/)).first().click(); await sleep(450);
        await shot(page, 'toast-saved', 'Toast — "Saved for later" after tapping a cover ribbon');
    });
    await step('reader', async () => {
        await goHome(page);
        await captureReader(page, '', async () => { await byText(page, 'Start Reading').click(); });
    });
}

async function captureReturning(page) {
    await shot(page, 'today-returning', 'Today — returning reader (resume hero with "Previously…" recap)');
    await shotFull(page, 'today-returning', 'Today — returning reader');
    await step('library', async () => { await goVia(page, 'Library'); await shot(page, 'library', 'Library — Reading + Saved for later'); await shotFull(page, 'library', 'Library'); });
    await step('stats', async () => { await goVia(page, 'Reading Stats'); await shot(page, 'stats', 'Reading Stats — with reading history'); await shotFull(page, 'stats', 'Reading Stats'); });
    await step('vibe continue', async () => {
        await goHome(page);
        await byText(page, 'Tangled Sheets').click(); await sleep(1200); await imagesSettled(page);
        await shot(page, 'vibe-tangled', 'Vibe page — Tangled Sheets (with "Where you left off")');
        const cont = byText(page, 'Continue');
        if (await cont.count()) { await cont.click(); await sleep(900); await shot(page, 'vibe-tangled-continue', 'Vibe page — "Continue" chip'); }
    });
    await step('resume reader', async () => {
        await goHome(page);
        await captureReader(page, '-resume', async () => { await byText(page, 'Resume').click(); });
    });
}

// ── Main
const browser = await chromium.launch();
for (run of RUNS) {
    idx = 0;
    console.log(`\n▶ run ${run}`);
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await routeExternal(context);
    context.setDefaultTimeout(12000);
    const seed = seedFor(run);
    await context.addInitScript((s) => { try { localStorage.setItem('focus-reader-state', s); } catch {} }, seed);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  PAGE ERR', String(e).slice(0, 160)));
    await page.goto(BASE, { waitUntil: 'load', timeout: 300000 });
    await sleep(2500); await imagesSettled(page, 8000);
    if (run.endsWith('fresh')) await captureFresh(page); else await captureReturning(page);
    await context.close();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
await browser.close();
console.log(`\n✓ ${manifest.length} screenshots in manifest`);
