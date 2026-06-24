# Strategy: Accessing 60k Free Books (Native-First Design)

## Core Philosophy
**The Web App is a High-Fidelity Prototype ("Living Spec") for the future Native App.**
We will not build web-specific infrastructure (like serverless CORS proxies) for production. We will simply **simulate** the native behavior locally.

> **Static assets vs. web glue.** The "no web glue" rule targets *runtime* CORS proxies, meaning live compute that forwards arbitrary gutenberg requests per request. Mirroring a finite, curated set of files once into dumb static storage (a CDN bucket of cover images) is not that. It has no compute and no runtime forwarding, so it is allowed, and it is how we serve cover images. See §5.

## 1. The Source: Project Gutenberg
*   **Catalog**: **Gutendex API** (Clean JSON metadata).
*   **Content**: **Project Gutenberg EPUBs** (Direct file download).

## 2. The User Experience ("Least Burden")
The "Least Burden" for a native mobile user is an **"App Store" style workflow**:

1.  **Browse/Search**: User types "Sci-Fi" or "Wells".
    *   *System*: Queries Gutendex.
    *   *UI*: Displays book covers and titles.
2.  **One-Tap Download**: User taps "Get" (Cloud Icon).
    *   *System*: Downloads the `.epub` file directly to the device's local storage.
    *   *UI*: Shows a progress circle (0% -> 100%).
3.  **Read Offline**: The book moves to "My Library".
    *   *System*: Parses the local EPUB.
    *   *UI*: Opens immediately, even in Airplane Mode.

## 3. Technical Implementation (The Prototype)

### 3.1 Simulating "Native Direct Download" on Web
Native apps can fetch `gutenberg.org` URLs directly. Browsers cannot (CORS).
To prototype this **experience** without building wasteful web infra:

*   **Development**: Use `vite.config.ts` to proxy requests.
    *   App requests: `/api/mirror/123/pg123.epub`
    *   Vite proxies to: `https://gutenberg.org/...`
*   **Production (Web Demo)**: *Limit expectations*. It may only work with a basic CORS proxy like `cors-anywhere` for demo purposes, or we accept it only works locally. **We do not engineer around this.**

### 3.2 The "Native-Ready" Code Structure
We will build a `BookService` adapter that can be swapped out in Swift/Kotlin:

```typescript
// Shared Logic (React)
interface LibraryService {
  search(query: string): Promise<BookMetadata[]>;
  download(bookId: string): Promise<ArrayBuffer>; // The "Native" interface
}

// Web Prototype Implementation
const webLibraryService: LibraryService = {
  download: async (id) => {
    // Uses local proxy to simulate native direct fetch
    const response = await fetch(`/proxy/gutenberg/${id}.epub`);
    return response.arrayBuffer();
  }
}
```

## 4. Why this matches the "Fundamental Piece"
*   **Zero Web Glue**: No Vercel functions, no complex cloud setups.
*   **Portability**: The `ArrayBuffer` -> `EPUB Parser` logic is 100% reusable logic (or logic spec) for Native.
*   **Offline First**: We test the *actual* offline flow (IndexedDB) which maps to Native FileSystem.

## 5. Cover Images & Static Assets

### The problem
Cover images were hotlinked at paint time straight from `gutenberg.org` (`/cache/epub/<id>/pg<id>.cover.medium.jpg`). gutenberg throttles and drops hotlink connections (we measured connection timeouts around 21 seconds), so shelves intermittently painted blank "pages". It is the same fragility as book content, but covers hit it harder: a shelf fires 20 or more image requests at once against a single throttling host.

### Decision: mirror covers to our own static host
This does **not** violate the "no web glue" rule (see the philosophy note above). Mirroring a finite, curated set of images once into static storage is closer to bundling than to a proxy: no compute, no runtime forwarding, just our own optimized copies. So it is allowed.

Pipeline:
1.  **Mirror** — `npm run mirror:covers` (`scripts/mirror-covers.mjs`) reads `src/data/curated.json`, downloads each cover once, optimizes it to a small WebP (about 200px wide, roughly 10KB), and writes `covers/<id>.webp`. It is safe to run again: it skips covers already saved and retries past gutenberg's flakiness. `covers/` is gitignored, since it is a build output uploaded to the host, not shipped inside the app.
2.  **Host** — upload the `covers/` contents to a static host. Options:
    *   jsDelivr off a small GitHub repo: free, global CDN, versioned, no infrastructure to run.
    *   Cloudflare R2: zero egress fees and a custom domain if you want a real bucket.
