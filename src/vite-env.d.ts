/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// App version injected by Vite's `define` (see vite.config.ts), shown at the
// bottom of the landing page. Bumped on every deploy.
declare const __APP_VERSION__: string;

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
