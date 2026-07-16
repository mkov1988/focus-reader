/**
 * Serves book text: bundled static file first, then the R2 bucket.
 *
 * The hot set (curated front table + the 54 gate-rejected books that exist only
 * in the bundle) ships as static assets in public/books and must keep winning —
 * ASSETS.fetch goes straight to static files and never re-enters this function.
 * Everything else (the full 55,863-book mirror) lives in the focus-reader-books
 * R2 bucket under books/<id>.txt, bound here as BOOKS.
 *
 * Content is immutable (a Gutenberg id's text never changes), so both doors send
 * the same long-lived cache header the service worker's CacheFirst rule expects.
 */
export async function onRequestGet(ctx) {
    // SPA fallback gotcha: ASSETS answers a MISSING file with index.html and
    // status 200, so status alone can't detect a miss — sniff the content type
    // (same guard fetchHostedBook uses in library.ts).
    const asset = await ctx.env.ASSETS.fetch(ctx.request);
    const assetType = asset.headers.get('content-type') || '';
    if (asset.ok && !assetType.includes('text/html')) return asset;

    const object = await ctx.env.BOOKS.get(`books/${ctx.params.id}`);
    if (object === null) return new Response('Not found', { status: 404 });

    return new Response(object.body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    });
}