3.  **Point the app at it** — set `VITE_COVER_BASE` to the URL of the folder that holds the `<id>.webp` files. `src/services/library.ts` then resolves each curated cover to `${VITE_COVER_BASE}/<id>.webp`. Unset (plain local dev) keeps the original gutenberg URL, so nothing breaks without a host configured.

Only the curated catalog is mirrored. Live Gutendex search results keep their gutenberg cover URLs (we cannot mirror 60k+ books) and lean on the fallback.

### Layered resilience
1.  **Hosted covers** for the curated catalog. The primary path; gutenberg leaves the user's path entirely.
2.  **Local cache.** Once fetched, a cover is cached (browser HTTP / Cache API today, native file cache later), so it is offline and instant after the first view.
3.  **Generated cover fallback.** `src/components/Input/BookCover.tsx` renders a styled cover (a framed, label, or solid variant built from the title and author) whenever a remote cover fails to load or stalls past a short deadline, so a card is never blank. This is the universal safety net beneath both hosted and live covers. Cover images load eagerly (not lazily), so that deadline measures real load time instead of firing on covers that are merely off screen.

### Native mapping
This is the same "download once, store on device" model that section 2 defines for book content. In the native app, a cover downloads to the device cache alongside its book (React Native `<Image>` / file cache, or the WebView cache), so owned books always carry their covers offline. Only a browse cover for a book not yet opened can miss, and that degrades to a generated cover.

## 6. Book Content: Mirror, Cache, Serve

### The problem
Book text was streamed from gutenberg.org at the moment the user opened a book, through the dev proxy. We measured this at 7 to 13 seconds per book, regardless of file size (a 99KB book still took 7 seconds), because gutenberg's origin is simply slow and throttling. Nothing was saved after reading, so every first open paid the full wait and nothing worked offline. Front page books only felt fast because they were already sitting in the browser's own cache from earlier opens.

### The insight
The catalog is finite, known ahead of time, and immutable: a public domain text by Gutenberg id never changes. That is exactly the shape of content you prepare once and serve from a fast path, the same decision we already made for covers in §5. So book text follows the cover pattern.

### Pipeline
1. **Mirror** — `npm run mirror:books` (`scripts/mirror-books.mjs`) reads the unique ids across `curated.json` and `vibes.json`, downloads each book once, strips the Gutenberg header, footer, and transcriber credits, and writes `public/books/<id>.txt`. It is resumable (skips books already saved), supports `--vibe=<key>`, `--curated`, `--ids=`, and `--limit=` for partial runs, and writes failures to `_failed.json` to retry. `public/books/` is gitignored, like covers. About 1436 books, roughly 614MB raw.
   *   **Be polite about the source.** gutenberg.org discourages bulk crawling and will block the IP. For a full catalog run, point `BOOK_SOURCE` at an official mirror and keep `BOOK_CONCURRENCY` low. Partial, resumable runs against the main site are fine for small sets.
   *   **Stripping is legally load bearing**, not just a size win. Removing the Project Gutenberg name is what takes the text out of the Gutenberg trademark license (see §7). The same strip lives in `library.ts` as a runtime safety net for live fetches; the two copies are kept in sync by hand.
2. **Serve** — same origin from `/books/<id>.txt` by default (bundled into the build), or from a CDN when `VITE_BOOK_BASE` is set. Immutable content, so it should carry a long cache header.
3. **Point the app at it** — `library.ts` `fetchContent` is now a three tier ladder:
   *   **Tier 1, the device.** `bookCache.ts` keeps every read book in IndexedDB, keyed by id. A reopened book loads in a few milliseconds and works with no connection.
   *   **Tier 2, our mirror.** `${VITE_BOOK_BASE || '/books'}/<id>.txt`, pre stripped and fast (measured at about 9ms same origin). A static host with SPA fallback can answer a missing file with index.html, so the fetch rejects anything that looks like HTML and falls through. Every hit is saved to tier 1.
   *   **Tier 3, gutenberg.** The original proxied stream, only when a book is neither cached nor mirrored. It is stripped once and saved to tier 1 so the next open is instant.
4. **Service worker** — `vite.config.ts` runtime caches `/books` text CacheFirst (the `book-text` cache), the build only secondary layer beneath the IndexedDB cache, so even an unread mirrored book is cached on first view.

