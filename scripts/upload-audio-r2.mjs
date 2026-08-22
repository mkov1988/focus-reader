/**
 * Uploads finished narration audio to the focus-reader-books R2 bucket under
 * audio/<id>/<voice>/ — the keys functions/audio/[[path]].js serves. Same
 * credential and rclone conventions as upload-r2.mjs (.r2.env at the repo
 * root; mirror/tools/rclone.exe, falling back to rclone on PATH).
 *
 *   node scripts/upload-audio-r2.mjs --ids=84,1342,14838                 all personas
 *   node scripts/upload-audio-r2.mjs --ids=84 --voices=marlowe           narrower
 *   node scripts/upload-audio-r2.mjs --all                               every ok pair in work/
 *
 * Only pairs whose status.json says ok:true are uploaded — verify.mjs runs
 * before this, and nothing from a failing pair may ship. Uploaded files are
 * immutable forever (devices cache them for a year); a fixed recording ships
 * as new keys via a timing/manifest version bump, never by overwriting.
 * Run backup-r2.mjs after any upload.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'scripts', 'narration', 'work');
const ENV_PATH = path.join(ROOT, '.r2.env');
const RCLONE = existsSync(path.join(ROOT, 'mirror', 'tools', 'rclone.exe'))
    ? path.join(ROOT, 'mirror', 'tools', 'rclone.exe')
    : 'rclone';
const BUCKET = 'focus-reader-books';

if (!existsSync(ENV_PATH)) {
    console.error('.r2.env not found at the repo root (same file upload-r2.mjs uses).');
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

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';
const wantIds = arg('ids').split(',').map((s) => s.trim()).filter(Boolean);
const wantVoices = arg('voices').split(',').map((s) => s.trim()).filter(Boolean);
const ALL = process.argv.includes('--all');
if (!ALL && !wantIds.length) {
    console.error('Pass --ids=84,1342,14838 [--voices=marlowe,rowan,hazel] or --all');
    process.exit(1);
}

const pairs = [];
const ids = ALL
    ? (existsSync(WORK) ? readdirSync(WORK).filter((d) => /^\d+$/.test(d)) : [])
    : wantIds;
for (const id of ids) {
    const bookDir = path.join(WORK, id);
    if (!existsSync(bookDir)) { console.error(`${id}: no work dir — nothing finished for it.`); process.exit(1); }
    const voices = wantVoices.length
        ? wantVoices
        : readdirSync(bookDir).filter((d) => existsSync(path.join(bookDir, d, 'status.json')));
    for (const voice of voices) {
        const statusPath = path.join(bookDir, voice, 'status.json');
        if (!existsSync(statusPath) || !JSON.parse(readFileSync(statusPath, 'utf8')).ok) {
            console.error(`${id}/${voice}: not ok — run finish.mjs + verify.mjs first. Refusing to upload anything from this run.`);
            process.exit(1);
        }
        pairs.push({ id, voice, dir: path.join(bookDir, voice, 'out') });
    }
}
if (!pairs.length) { console.log('Nothing to upload.'); process.exit(0); }

for (const { id, voice, dir } of pairs) {
    console.log(`\n== ${id}/${voice} -> ${BUCKET}/audio/${id}/${voice}/`);
    const r = spawnSync(RCLONE, ['copy', dir, `:s3:${BUCKET}/audio/${id}/${voice}`, ...s3Flags, '--progress'], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`rclone exited with ${r.status ?? r.error}`); process.exit(r.status ?? 1); }
}
console.log(`\nUploaded ${pairs.length} book×voice pair(s). Run \`node scripts/backup-r2.mjs\` next.`);
