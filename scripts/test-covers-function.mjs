/**
 * Exercises functions/covers/[id].js locally with a mocked Pages context —
 * the static-first ladder (including the SPA-fallback sniff), the method
 * guard, the id shape, headers, and the R2 miss, without a deploy. (A preview
 * deploy's curl checks are still the truth for the real edge; this pins the
 * logic.)
 *
 *   node scripts/test-covers-function.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequest } = await import(pathToFileURL(path.join(ROOT, 'functions', 'covers', '[id].js')).href);

let failures = 0;
const check = (label, cond, detail = '') => {
    if (cond) { console.log(`ok  ${label}`); } else { console.error(`FAIL ${label} ${detail}`); failures++; }
};

// Static surface: 11.webp is bundled; everything else gets the SPA fallback
// (index.html, status 200) exactly like Pages does.
const STATIC = { '11.webp': 'static-webp-bytes' };
const STORE = {
    'covers/84.webp': { body: 'r2-webp-bytes', size: 13 },
};
const ctx = (method, id) => ({
    request: { method },
    params: { id },
    env: {
        ASSETS: {
            fetch: async () => STATIC[id]
                ? new Response(STATIC[id], { status: 200, headers: { 'Content-Type': 'image/webp' } })
                : new Response('<!doctype html><title>Focus Reader</title>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
        },
        BOOKS: { get: async (key) => STORE[key] ?? null },
    },
});

{
    const res = await onRequest(ctx('GET', '11.webp'));
    check('GET static cover: served from ASSETS', res.status === 200 && (await res.text()) === 'static-webp-bytes');
}
{
    const res = await onRequest(ctx('GET', '84.webp'));
    check('GET R2 cover: 200', res.status === 200);
    check('GET R2 cover: image/webp', res.headers.get('Content-Type') === 'image/webp');
    check('GET R2 cover: immutable cache', (res.headers.get('Cache-Control') || '').includes('immutable'));
    check('GET R2 cover: CORS wildcard', res.headers.get('Access-Control-Allow-Origin') === '*');
    check('GET R2 cover: body from the bucket', (await res.text()) === 'r2-webp-bytes');
}
{
    const res = await onRequest(ctx('HEAD', '84.webp'));
    check('HEAD R2 cover: 200 with Content-Length, empty body', res.status === 200 && res.headers.get('Content-Length') === '13' && res.body === null);
}
{
    const res = await onRequest(ctx('GET', '85.webp'));
    check('GET missing everywhere: 404 with CORS, not the SPA page', res.status === 404 && res.headers.get('Access-Control-Allow-Origin') === '*');
}
for (const bad of ['84.jpg', '../books/84.txt', '84', 'x.webp', '84.webp.txt']) {
    const res = await onRequest(ctx('GET', bad));
    check(`GET bad shape "${bad}": 404`, res.status === 404);
}
{
    const res = await onRequest(ctx('POST', '84.webp'));
    check('POST: 405 with Allow', res.status === 405 && res.headers.get('Allow') === 'GET, HEAD');
}

console.log('');
if (failures) { console.error(`${failures} failure(s).`); process.exit(1); }
console.log('covers function contract holds.');