### Result
First open of a mirrored book drops from about 8 seconds to well under a second, repeat opens and offline reading are instant, and gutenberg is only ever touched by the build machine or as a last resort.

### Tiering for native (Android)
614MB is trivial on a CDN but too much to ship inside an app. Bundle the hot set on the device (the curated front table plus saved and in progress books, roughly 15 to 30MB) so the home experience is instant and offline on install; pull the long tail from the CDN on first tap and persist it on the device. IndexedDB here maps to the native file system later, behind the same `bookCache` interface.

## 7. Business & Legal Considerations (Charging for Public Domain Books)

We plan to charge for the app, so the content strategy has to hold up commercially. The short version: this is legal and sellable, with conditions. None of the below is legal advice. Have an intellectual property lawyer review the final title list before turning on payments, especially if we sell outside the US.

### The text itself is free to sell
Public domain works have no copyright owner. Anyone may copy, host, modify, and sell them, and we owe no royalty on the content. Selling a reading app built on public domain books is a long established, legitimate model (Serial Reader and many classics apps run on the same texts).

### The Gutenberg trademark is the catch, and stripping it is the escape hatch
"Project Gutenberg" is a registered trademark. The Project Gutenberg License travels with any file that carries their name or header, and that license is restrictive: keep the branding and charge for the book, and you owe the foundation a 20 percent royalty and must ship their full license text. Their own license states that once every reference to Project Gutenberg is removed, what remains is a plain public domain work their license no longer governs.

Consequence for our pipeline: **stripping the Gutenberg boilerplate (header, footer, "Produced by", license block) is legally load bearing, not just a size optimization.** It is what takes us out from under the trademark license and its royalty. Two rules follow:
- Always strip the boilerplate at build time, before serving or bundling a book.
- Never show the words "Project Gutenberg" on the books or in the reading view. Reattaching the name can pull the license back in.

### Real risks to manage
1. **International copyright is the big one.** "Public domain in the US" is not "public domain everywhere." The US line in 2026 is works published in 1930 or earlier, and it advances one year every January. Most other countries use life of the author plus seventy years instead. A title free in the US can still be under copyright in the UK, EU, Canada, or Australia. Selling worldwide through app stores could mean distributing something still protected somewhere, which is the most likely cause of a takedown. Mitigate by curating to authors who died more than seventy years ago (clears most jurisdictions at once), or by restricting availability by region.
2. **Editions, translations, and introductions carry their own copyright.** The original words of a classic are free, but a specific modern translation, introduction, footnotes, or new compilation can be independently copyrighted. Old works and old translations are safe; a recent translation is not. Watch this when hand picking titles.
3. **Server access policy.** Gutenberg discourages bulk automated downloading against the main site and will block the IP. Build the mirror from an official Gutenberg mirror site or the offline bulk collection, at a gentle request rate. This is operational rather than copyright, but it gates the build step.

### Business reality to price around
We cannot get exclusivity on public domain text, so a competitor can legally clone the catalog. The product, not the content, is the moat: the focus reader, the curation and vibes, offline, sync, taste. Price the paid tier as the app and its features, never as access to a specific book.

### Options worth considering
- **Standard Ebooks** as a source or a premium tier: carefully produced, verified public domain editions released under a true no rights reserved dedication (CC0), with no trademark license attached at all. Cleaner provenance for a paid product than raw Gutenberg, though a smaller catalog (around a thousand titles). Can be blended in.
- **Goodwill toward Gutenberg:** not required once stripped, and we keep their name off the product surface, but a donation to their foundation is reasonable given we build on their work.

### Net
Keep the stripping (it frees us from the trademark license), source the mirror politely from a mirror site, curate to titles clearly public domain in the markets we sell to, and sell the experience rather than the catalog. Have an IP lawyer review the final title list before enabling payments; the international piece depends on which countries we ship to.

## 8. Next Steps
1.  **Configure Local Proxy**: Enable `gutenberg.org` access in `vite`. *(done — see `vite.config.ts`)*
2.  **Build "Library" Component**: A simple grid of covers. *(done — `StoreFront`)*
3.  **Mirror & host covers**: Run `npm run mirror:covers`, upload `covers/`, set `VITE_COVER_BASE`.
4.  **Implement Download**: Fetch text/EPUB -> store on device (IndexedDB on web, FileSystem on native), caching the cover alongside it.
5.  **Connect Reader**: Open stored content in the existing Reader engine.
