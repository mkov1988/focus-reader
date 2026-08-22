/**
 * Backs up the served corpus into the private focus-reader-books-backup R2
 * bucket, replacing the external-drive errand in docs/BACKUP.md. Three copies
 * across two failure domains: this machine's mirror/, the primary bucket, and
 * the backup bucket. (Both buckets share one Cloudflare account — the local
 * disk is the out-of-account copy.)
 *
 *   node scripts/backup-r2.mjs        full backup (safe to rerun; it syncs)
 *
 * What it copies:
 *   1. books/  primary bucket -> backup bucket, SERVER-SIDE (no local
 *      bandwidth; the primary was freshened from mirror/books first — run
 *      upload-r2.mjs before this if local files changed)
 *   2. mirror/catalog.json and mirror/_rejected.json (crawl + gate records)
 *   3. public/covers -> covers/ (spares a future cover re-crawl)
 *   4. audio/  primary bucket -> backup bucket, SERVER-SIDE (narration
 *      segments + timing files; run upload-audio-r2.mjs before this if a
 *      narration run shipped)
 *
 * Credentials: .r2.env at the repo root, same as upload-r2.mjs.
 * Run it (or the drive copy) after any mirror run or resweep.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.r2.env');
const RCLONE = existsSync(path.join(ROOT, 'mirror', 'tools', 'rclone.exe'))
    ? path.join(ROOT, 'mirror', 'tools', 'rclone.exe')
    : 'rclone';
const SRC_BUCKET = 'focus-reader-books';
const DST_BUCKET = 'focus-reader-books-backup';

const env = Object.fromEntries(
    readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const s3Flags = [
    '--s3-provider', 'Cloudflare',
    '--s3-access-key-id', env.R2_ACCESS_KEY_ID,
    '--s3-secret-access-key', env.R2_SECRET_ACCESS_KEY,
    '--s3-endpoint', env.R2_ENDPOINT,
    '--s3-no-check-bucket',
];
const run = (label, args) => {
    console.log(`\n== ${label}`);
    const r = spawnSync(RCLONE, [...args, ...s3Flags, '--transfers', '32', '--checkers', '32', '--stats', '30s', '--stats-one-line'], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`rclone exited with ${r.status ?? r.error}`); process.exit(r.status ?? 1); }
};

run('books: primary bucket -> backup bucket (server-side)', ['sync', `:s3:${SRC_BUCKET}/books`, `:s3:${DST_BUCKET}/books`]);
run('audio: primary bucket -> backup bucket (server-side)', ['sync', `:s3:${SRC_BUCKET}/audio`, `:s3:${DST_BUCKET}/audio`]);
run('catalog + gate records -> backup bucket', ['copy', path.join(ROOT, 'mirror'), `:s3:${DST_BUCKET}/mirror-meta`, '--include', 'catalog.json', '--include', '_rejected.json', '--include', '_failed.json']);
if (existsSync(path.join(ROOT, 'public', 'covers'))) {
    run('covers -> backup bucket', ['sync', path.join(ROOT, 'public', 'covers'), `:s3:${DST_BUCKET}/covers`]);
}

console.log('\nVerifying object counts...');
const count = (target) => {
    const r = spawnSync(RCLONE, ['size', target, '--json', ...s3Flags], { encoding: 'utf8' });
    try { return JSON.parse(r.stdout); } catch { return null; }
};
const src = count(`:s3:${SRC_BUCKET}/books`);
const dst = count(`:s3:${DST_BUCKET}/books`);
console.log(`primary books: ${src?.count} objects, ${(src?.bytes / 1e9).toFixed(2)} GB`);
console.log(`backup  books: ${dst?.count} objects, ${(dst?.bytes / 1e9).toFixed(2)} GB`);
const srcAudio = count(`:s3:${SRC_BUCKET}/audio`);
const dstAudio = count(`:s3:${DST_BUCKET}/audio`);
console.log(`primary audio: ${srcAudio?.count} objects, ${(srcAudio?.bytes / 1e9).toFixed(2)} GB`);
console.log(`backup  audio: ${dstAudio?.count} objects, ${(dstAudio?.bytes / 1e9).toFixed(2)} GB`);
if (!src || !dst || src.count !== dst.count || src.bytes !== dst.bytes
    || !srcAudio || !dstAudio || srcAudio.count !== dstAudio.count || srcAudio.bytes !== dstAudio.bytes) {
    console.error('MISMATCH — backup incomplete, rerun this script.');
    process.exit(1);
}
console.log('Backup verified: counts and bytes match.');
