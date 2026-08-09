/**
 * Upload mirrored book text to the focus-reader-books R2 bucket — the step
 * that used to live only in terminal history. Reads credentials from .r2.env
 * at the repo root (gitignored; keys were moved out of mirror/ so a bulk sync
 * can never publish them into the public bucket).
 *
 *   node scripts/upload-r2.mjs --changed     upload just the files the last
 *                                            resweep touched (reads
 *                                            scripts/.resweep-report.json)
 *   node scripts/upload-r2.mjs --all         full sync of mirror/books
 *                                            (~19GB; run in a real terminal,
 *                                            it is resumable and incremental)
 *   node scripts/upload-r2.mjs --ids=26,996  specific books
 *
 * Bucket layout: books/<id>.txt (functions/books/[id].js reads exactly that
 * key). Uses mirror/tools/rclone.exe, falling back to rclone on PATH.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.r2.env');
const BOOKS_DIR = path.join(ROOT, 'mirror', 'books');
const RCLONE = existsSync(path.join(ROOT, 'mirror', 'tools', 'rclone.exe'))
    ? path.join(ROOT, 'mirror', 'tools', 'rclone.exe')
    : 'rclone';
const BUCKET = 'focus-reader-books';

if (!existsSync(ENV_PATH)) {
    console.error('.r2.env not found at the repo root. It needs:\n  R2_ACCESS_KEY_ID=...\n  R2_SECRET_ACCESS_KEY=...\n  R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com');
    process.exit(1);
}
const env = Object.fromEntries(
    readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
for (const k of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT']) {
    if (!env[k]) { console.error(`.r2.env is missing ${k}`); process.exit(1); }
}

const s3Flags = [
    '--s3-provider', 'Cloudflare',
    '--s3-access-key-id', env.R2_ACCESS_KEY_ID,
    '--s3-secret-access-key', env.R2_SECRET_ACCESS_KEY,
    '--s3-endpoint', env.R2_ENDPOINT,
    '--s3-no-check-bucket',
];
const run = (args) => {
    const r = spawnSync(RCLONE, [...args, ...s3Flags, '--progress'], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`rclone exited with ${r.status ?? r.error}`); process.exit(r.status ?? 1); }
};

const argIds = (process.argv.find((a) => a.startsWith('--ids=')) || '').split('=')[1];
if (process.argv.includes('--all')) {
    run(['sync', BOOKS_DIR, `:s3:${BUCKET}/books`]);
} else if (process.argv.includes('--changed') || argIds) {
    let ids;
    if (argIds) {
        ids = argIds.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
        const report = JSON.parse(readFileSync(path.join(ROOT, 'scripts', '.resweep-report.json'), 'utf8'));
        ids = report.changed['mirror/books'] ?? [];
    }
    if (!ids.length) { console.log('Nothing to upload.'); process.exit(0); }
    console.log(`Uploading ${ids.length} file(s) to ${BUCKET}/books ...`);
    // files-from wants relative paths; build the list on the fly via --include.
    const includes = ids.flatMap((id) => ['--include', `${id}.txt`]);
    run(['copy', BOOKS_DIR, `:s3:${BUCKET}/books`, ...includes]);
} else {
    console.log('Pass --changed (post-resweep), --all (full sync), or --ids=1,2,3');
}
