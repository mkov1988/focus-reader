/**
 * Harvest a deep-pass finder workflow's structured agent returns into a chunk file
 * WITHOUT routing the payload through the orchestrator's context.
 *
 *   node scripts/harvest-deep-pass.mjs <workflow-transcript-dir> <out.json>
 *
 * Prefers journal.jsonl (one record per completed agent()); falls back to scanning
 * agent-*.jsonl for the StructuredOutput tool call each finder is forced to make.
 * Both paths tolerate a workflow that died partway: whatever finished is kept.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node scripts/harvest-deep-pass.mjs <transcriptDir> <out.json>'); process.exit(1); }

const books = new Map();
const addFrom = (val) => {
    if (!val || typeof val !== 'object') return 0;
    const list = Array.isArray(val) ? val : (Array.isArray(val.books) ? val.books : null);
    if (!list) return 0;
    let n = 0;
    for (const b of list) {
        if (b && b.id != null && !books.has(String(b.id))) { books.set(String(b.id), b); n++; }
    }
    return n;
};

const asObj = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    if (typeof v !== 'string') return null;
    try { return JSON.parse(v); } catch { return null; }
};

// Deep-walk any JSON blob looking for a {books:[...]} payload.
const walk = (node, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (typeof node === 'string' && node.includes('"books"')) { addFrom(asObj(node)); return; }
    if (typeof node !== 'object') return;
    if (Array.isArray(node.books)) { addFrom(node); return; }
    for (const v of Object.values(node)) walk(v, depth + 1);
};

const journal = path.join(dir, 'journal.jsonl');
let source = 'journal';
if (existsSync(journal)) {
    for (const line of (await readFile(journal, 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        try { walk(JSON.parse(line)); } catch { /* partial trailing line */ }
    }
}

if (!books.size) {
    source = 'agent transcripts';
    for (const f of (await readdir(dir)).filter((f) => /^agent-.*\.jsonl$/.test(f))) {
        for (const line of (await readFile(path.join(dir, f), 'utf8')).split('\n')) {
            if (!line.trim() || !line.includes('"books"')) continue;
            try { walk(JSON.parse(line)); } catch { /* ignore */ }
        }
    }
}

await writeFile(path.resolve(out), JSON.stringify({ books: [...books.values()] }, null, 1));
const withShort = [...books.values()].filter((b) => b.snipShort).length;
const withStory = [...books.values()].filter((b) => b.snipStory).length;
console.log(`Harvested ${books.size} books from ${source} -> ${out} (snipShort ${withShort}, snipStory ${withStory})`);
