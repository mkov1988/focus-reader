/**
 * Serves book text: bundled static file first, then the R2 bucket.
 *
 * The hot set (curated front table + the 54 gate-rejected books that exist only
 * in the bundle) ships as static assets in public/books and must keep winning —
 * ASSETS.fetch goes straight to static files and never re-enters this function.
 * Everything else (the full 55,863-book mirror) lives in the focus-reader-books
 * R2 bucket under books/<id>.txt, bound here as BOOKS.
 *
 * Content is immutable (a Gutenberg id's text never changes). The static door
 * gets its long-lived cache header from public/_headers; the R2 door sets the
 * same header here, so both doors agree.
 *
 * CORS: Pages adds Access-Control-Allow-Origin to static assets, but Function
 * responses carry only what we set — the header here is what lets the Android
 * web QA harness (port 8090) open long-tail books at all. Public-domain text,
 * so the wildcard is correct. Set it on the 404 too or browsers can't even
 * read the status.
 *
 * onRequest (not onRequestGet) so HEAD probes work: with a GET-only export,
 * HEAD fell through to the SPA fallback and answered 200 text/html, which made
 * curl -I report long-tail books as present-but-HTML.
 */
export async function onRequest(ctx) {
    const method = ctx.request.method;
    if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    // SPA fallback gotcha: ASSETS answers a MISSING file with index.html and
    // status 200, so status alone can't detect a miss — sniff the content type
    // (same guard fetchHostedBook uses in library.ts).
    const asset = await ctx.env.ASSETS.fetch(ctx.request);
    const assetType = asset.headers.get('content-type') || '';
    if (asset.ok && !assetType.includes('text/html')) return asset;

    const object = await ctx.env.BOOKS.get(`books/${ctx.params.id}`);
    if (object === null) {
        return new Response(method === 'HEAD' ? null : 'Not found', {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' },
        });
    }

    return new Response(method === 'HEAD' ? null : object.body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
            ...(method === 'HEAD' ? { 'Content-Length': String(object.size) } : {}),
        },
    });
}
