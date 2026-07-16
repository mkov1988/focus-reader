/**
 * Detector pass over the FULL bulk mirror (mirror/books/, ~55,863 books) plus a
 * download-ranked verification queue for the nightly agent grind.
 *
 * Writes (all under scripts/deep-starts/, gitignored working data):
 *   detector.json — { [id]: { start, conf } } detector best-guess for every book
 *   queue.json    — [{ id, dl, detStart, conf, preview }] sorted by downloads desc,
 *                   EXCLUDING the shipped 1,401 (already verified in
 *                   src/data/story-starts.json)
 *
 *   node scripts/deep-starts-pass.mjs
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStart } from './build-story-starts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR = path.join(ROOT, 'mirror', 'books');
const OUT_DIR = path.join(ROOT, 'scripts', 'deep-starts');

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const files = (await readdir(MIRROR)).filter((f) => f.endsWith('.txt'));
    const shipped = new Set(Object.keys(JSON.parse(await readFile(path.join(ROOT, 'src/data/story-starts.json'), 'utf8'))));

    const detector = {};
    const previews = {};
    let n = 0;
    const t0 = Date.now();
    for (const f of files) {
        const id = f.replace(/\.txt$/, '');
        const raw = await readFile(path.join(MIRROR, f), 'utf8');
        const r = resolveStart(raw);
        detector[id] = { start: r.start, conf: r.confidence };
        previews[id] = (r.preview || '').split(/\s+/).slice(0, 12).join(' ');
        if (++n % 5000 === 0) console.log(`  ${n}/${files.length}  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    }
    await writeFile(path.join(OUT_DIR, 'detector.json'), JSON.stringify(detector));

    const catalog = JSON.parse(await readFile(path.join(ROOT, 'mirror', 'catalog.json'), 'utf8'));
    const dl = Object.fromEntries(catalog.books.map((b) => [String(b.id), b.downloads || 0]));
    const queue = Object.keys(detector)
        .filter((id) => !shipped.has(id))
        .map((id) => ({ id, dl: dl[id] || 0, detStart: detector[id].start, conf: detector[id].conf, preview: previews[id] }))
        .sort((a, b) => b.dl - a.dl);
    await writeFile(path.join(OUT_DIR, 'queue.json'), JSON.stringify(queue));

    const confCounts = {};
    for (const q of queue) confCounts[q.conf] = (confCounts[q.conf] || 0) + 1;
    console.log(`\nDetector pass done: ${files.length} books in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
    console.log(`Queue: ${queue.length} books (shipped ${shipped.size} excluded), confidence: ${JSON.stringify(confCounts)}`);
    console.log(`Top of queue: ${queue.slice(0, 5).map((q) => `#${q.id}(${q.dl})`).join(' ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
