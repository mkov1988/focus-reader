#!/usr/bin/env node
// rescue-quote-drops.mjs — put back beats that were dropped only because a
// quote's punctuation or italic markers differed from the source.
//
// Early chunk runs told verifiers to reject any quote that failed a
// fixed-string match, so good beats died over a comma or a Gutenberg _italic_
// marker. build-modernity.mjs now repairs quotes automatically (rewriting them
// to the exact source text), making those rejections obsolete. This walks the
// saved chunk task outputs, finds beats whose ONLY rejection reason was a
// quote mismatch, and restores them to data-src/modernity-src.json in their
// original order. Beats rejected for wrong facts, flatness, dead anchors, or
// missing content are left out.
//
// Usage: node scripts/modernity/rescue-quote-drops.mjs <task-output.json> [...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/modernity/rescue-quote-drops.mjs <task-output.json> [...]');
  process.exit(1);
}

const srcPath = path.join(ROOT, 'data-src', 'modernity-src.json');
const store = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

// a rejection is quote-cosmetic when it names the quote and nothing else
const QUOTE_ONLY = /quote (not verbatim|words|mismatch)|not verbatim/i;
const OTHER_FAULT = /wrong fact|invented|flat|anchor not found|endanchor|not in this edition|plot is wrong|contradicts|span too long|missing/i;

let rescued = 0, considered = 0;
for (const file of files) {
  if (!fs.existsSync(file)) { console.error(`missing: ${file}`); continue; }
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of run.result || []) {
    if (!r || !r.slug || !r.work) continue;
    const work = store[r.slug];
    if (!work) continue; // work never merged; a regeneration will cover it
    const have = new Set(work.beats.map((b) => b.title));
    const order = new Map(r.work.beats.map((b, i) => [b.title, i]));
    for (const v of r.verify?.verdicts || []) {
      if (v.keep !== false || have.has(v.title)) continue;
      const issue = v.issue || '';
      considered++;
      if (!QUOTE_ONLY.test(issue) || OTHER_FAULT.test(issue)) continue;
      const beat = r.work.beats.find((b) => b.title === v.title);
      if (!beat) continue;
      work.beats.push(beat);
      rescued++;
      console.log(`rescued ${r.slug}: ${v.title}`);
    }
    // restore generation order so stream beats stay in plot sequence
    work.beats.sort((a, b) => (order.get(a.title) ?? 0) - (order.get(b.title) ?? 0));
  }
}

fs.writeFileSync(srcPath, JSON.stringify(store, null, 1));
console.log(`\nrescued ${rescued} of ${considered} rejected beats (quote-cosmetic only)`);
console.log('next: npm run build:modernity  (drops any whose quote truly is absent)');
