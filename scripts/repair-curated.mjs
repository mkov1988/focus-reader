/**
 * Repair textless editions in src/data/curated.json.
 *
 * Some curated entries point at a Gutenberg id that has no plain-text edition at
 * any standard URL (they 404), so they can't be read or mirrored. This finds them
 * (any curated id with no mirrored file in public/books/), re-resolves each to a
 * readable edition of the same title via Gutendex (matching the author, verifying
 * real text with a HEAD request), and rewrites the entry's id/textUrl/coverUrl.
 *
 * Run AFTER `npm run mirror:books`, then run mirror:books again to fetch the
 * repaired ids. Entries that can't be resolved are left untouched and reported.
 *
 *   node scripts/repair-curated.mjs            repair in place
 *   node scripts/repair-curated.mjs --dry      report only, don't write
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURATED_PATH = path.join(ROOT, 'src', 'data', 'curated.json');
const BOOKS_DIR = path.join(ROOT, 'public', 'books');
const API = 'https://gutendex.com/books';
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (t) => t.trim().toLowerCase().replace(/centre/g, 'center').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
const lastName = (a) => (a || '').split(/[ ,]/).filter(Boolean).pop()?.toLowerCase() || '';

function pickTextUrl(formats) {
    const pref = ['text/plain; charset=utf-8', 'text/plain; charset=us-ascii', 'text/plain'];
    for (const k of pref) if (formats[k] && !formats[k].endsWith('.zip')) return formats[k];
    const fb = Object.keys(formats).find((k) => k.startsWith('text/plain') && !formats[k].endsWith('.zip'));
    return fb ? formats[fb] : undefined;
}

async function getJson(url, tries = 3) {
    let err;
    for (let i = 0; i < tries; i++) {
        try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
        catch (e) { err = e; await sleep(700 * (i + 1)); }
    }
    throw err;
}

/** Confirm a candidate id actually has readable text (HEAD the canonical URLs). */
async function readable(id) {
    for (const url of [
        `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
        `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    ]) {
        try { const r = await fetch(url, { method: 'HEAD', redirect: 'follow' }); if (r.ok && Number(r.headers.get('content-length')) > 8000) return true; }
        catch { /* next */ }
    }
    return false;
}

/** Find a readable edition of the same title+author. */
async function resolve(entry) {
    const data = await getJson(`${API}?search=${encodeURIComponent(entry.title + ' ' + lastName(entry.author))}&languages=en`);
    const want = norm(entry.title);
    const author = lastName(entry.author);
    const candidates = (data.results || [])
        .filter((b) => pickTextUrl(b.formats || {}))
        .filter((b) => {
            const t = norm(b.title);
            const titleOk = t === want || t.includes(want) || want.includes(t);
            const authorOk = !author || author === 'unknown' || (b.authors || []).some((a) => (a.name || '').toLowerCase().includes(author));
            return titleOk && authorOk;
        })
        .sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
    for (const c of candidates) {
        if (await readable(String(c.id))) {
            return {
                id: String(c.id),
                title: c.title,
                author: (c.authors?.[0]?.name || entry.author),
                coverUrl: c.formats?.['image/jpeg'],
                textUrl: pickTextUrl(c.formats),
            };
        }
    }
    return null;
}

async function main() {
    const curated = JSON.parse(await readFile(CURATED_PATH, 'utf8'));
    const dead = curated.filter((b) => b.id && !existsSync(path.join(BOOKS_DIR, `${b.id}.txt`)));
    console.log(`Dead (unmirrored) curated entries: ${dead.length}\n`);

    let fixed = 0;
    const unresolved = [];
    for (const entry of dead) {
        const oldId = entry.id;
        let repl = null;
        try { repl = await resolve(entry); } catch { /* report below */ }
        await sleep(300);
        if (!repl) { unresolved.push(`${oldId} ${entry.title}`); console.log(`  ✗ ${oldId}  ${entry.title.slice(0, 48)}  (no readable edition found)`); continue; }
        console.log(`  ✓ ${oldId} -> ${repl.id}  ${repl.title.slice(0, 48)}`);
        // Rewrite the entry in place (author often formats "Last, First"; keep the
        // app's existing display author unless it was Unknown).
        entry.id = repl.id;
        entry.textUrl = repl.textUrl;
        if (repl.coverUrl) entry.coverUrl = repl.coverUrl;
        if (!entry.author || entry.author === 'Unknown') entry.author = repl.author;
        fixed++;
    }

    console.log(`\nRepaired ${fixed}, unresolved ${unresolved.length}.`);
    if (unresolved.length) console.log('Unresolved:\n  ' + unresolved.join('\n  '));
    if (DRY) { console.log('\n--dry: not writing.'); return; }
    await writeFile(CURATED_PATH, JSON.stringify(curated));
    console.log(`\nWrote ${CURATED_PATH}. Next: run mirror:books to fetch the repaired ids.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
