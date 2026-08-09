/**
 * Pull agent results straight out of a workflow's journal into a chunk file,
 * so 600 book records never have to travel through the orchestrator's context.
 *
 *   node scripts/deep-starts/collect-journal.mjs <transcriptDir> <out.json>
 *
 * Tolerant by design: scans every journal line for any nested object holding a
 * `books` array of {id, anchor} records, dedupes by id, and writes {books:[...]}.
 * Falls back to the per-agent transcripts if the journal yields nothing.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
    console.error('usage: node collect-journal.mjs <transcriptDir> <out.json>');
    process.exit(1);
}

const found = new Map();

function harvest(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) { for (const v of node) harvest(v, depth + 1); return; }
    if (Array.isArray(node.books)) {
        for (const b of node.books) {
            if (b && (typeof b.id === 'string' || typeof b.id === 'number') && typeof b.anchor === 'string') {
                found.set(String(b.id), { ...b, id: String(b.id) });
            }
        }
    }
    for (const v of Object.values(node)) harvest(v, depth + 1);
}

function scanText(text) {
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        harvest(obj);
        // Structured output sometimes rides along as a JSON *string* field.
        const strings = [];
        (function collect(n, d = 0) {
            if (!n || typeof n !== 'object' || d > 8) return;
            for (const v of Object.values(n)) {
                if (typeof v === 'string' && v.includes('"books"')) strings.push(v);
                else collect(v, d + 1);
            }
        })(obj);
        for (const s of strings) {
            try { harvest(JSON.parse(s)); } catch { /* not JSON, ignore */ }
        }
    }
}

async function main() {
    const journal = path.join(dir, 'journal.jsonl');
    try { scanText(await readFile(journal, 'utf8')); } catch { /* no journal */ }
    if (found.size === 0) {
        for (const f of await readdir(dir)) {
            if (f.startsWith('agent-') && f.endsWith('.jsonl')) scanText(await readFile(path.join(dir, f), 'utf8'));
        }
    }
    const books = [...found.values()];
    await writeFile(path.resolve(out), JSON.stringify({ books }, null, 1));
    console.log(`COLLECTED=${books.length} -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
