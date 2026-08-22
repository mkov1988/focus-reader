/**
 * Exercises functions/audio/[[path]].js locally with a mocked Pages context —
 * the door's method guard, path shape, headers, and R2 miss behavior, without
 * a deploy. (The preview-deploy curl checks in docs/narration-plan.md §11 are
 * still the truth for the real edge; this pins the logic.)
 *
 *   node scripts/test-audio-function.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequest } = await import(pathToFileURL(path.join(ROOT, 'functions', 'audio', '[[path]].js')).href);

let failures = 0;
const check = (label, cond, detail = '') => {
    if (cond) { console.log(`ok  ${label}`); } else { console.error(`FAIL ${label} ${detail}`); failures++; }
};

const STORE = {
    'audio/84/marlowe/seg-000.opus': { body: 'opus-bytes', size: 10 },
    'audio/84/marlowe/timing-v1.json': { body: '{"v":1}', size: 7 },
};
const ctx = (method, rel) => ({
    request: { method },
    params: { path: rel.split('/') },
    env: { BOOKS: { get: async (key) => STORE[key] ?? null } },
});

{
    const res = await onRequest(ctx('GET', '84/marlowe/seg-000.opus'));
    check('GET segment: 200', res.status === 200);
    check('GET segment: audio/ogg', res.headers.get('Content-Type') === 'audio/ogg');
    check('GET segment: immutable cache', (res.headers.get('Cache-Control') || '').includes('immutable'));
    check('GET segment: CORS wildcard', res.headers.get('Access-Control-Allow-Origin') === '*');
}
{
    const res = await onRequest(ctx('GET', '84/marlowe/timing-v1.json'));
    check('GET timing: 200 application/json', res.status === 200 && res.headers.get('Content-Type') === 'application/json');
}
{
    const res = await onRequest(ctx('HEAD', '84/marlowe/seg-000.opus'));
    check('HEAD: 200 with Content-Length, empty body', res.status === 200 && res.headers.get('Content-Length') === '10' && res.body === null);
}
{
    const res = await onRequest(ctx('GET', '84/marlowe/seg-001.opus'));
    check('GET missing object: 404 with CORS', res.status === 404 && res.headers.get('Access-Control-Allow-Origin') === '*');
}
for (const bad of ['84/marlowe/../../books/84', '84/Marlowe/seg-000.opus', '84/marlowe/seg-0000.opus', 'x/marlowe/seg-000.opus', '84/marlowe/anything.txt', '84/marlowe/timing-v2.json']) {
    const res = await onRequest(ctx('GET', bad));
    check(`GET bad shape "${bad}": 404`, res.status === 404);
}
{
    const res = await onRequest(ctx('POST', '84/marlowe/seg-000.opus'));
    check('POST: 405 with Allow', res.status === 405 && res.headers.get('Allow') === 'GET, HEAD');
}

console.log('');
if (failures) { console.error(`${failures} failure(s).`); process.exit(1); }
console.log('audio function contract holds.');
