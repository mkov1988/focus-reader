/**
 * Serves cover images: bundled static file first, then the R2 bucket.
 *
 * Twin of functions/books/[id].js for covers/<id>.webp. Until November 2026
 * the 1,468 curated covers existed only as Pages static assets (plus
 * Michael's disk and the backup bucket): a deploy that missed one deleted it
 * from production, which is why the deploy guard and fetch-data-plane.mjs
 * exist. The same files now also live in the focus-reader-books bucket under
 * covers/<id>.webp (put there by .github/workflows/r2-hot-set.yml), and this
 * door serves any cover the static surface lacks — including, later, covers
 * for the long tail, which can never be static (Pages caps a deploy at 20k
 * files).
 *
 * Static assets keep winning on purpose: they are free and unmetered, while
 * every Function invocation counts against the Workers free plan's daily
 * request quota. The bucket is the source of truth; the static copy is a
 * cache of its hot set.
 *
 * Same conventions as the books door: onRequest (not onRequestGet) so HEAD
 * probes work; SPA-fallback sniff on the static answer (ASSETS answers a
 * missing file with index.html and status 200); immutable cache (a cover for
 * a Gutenberg id never changes); CORS wildcard on 200 and 404.
 */
const ID_SHAPE = /^\d+\.webp$/;

export async function onRequest(ctx) {
    const method = ctx.request.method;
    if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const asset = await ctx.env.ASSETS.fetch(ctx.request);
    const assetType = asset.headers.get('content-type') || '';
    if (asset.ok && !assetType.includes('text/html')) return asset;

    const notFound = () => new Response(method === 'HEAD' ? null : 'Not found', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
    });
    const id = String(ctx.params.id ?? '');
    // Strict shape: this door serves covers, not the bucket.
    if (!ID_SHAPE.test(id)) return notFound();

    const object = await ctx.env.BOOKS.get(`covers/${id}`);
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
