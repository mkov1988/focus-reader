/**
 * Apply cold-reader verdicts to a harvested deep-pass chunk, in place.
 *
 *   node scripts/apply-deep-pass-verdicts.mjs <chunk.json> <verify-transcript-dir>
 *
 * Harvests {verdicts:[{id,tier,keep,reason}]} straight from the verify workflow's
 * journal (never through the orchestrator's context) and nulls out every rejected
 * snippet. A snippet with no verdict at all is also nulled: unverified is not kept.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [chunkPath, dir] = process.argv.slice(2);
if (!chunkPath || !dir) { console.error('usage: node scripts/apply-deep-pass-verdicts.mjs <chunk.json> <transcriptDir>'); process.exit(1); }

const verdicts = new Map(); // `${id}:${tier}` -> {keep, reason}
// Some verifiers label the id "161-short" instead of "161"; the tier field is
// still correct, so strip any tier suffix rather than throwing the verdict away.
const normId = (raw) => String(raw).trim().replace(/[-_:]?(short|story)$/i, '');
const add = (list) => {
    if (!Array.isArray(list)) return;
    for (const v of list) {
        if (!v || v.id == null || !v.tier) continue;
        verdicts.set(`${normId(v.id)}:${v.tier}`, { keep: !!v.keep, reason: v.reason || '' });
    }
};
const asObj = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    if (typeof v !== 'string') return null;
    try { return JSON.parse(v); } catch { return null; }
};
const walk = (node, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (typeof node === 'string' && node.includes('"verdicts"')) { const o = asObj(node); if (o) walk(o, depth + 1); return; }
    if (typeof node !== 'object') return;
    if (Array.isArray(node.verdicts)) { add(node.verdicts); return; }
    for (const v of Object.values(node)) walk(v, depth + 1);
};

const journal = path.join(dir, 'journal.jsonl');
if (existsSync(journal)) {
    for (const line of (await readFile(journal, 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        try { walk(JSON.parse(line)); } catch { /* partial line */ }
    }
}
if (!verdicts.size) {
    for (const f of (await readdir(dir)).filter((f) => /^agent-.*\.jsonl$/.test(f))) {
        for (const line of (await readFile(path.join(dir, f), 'utf8')).split('\n')) {
            if (!line.trim() || !line.includes('"verdicts"')) continue;
            try { walk(JSON.parse(line)); } catch { /* ignore */ }
        }
    }
}

const raw = JSON.parse(await readFile(path.resolve(chunkPath), 'utf8'));
const books = Array.isArray(raw) ? raw : raw.books || [];

const stat = { short: { had: 0, kept: 0, killed: 0, unjudged: 0 }, story: { had: 0, kept: 0, killed: 0, unjudged: 0 } };
const killed = [];
for (const b of books) {
    const id = String(b.id);
    for (const [tier, key] of [['short', 'snipShort'], ['story', 'snipStory']]) {
        if (!b[key]) continue;
        stat[tier].had++;
        const v = verdicts.get(`${id}:${tier}`);
        if (v && v.keep) { stat[tier].kept++; continue; }
        if (!v) stat[tier].unjudged++; else stat[tier].killed++;
        killed.push(`#${id} ${tier}: ${v ? v.reason : 'no verdict returned'}`);
        b[key] = null;
    }
}

await writeFile(path.resolve(chunkPath), JSON.stringify({ books }, null, 1));
const pct = (t) => (stat[t].had ? Math.round(((stat[t].had - stat[t].kept) / stat[t].had) * 100) : 0);
console.log(`Verdicts applied (${verdicts.size} received).`);
console.log(`  short: ${stat.short.kept}/${stat.short.had} kept (${stat.short.killed} rejected, ${stat.short.unjudged} unjudged) — kill rate ${pct('short')}%`);
console.log(`  story: ${stat.story.kept}/${stat.story.had} kept (${stat.story.killed} rejected, ${stat.story.unjudged} unjudged) — kill rate ${pct('story')}%`);
for (const k of killed.slice(0, 20)) console.log('  ' + k);
if (killed.length > 20) console.log(`  ...and ${killed.length - 20} more`);
