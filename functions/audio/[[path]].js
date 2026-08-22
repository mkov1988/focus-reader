/**
 * Serves narration audio and timing from R2: audio/<id>/<voice>/seg-NNN.opus
 * and audio/<id>/<voice>/timing-v1.json, uploaded by
 * scripts/upload-audio-r2.mjs into the focus-reader-books bucket (same BOOKS
 * binding as the books door — one bucket, audio/ prefix, so backup-r2.mjs
 * covers it with no new credentials).
 *
 * Mirrors functions/books/[id].js conventions: onRequest (not onRequestGet)
 * so HEAD probes work; immutable cache (a shipped recording never changes — a
 * fix ships as new keys); CORS wildcard on success AND 404 so the web QA
 * harness can read statuses. Unlike the books door there is no ASSETS.fetch
 * first — narration never ships as a static asset, so the SPA-fallback sniff
 * has nothing to win here and R2 is the only source.
 *
 * No Range support by design: the app downloads whole segments to its disk
 * cache and plays locally (docs/narration-plan.md §9) — segments are a few MB
 * on purpose. The strict path shape keeps this door from becoming a generic
 * bucket browser.
 */
const PATH_SHAPE = /^\d+\/[a-z]+\/(seg-\d{3}\.opus|timing-v1\.json)$/;

export async function onRequest(ctx) {
    const method = ctx.request.method;
    if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const rel = Array.isArray(ctx.params.path) ? ctx.params.path.join('/') : String(ctx.params.path ?? '');
    if (!PATH_SHAPE.test(rel)) {
        return new Response(method === 'HEAD' ? null : 'Not found', {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' },
        });
    }

    const object = await ctx.env.BOOKS.get(`audio/${rel}`);
    if (object === null) {
        return new Response(method === 'HEAD' ? null : 'Not found', {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' },
        });
    }

    return new Response(method === 'HEAD' ? null : object.body, {
        headers: {
            'Content-Type': rel.endsWith('.opus') ? 'audio/ogg' : 'application/json',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
            ...(method === 'HEAD' ? { 'Content-Length': String(object.size) } : {}),
        },
    });
}
