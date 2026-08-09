# Serving topology

The one page that describes how book data reaches installed apps. Everything
here was previously reconstructable only from wrangler.toml comments, the
function's comments, and commit messages.

```
Android app (src/config.ts: SERVING_ORIGIN)
  │
  ▼
Cloudflare Pages project "focus-reader"  →  https://focus-reader-48z.pages.dev
  │  production branch: main (deploy script targets it explicitly)
  │  preview: any other branch name (deploy --preview uses audit-preview)
  │
  ├── static assets (dist/, max 20k files — why the long tail is NOT here)
  │     /books/<id>.txt      1,401 curated texts (hot set)
  │     /covers/<id>.webp    1,468 covers
  │     /starts-v1.json      54,525 deep-catalog story starts (filename IS the version)
  │     caching + CORS: public/_headers
  │
  └── Pages Function  functions/books/[id].js   (only function)
        static asset first (ASSETS.fetch, SPA-fallback content sniff),
        else R2 bucket "focus-reader-books" key books/<id>.txt
        54 gate-rejected books exist ONLY as static assets (see function header)
        sets immutable cache + Access-Control-Allow-Origin on R2 responses

R2 bucket "focus-reader-books"  (binding BOOKS in wrangler.toml)
  books/<id>.txt   55,863 long-tail texts, ~19 GB
  uploaded via scripts/upload-r2.mjs (keys in .r2.env at repo root)
  rebuild source: mirror/books on Michael's machine (backup: docs/BACKUP.md)
```

## The three URLs shipped inside APKs

`Focus Reader Android/src/config.ts` is the single owner: BOOK_BASE,
COVER_BASE, STARTS_URL, all derived from SERVING_ORIGIN. Before the first
public APK, front the Pages project with a custom domain we own and change
SERVING_ORIGIN once (installed apps cannot be re-pointed afterward).

## Operations

| Task | Command |
|---|---|
| Deploy (production) | `npm run deploy` (guarded: refuses without books/covers/starts in dist) |
| Deploy (preview) | `node scripts/deploy-pages.mjs --preview` |
| Upload new/changed long-tail books | `npm run upload:r2 -- --changed` (or `--all`, `--ids=`) |
| Re-verify strip copies | `npm run check:strip` |

Every production deploy replaces the whole static surface for installed
apps; that is why the content guard exists and why infra changes should go
through a preview deploy first.
