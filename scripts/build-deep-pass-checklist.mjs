/**
 * Regenerate DEEP-PASS-CHECKLIST.md — the human-readable progress board for the
 * top-800 deep pass. One line per book, checked off as it completes, with what
 * landed for it (scenes / 1-minute snippet / 3-5 minute story / details / meta).
 *
 * Runs automatically at the end of every merge-deep-pass.mjs merge, so the
 * checklist is always current with zero thinking. Also runnable by hand:
 *
 *   node scripts/build-deep-pass-checklist.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'deep-starts');
const OUT = path.join(ROOT, 'DEEP-PASS-CHECKLIST.md');

const loadJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);

export async function buildChecklist() {
    const queue = await loadJson(path.join(DIR, 'deep-pass-queue.json'), []);
    const done = new Set(await loadJson(path.join(DIR, 'deep-pass-done.json'), []));
    const snippets = await loadJson(path.join(DIR, 'snippets.json'), {});
    const details = await loadJson(path.join(DIR, 'details.json'), {});
    const scenesSrc = await loadJson(path.join(ROOT, 'scripts', 'scenes-src.json'), {});
    const deepScenes = await loadJson(path.join(DIR, 'deep-scenes.json'), {});
    const meta = await loadJson(path.join(DIR, 'meta.json'), {});

    const n = queue.filter((b) => done.has(b.id)).length;
    const pct = ((n / queue.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(n / queue.length * 30)).padEnd(30, '░');

    const lines = [];
    lines.push('# Deep pass checklist — top 800 books');
    lines.push('');
    lines.push('Auto-updated by every merge. Do not edit by hand; the ledgers are the truth.');
    lines.push('');
    lines.push(`**${n} / ${queue.length} done (${pct}%)**`);
    lines.push('');
    lines.push('`' + bar + '`');
    lines.push('');
    lines.push('Marks: **S** scenes · **1m** quick-hit snippet · **3-5m** story snippet · **D** details · **M** hook/meta');
    lines.push('');

    for (let c = 0; c < queue.length; c += 100) {
        lines.push(`## Books ${c + 1}–${Math.min(c + 100, queue.length)}`);
        lines.push('');
        for (const b of queue.slice(c, c + 100)) {
            const isDone = done.has(b.id);
            let got = '';
            if (isDone) {
                const parts = [];
                if (scenesSrc[b.id] || deepScenes[b.id]) parts.push('S');
                const sn = snippets[b.id] || {};
                if (sn.short) parts.push('1m');
                if (sn.story) parts.push('3-5m');
                if (details[b.id]) parts.push('D');
                if (meta[b.id]) parts.push('M');
                got = parts.length ? `  \`${parts.join(' ')}\`` : '  `(non-narrative)`';
            }
            lines.push(`- [${isDone ? 'x' : ' '}] #${b.id} **${b.title}** — ${b.author}${got}`);
        }
        lines.push('');
    }

    await writeFile(OUT, lines.join('\n'));
    return { done: n, total: queue.length };
}

if (process.argv[1] && process.argv[1].endsWith('build-deep-pass-checklist.mjs')) {
    buildChecklist().then((r) => console.log(`Checklist written: ${r.done}/${r.total} done → DEEP-PASS-CHECKLIST.md`));
}
