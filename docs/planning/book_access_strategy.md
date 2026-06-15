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

## 6. Next Steps
1.  **Configure Local Proxy**: Enable `gutenberg.org` access in `vite`. *(done — see `vite.config.ts`)*
2.  **Build "Library" Component**: A simple grid of covers. *(done — `StoreFront`)*
3.  **Mirror & host covers**: Run `npm run mirror:covers`, upload `covers/`, set `VITE_COVER_BASE`.
4.  **Implement Download**: Fetch text/EPUB -> store on device (IndexedDB on web, FileSystem on native), caching the cover alongside it.
5.  **Connect Reader**: Open stored content in the existing Reader engine.
