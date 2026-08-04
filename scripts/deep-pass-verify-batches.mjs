/**
 * Split a harvested chunk's snippets into cold-reader verification batches.
 *
 *   node scripts/deep-pass-verify-batches.mjs <chunk.json> [booksPerBatch=3]
 *
 * Writes scripts/deep-starts/verify/vbatch-NNN.json, each holding a few books'
 * snippet spans ({id,title,author,tier,anchor,endAnchor,teaser}) for a verifier
 * agent to locate in mirror text and judge exactly as a stranger would meet it.
 * Prints BATCHES=<n> for the orchestrator.
 */
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts', 'deep-starts', 'verify');

const chunkPath = process.argv[2];
const per = Number(process.argv[3]) || 3;
if (!chunkPath) { console.error('usage: node scripts/deep-pass-verify-batches.mjs <chunk.json> [booksPerBatch]'); process.exit(1); }

const titles = {};
const bdir = path.join(ROOT, 'scripts', 'deep-starts', 'batches');
if (existsSync(bdir)) {
    for (const f of await readdir(bdir)) {
        if (!f.endsWith('.json')) continue;
        for (const b of JSON.parse(await readFile(path.join(bdir, f), 'utf8'))) titles[String(b.id)] = b;
    }
}

const raw = JSON.parse(await readFile(path.resolve(chunkPath), 'utf8'));
const books = Array.isArray(raw) ? raw : raw.books || [];

const items = [];
for (const b of books) {
    const id = String(b.id);
    const snips = [];
    for (const [tier, s] of [['short', b.snipShort], ['story', b.snipStory]]) {
        if (s && s.anchor && s.endAnchor) snips.push({ tier, anchor: s.anchor, endAnchor: s.endAnchor, teaser: s.teaser });
    }
    if (snips.length) items.push({ id, title: (titles[id] || {}).title || null, author: (titles[id] || {}).author || null, snippets: snips });
}

await mkdir(OUT, { recursive: true });
for (const f of await readdir(OUT).catch(() => [])) if (f.startsWith('vbatch-')) await unlink(path.join(OUT, f));

let n = 0;
for (let i = 0; i < items.length; i += per) {
    await writeFile(path.join(OUT, `vbatch-${String(n).padStart(3, '0')}.json`), JSON.stringify(items.slice(i, i + per), null, 1));
    n++;
}
console.log(`BATCHES=${n} BOOKS=${items.length} SNIPPETS=${items.reduce((s, i) => s + i.snippets.length, 0)}`);
