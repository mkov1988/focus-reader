/**
 * Serves cover images: bundled static file first, then the R2 bucket.
 *
 * Mirrors functions/books/[id].js. The hot-set covers ship as static assets
 * in public/covers and must keep winning — ASSETS.fetch goes straight to
 * static files. Long-tail and pipeline-generated covers live in the
 * focus-reader-books R2 bucket under covers/<id>.webp (same BOOKS binding,
 * different prefix; the primary bucket has no covers/ prefix until the
 * cover pipeline uploads one — until then this door just 404s cleanly).
 *
 * Why this door matters even before R2 has covers: without it, a missing
 * cover fell through to the SPA fallback and answered 200 text/html WITH
 * public/_headers' "max-age=31536000, immutable" — clients pinned a year of
 * HTML at an image URL and never saw a later backfill. A real 404 (no cache
 * header) lets the app fall back to its generated cover and re-check later.
 *
 * The request path is /covers/<id>.webp, so ctx.params.id arrives WITH the
 * .webp suffix — the R2 key uses it as-is. The shape check keeps arbitrary
 * paths from turning into R2 lookups.
 */
export async function onRequest(ctx) {
    const method = ctx.request.method;
    if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const notFound = () =>
        new Response(method === 'HEAD' ? null : 'Not found', {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' },
        });

    if (!/^\d+\.webp$/.test(ctx.params.id)) return notFound();

    // SPA fallback gotcha: ASSETS answers a MISSING file with index.html and
    // status 200, so sniff the content type instead of trusting status.
    const asset = await ctx.env.ASSETS.fetch(ctx.request);
    const assetType = asset.headers.get('content-type') || '';
    if (asset.ok && !assetType.includes('text/html')) return asset;

    const object = await ctx.env.BOOKS.get(`covers/${ctx.params.id}`);
    if (object === null) return notFound();

    return new Response(method === 'HEAD' ? null : object.body, {
        headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
            ...(method === 'HEAD' ? { 'Content-Length': String(object.size) } : {}),
        },
    });
}
