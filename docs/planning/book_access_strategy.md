# Strategy: Accessing 60k Free Books (Native-First Design)

## Core Philosophy
**The Web App is a High-Fidelity Prototype ("Living Spec") for the future Native App.**
We will not build web-specific infrastructure (like serverless CORS proxies) for production. We will simply **simulate** the native behavior locally.

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

## 5. Next Steps
1.  **Configure Local Proxy**: Enable `gutenberg.org` access in `vite`.
2.  **Build "Library" Component**: A simple grid of covers.
3.  **Implement Download**: Fetch EPUB -> Store in IndexedDB.
4.  **Connect Reader**: Open stored EPUB in the existing Reader engine.
