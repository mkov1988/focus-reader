/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * Base URL of the static host that serves mirrored book covers (one
     * `<id>.webp` per curated book). Unset = hotlink gutenberg.org directly
     * (fine for local dev). See `npm run mirror:covers` and library.ts.
     */
    readonly VITE_COVER_BASE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
