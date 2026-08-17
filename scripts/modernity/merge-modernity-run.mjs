#!/usr/bin/env node
// merge-modernity-run.mjs — fold one Modernity chunk run into the store.
//
// Takes the task output file of a modernity chunk workflow (scripts/modernity/
// wf-chunk.js), applies the cold-reader verdicts, and merges surviving works
// into data-src/modernity-src.json. Quality gate per work:
//   - beats judged keep:false are dropped (logged)
//   - the whole work FAILS (not merged, queued for regeneration) when the
//     verifier says accuracyOk=false, or more than 30% of beats died, or
//     fewer than 12 beats survive
// Existing works in the store are never overwritten (hand fixes are safe).
// Verdicts and issues are appended to scripts/modernity/REPORT.md and
// failures to scripts/modernity/failed.json.
//
// After merging, run: npm run build:modernity && node scripts/build-modernity-queue.mjs
//
// Usage: node scripts/modernity/merge-modernity-run.mjs <task-output-file.json>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outFile = process.argv[2];
if (!outFile || !fs.existsSync(outFile)) {
  console.error('usage: node scripts/modernity/merge-modernity-run.mjs <task-output-file.json>');
  process.exit(1);
}

const run = JSON.parse(fs.readFileSync(outFile, 'utf8'));
const results = run.result || [];
const queue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-src', 'modernity-queue.json'), 'utf8'));
const queueBySlug = new Map(queue.works.map((w) => [w.slug, w]));
const srcPath = path.join(ROOT, 'data-src', 'modernity-src.json');
const store = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const failedPath = path.join(ROOT, 'scripts', 'modernity', 'failed.json');
const failed = fs.existsSync(failedPath) ? JSON.parse(fs.readFileSync(failedPath, 'utf8')) : [];
const reportPath = path.join(ROOT, 'scripts', 'modernity', 'REPORT.md');

let merged = 0, skipped = 0, failures = 0, droppedBeats = 0;
const reportLines = [`\n## Run merged ${new Date().toISOString().slice(0, 10)} (${path.basename(outFile)})\n`];

for (const r of results) {
  if (!r || !r.work || !r.slug) continue;
  const qw = queueBySlug.get(r.slug);
  if (!qw) { reportLines.push(`- ${r.slug}: NOT IN QUEUE, ignored`); continue; }
  if (store[r.slug]?.beats?.length) { skipped++; reportLines.push(`- ${r.slug}: already in store, skipped`); continue; }

  const verdicts = new Map((r.verify?.verdicts || []).map((v) => [v.title, v]));
  const kept = [], dropped = [], issues = [];
  for (const b of r.work.beats) {
    const v = verdicts.get(b.title);
    if (v && v.keep === false) { dropped.push(`${b.title} (${v.issue || 'rejected'})`); continue; }
    if (v && v.issue) issues.push(`${b.title}: ${v.issue}`);
    kept.push(b);
  }
  droppedBeats += dropped.length;

  const total = r.work.beats.length;
  const overall = r.verify?.overall || {};
  // accuracyOk=false alone is NOT a hard fail: verifiers set it over 2-3
  // fixable beats (chunk 1 evidence) — the per-beat verdicts carry the signal
  const failReasons = [];
  if (dropped.length / total > 0.3) failReasons.push(`${dropped.length}/${total} beats rejected`);
  if (kept.length < 12) failReasons.push(`only ${kept.length} beats survive`);
  if (!r.verify) failReasons.push('no verify result (unverified is not kept)');

  if (failReasons.length) {
    failures++;
    failed.push({ slug: r.slug, reason: failReasons.join('; '), notes: overall.notes || '', date: new Date().toISOString().slice(0, 10) });
    reportLines.push(`- **${r.slug}: FAILED** (${failReasons.join('; ')})`);
    continue;
  }

  store[r.slug] = {
    primaryId: qw.primaryId, ids: qw.ids, title: qw.title, author: qw.author,
    format: qw.format, register: qw.register,
    feelings: r.work.feelings, intensity: r.work.intensity, beats: kept,
  };
  merged++;
  reportLines.push(`- ${r.slug}: merged ${kept.length}/${total} beats${dropped.length ? `; dropped: ${dropped.join('; ')}` : ''}`);
  for (const i of issues) reportLines.push(`  - note: ${i}`);
  if (overall.notes) reportLines.push(`  - verifier: ${String(overall.notes).slice(0, 300)}`);
}

fs.writeFileSync(srcPath, JSON.stringify(store, null, 1));
fs.writeFileSync(failedPath, JSON.stringify(failed, null, 1));
fs.appendFileSync(reportPath, reportLines.join('\n') + '\n');

const doneCount = Object.keys(store).filter((k) => !k.startsWith('_') && store[k]?.beats?.length).length;
console.log(`merged ${merged}, skipped ${skipped}, failed ${failures}, beats dropped ${droppedBeats}`);
console.log(`store now holds ${doneCount}/${queue.works.length} works`);
console.log('next: npm run build:modernity && node scripts/build-modernity-queue.mjs');
